const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('./../utils/catchAsync');
const jwt = require('jsonwebtoken');
const { promisify } = require('util');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res) => {
  const newUser = await User.create({
    username: req.body.username,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    donationSlug: `${req.body.username}-donate`,
  });

  newUser.__v = undefined;

  createSendToken(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { password, loginIdentifier } = req.body;

  if (!loginIdentifier || !password) {
    return next(
      new AppError('Please provide username/email and password', 400)
    );
  }

  const user = await User.findOne({
    $or: [{ username: loginIdentifier }, { email: loginIdentifier }],
  }).select('+password');

  user.__v = undefined;

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect username/email or password', 400));
  }

  createSendToken(user, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return next(new AppError('You are not logged in', 401));
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  const currentUser = await User.findById(decoded.id).select('-__v');

  if (!currentUser) {
    return next(new AppError('User no longer exist', 401));
  }

  req.user = currentUser;

  next();
});
