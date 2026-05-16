const { default: mongoose } = require('mongoose');
const Transaction = require('../models/transactionModel');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { getExchangeRates } = require('../utils/getExchangeRates');
const { pub, sub } = require('../utils/redis');

exports.getUserTransactions = catchAsync(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = 7;
  const skip = (page - 1) * limit;

  const { currency, from, dateFrom, dateTo, minAmount, maxAmount } = req.query;

  const filter = {};

  if (currency) filter.currency = currency;

  if (from) filter.from = from;

  if (dateFrom || dateTo) {
    filter.transactionDate = {};
    if (dateFrom) filter.transactionDate.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.transactionDate.$lte = end;
    }
  }

  if (minAmount || maxAmount) {
    filter.amount = {};
    if (minAmount) filter.amount.$gte = Number(minAmount);
    if (maxAmount) filter.amount.$lte = Number(maxAmount);
  }

  const total = await Transaction.countDocuments({
    to: req.user._id,
    transactionStatus: 'completed',
    ...filter,
  });

  const transactions = await Transaction.find({
    to: req.user._id,
    transactionStatus: 'completed',
    ...filter,
  })
    .skip(skip)
    .limit(limit)
    .select('-__v')
    .sort('-transactionDate');

  res.status(200).json({
    status: 'success',
    results: transactions.length,
    total,
    data: {
      transactions,
    },
  });
});

exports.connectToStream = catchAsync(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const channel = `donations:${req.user._id}`;

  const handleMessage = (channelName, message) => {
    if (channelName === channel) {
      res.write(`data: ${message}\n\n`);
    }
  };

  await sub.subscribe(channel);

  sub.on('message', handleMessage);

  req.on('close', async () => {
    sub.removeListener('message', handleMessage);
    await sub.unsubscribe(channel);
    res.end();
  });
});

exports.createTransaction = catchAsync(async (req, res, next) => {
  const { slug, currency, from, message, amount } = req.body;

  const recipient = await User.findOne({ donationSlug: slug });

  if (!recipient) {
    return next(new AppError('Recipient not found', 404));
  }

  const transaction = await Transaction.create({
    amount,
    currency,
    from,
    message,
    transactionStatus: 'completed',
    to: recipient._id,
  });

  transaction.__v = undefined;

  pub.publish(`donations:${recipient._id}`, JSON.stringify(transaction));

  res.status(201).json({
    status: 'success',
    data: {
      transaction,
    },
  });
});

exports.getDashboardStats = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { range } = req.query;

  const rates = await getExchangeRates();

  let dateLimit;
  let formatString;
  const now = new Date();

  if (range === '1d') {
    dateLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    formatString = '%H:00';
  } else if (range === '7d') {
    dateLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    formatString = '%Y-%m-%d';
  } else {
    dateLimit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    formatString = '%m-%d';
  }

  const cryptoCurrencies = ['BTC', 'ETH', 'SOL', 'USDT'];

  const stats = await Transaction.aggregate([
    {
      $match: {
        to: new mongoose.Types.ObjectId(userId),
        transactionStatus: 'completed',
      },
    },
    {
      $facet: {
        cryptoBalances: [
          { $match: { currency: { $in: cryptoCurrencies } } },
          {
            $project: {
              currency: 1,
              amount: 1,
              usdValue: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$currency', 'BTC'] },
                      then: { $multiply: ['$amount', rates.BTC] },
                    },
                    {
                      case: { $eq: ['$currency', 'ETH'] },
                      then: { $multiply: ['$amount', rates.ETH] },
                    },
                    {
                      case: { $eq: ['$currency', 'SOL'] },
                      then: { $multiply: ['$amount', rates.SOL] },
                    },
                    {
                      case: { $eq: ['$currency', 'USDT'] },
                      then: { $multiply: ['$amount', rates.USDT] },
                    },
                  ],
                  default: '$amount',
                },
              },
            },
          },
          {
            $group: {
              _id: '$currency',
              amount: { $sum: '$amount' },
              convertedAmount: { $sum: '$usdValue' },
            },
          },
          {
            $project: {
              _id: 0,
              currency: '$_id',
              amount: 1,
              convertedAmount: 1,
            },
          },
        ],
        fiatBalances: [
          { $match: { currency: { $nin: cryptoCurrencies } } },
          {
            $project: {
              currency: 1,
              amount: 1,
              usdValue: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$currency', 'USD'] },
                      then: { $multiply: ['$amount', rates.USD] },
                    },
                    {
                      case: { $eq: ['$currency', 'EUR'] },
                      then: { $multiply: ['$amount', rates.EUR] },
                    },
                    {
                      case: { $eq: ['$currency', 'UAH'] },
                      then: { $multiply: ['$amount', rates.UAH] },
                    },
                  ],
                  default: '$amount',
                },
              },
            },
          },
          {
            $group: {
              _id: '$currency',
              amount: { $sum: '$amount' },
              convertedAmount: { $sum: '$usdValue' },
            },
          },
          {
            $project: {
              _id: 0,
              currency: '$_id',
              amount: 1,
              convertedAmount: 1,
            },
          },
        ],
        cryptoDistribution: [
          { $match: { currency: { $in: cryptoCurrencies } } },
          {
            $project: {
              currency: 1,
              amount: 1,
              usdValue: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$currency', 'BTC'] },
                      then: { $multiply: ['$amount', rates.BTC] },
                    },
                    {
                      case: { $eq: ['$currency', 'ETH'] },
                      then: { $multiply: ['$amount', rates.ETH] },
                    },
                    {
                      case: { $eq: ['$currency', 'SOL'] },
                      then: { $multiply: ['$amount', rates.SOL] },
                    },
                    {
                      case: { $eq: ['$currency', 'USDT'] },
                      then: { $multiply: ['$amount', rates.USDT] },
                    },
                  ],
                  default: '$amount',
                },
              },
            },
          },
          {
            $group: {
              _id: '$currency',
              totalAmount: { $sum: '$amount' },
              totalUsd: { $sum: '$usdValue' },
            },
          },
          {
            $project: {
              _id: 0,
              name: '$_id',
              value: '$totalAmount',
              convertedValue: '$totalUsd',
            },
          },
        ],
        fiatDistribution: [
          { $match: { currency: { $nin: cryptoCurrencies } } },
          {
            $project: {
              currency: 1,
              amount: 1,
              usdValue: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$currency', 'UAH'] },
                      then: { $multiply: ['$amount', rates.UAH] },
                    },
                    {
                      case: { $eq: ['$currency', 'USD'] },
                      then: { $multiply: ['$amount', rates.USD] },
                    },
                    {
                      case: { $eq: ['$currency', 'EUR'] },
                      then: { $multiply: ['$amount', rates.EUR] },
                    },
                  ],
                  default: '$amount',
                },
              },
            },
          },
          {
            $group: {
              _id: '$currency',
              totalAmount: { $sum: '$amount' },
              totalUsd: { $sum: '$usdValue' },
            },
          },
          {
            $project: {
              _id: 0,
              name: '$_id',
              value: '$totalAmount',
              convertedValue: '$totalUsd',
            },
          },
        ],
        topDonors: [
          {
            $project: {
              from: 1,
              amount: 1,
              usdValue: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$currency', 'BTC'] },
                      then: { $multiply: ['$amount', rates.BTC] },
                    },
                    {
                      case: { $eq: ['$currency', 'ETH'] },
                      then: { $multiply: ['$amount', rates.ETH] },
                    },
                    {
                      case: { $eq: ['$currency', 'SOL'] },
                      then: { $multiply: ['$amount', rates.SOL] },
                    },
                    {
                      case: { $eq: ['$currency', 'USDT'] },
                      then: { $multiply: ['$amount', rates.USDT] },
                    },
                    {
                      case: { $eq: ['$currency', 'USD'] },
                      then: { $multiply: ['$amount', rates.USD] },
                    },
                    {
                      case: { $eq: ['$currency', 'EUR'] },
                      then: { $multiply: ['$amount', rates.EUR] },
                    },
                    {
                      case: { $eq: ['$currency', 'UAH'] },
                      then: { $multiply: ['$amount', rates.UAH] },
                    },
                  ],
                  default: '$amount',
                },
              },
            },
          },
          {
            $group: {
              _id: '$from',
              totalAmount: { $sum: '$amount' },
              totalUsd: { $sum: '$usdValue' },
            },
          },
          { $sort: { totalUsd: -1 } },
          { $limit: 5 },
          {
            $project: {
              _id: 0,
              name: '$_id',
              amount: '$totalAmount',
              convertedValue: '$totalUsd',
            },
          },
        ],
        chartData: [
          { $match: { transactionDate: { $gte: dateLimit } } },
          {
            $project: {
              transactionDate: 1,
              usdValue: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$currency', 'BTC'] },
                      then: { $multiply: ['$amount', rates.BTC] },
                    },
                    {
                      case: { $eq: ['$currency', 'ETH'] },
                      then: { $multiply: ['$amount', rates.ETH] },
                    },
                    {
                      case: { $eq: ['$currency', 'SOL'] },
                      then: { $multiply: ['$amount', rates.SOL] },
                    },
                    {
                      case: { $eq: ['$currency', 'USDT'] },
                      then: { $multiply: ['$amount', rates.USDT] },
                    },
                    {
                      case: { $eq: ['$currency', 'EUR'] },
                      then: { $multiply: ['$amount', rates.EUR] },
                    },
                    {
                      case: { $eq: ['$currency', 'UAH'] },
                      then: { $multiply: ['$amount', rates.UAH] },
                    },
                  ],
                  default: '$amount',
                },
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: formatString,
                  date: '$transactionDate',
                  timezone: 'UTC',
                },
              },
              amount: { $sum: '$usdValue' },
            },
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, time: '$_id', amount: 1 } },
        ],
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: stats[0],
  });
});
