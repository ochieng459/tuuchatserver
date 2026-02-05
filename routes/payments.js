const express = require("express");
const router = express.Router();

const { initDepositCheckout } = require("../controllers/paymentsController");

router.post("/deposit/init", initDepositCheckout);

module.exports = router;

