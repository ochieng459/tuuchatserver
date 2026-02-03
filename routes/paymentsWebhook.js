const express = require("express");
const router = express.Router();
const { paystackWebhook } = require("../controllers/paymentsWebhookController");

router.post("/", paystackWebhook);

module.exports = router;
