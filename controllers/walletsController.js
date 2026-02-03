const pool = require("../db");

// Get wallet
const getWallet = async (req, res) => {
  const { user_id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM wallets WHERE user_id=$1", [user_id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Wallet not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Create wallet
const createWallet = async (req, res) => {
  const { user_id } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO wallets (user_id, balance) VALUES ($1, 0) RETURNING *",
      [user_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getWallet, createWallet };
