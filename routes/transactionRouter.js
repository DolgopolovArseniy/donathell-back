const express = require('express');
const transactionController = require('../controllers/transactionController');
const authController = require('../controllers/authController');

const router = express.Router();

router
  .route('/')
  .get(authController.protect, transactionController.getUserTransactions)
  .post(transactionController.createTransaction);

router
  .route('/stream')
  .get(authController.protect, transactionController.connectToStream);

router
  .route('/stats')
  .get(authController.protect, transactionController.getDashboardStats);

module.exports = router;
