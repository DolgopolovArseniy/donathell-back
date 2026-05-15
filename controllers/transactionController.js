const Transaction = require('../models/transactionModel');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
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
