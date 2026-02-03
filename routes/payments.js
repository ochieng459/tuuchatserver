const express = require("express");
const router = express.Router();

const {
  initDepositCheckout,
  paystackWebhook
} = require("../controllers/paymentsController");

router.post("/deposit/init", initDepositCheckout);

// ✅ ADD THIS
router.post("/webhook/paystack", paystackWebhook);

module.exports = router;

