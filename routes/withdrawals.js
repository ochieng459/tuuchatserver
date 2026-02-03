const express = require("express");
const router = express.Router();
const { requestWithdrawal, processWithdrawal } = require("../controllers/withdrawController");

// creator requests payout
router.post("/request", requestWithdrawal);

// admin triggers payout
router.post("/process/:withdrawal_id", processWithdrawal);

module.exports = router;
