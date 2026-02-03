const pool = require("../db");

// Create deposit transaction (before payment gateway)
const createDepositTransaction = async (req, res) => {
  const { user_id, amount, payment_ref } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO transactions (user_id, type, amount, payment_ref, status)
       VALUES ($1, 'deposit', $2, $3, 'pending')
       RETURNING *`,
      [user_id, amount, payment_ref]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating deposit transaction" });
  }
};

// Mark transaction success (trigger updates wallet automatically)
const markTransactionSuccess = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE transactions
       SET status='success', updated_at=now()
       WHERE id=$1
       RETURNING *`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating transaction" });
  }
};

// Get user transactions
const getUserTransactions = async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM transactions WHERE user_id=$1 ORDER BY created_at DESC",
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Error fetching transactions" });
  }
};

module.exports = {
  createDepositTransaction,
  markTransactionSuccess,
  getUserTransactions
};
