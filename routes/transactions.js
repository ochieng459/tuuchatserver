const express = require("express");
const router = express.Router();
const {
  createDepositTransaction,
  markTransactionSuccess,
  getUserTransactions
} = require("../controllers/transactionsController");

router.post("/deposit", createDepositTransaction);
router.post("/:id/success", markTransactionSuccess);
router.get("/user/:user_id", getUserTransactions);

module.exports = router;
