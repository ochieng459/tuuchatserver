const express = require("express");
const router = express.Router();
const { getWallet, createWallet } = require("../controllers/walletsController");

// Get wallet by user
router.get("/:user_id", getWallet);

// Create wallet (for new users)
router.post("/", createWallet);

module.exports = router;
