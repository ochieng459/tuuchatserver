// controllers/withdrawController.js
const pool = require("../db");
const axios = require("axios");

// ✅ Creator requests payout (deduct from wallet & create withdrawal record)
async function requestWithdrawal(req, res) {
  const { creator_id, amount } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const walletRes = await client.query(
      "SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE",
      [creator_id]
    );
    if (!walletRes.rows.length) throw new Error("Wallet not found");

    const walletBalance = parseFloat(walletRes.rows[0].balance);
    if (walletBalance < amount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // deduct wallet
    await client.query(
      "UPDATE wallets SET balance = balance - $1, updated_at=now() WHERE user_id=$2",
      [amount, creator_id]
    );

    // get phone number
    const profileRes = await pool.query(
      "SELECT phone_number FROM profiles WHERE id=$1",
      [creator_id]
    );
    if (!profileRes.rows.length || !profileRes.rows[0].phone_number) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Creator phone number not set" });
    }

    const phoneNumber = profileRes.rows[0].phone_number;

    // insert withdrawal
    const withdrawRes = await client.query(
      `INSERT INTO creator_withdrawals
       (creator_id, amount, phone_number, status, created_at)
       VALUES ($1, $2, $3, 'pending', now())
       RETURNING *`,
      [creator_id, amount, phoneNumber]
    );

    await client.query("COMMIT");
    res.json({ success: true, withdrawal: withdrawRes.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
}

// ✅ Admin / worker triggers actual Paystack transfer
async function processWithdrawal(req, res) {
  const { withdrawal_id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const withdrawalRes = await client.query(
      "SELECT * FROM creator_withdrawals WHERE id=$1 FOR UPDATE",
      [withdrawal_id]
    );

    if (!withdrawalRes.rows.length) throw new Error("Withdrawal not found");

    const w = withdrawalRes.rows[0];
    if (w.status !== "pending") throw new Error("Already processed");

    // Call Paystack Transfer API
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

    const response = await axios.post(
      "https://api.paystack.co/transfer",
      {
        source: "balance",
        amount: Math.round(w.amount * 100), // in kobo
        recipient: w.phone_number,
        reason: `Tuuchat room earnings ${w.id}`,
        currency: "KES"
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // update withdrawal record
    await client.query(
      "UPDATE creator_withdrawals SET status='success', paystack_transfer_code=$1, updated_at=now() WHERE id=$2",
      [response.data.data.transfer_code, withdrawal_id]
    );

    await client.query("COMMIT");
    res.json({ success: true, message: "Withdrawal processed", data: response.data.data });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err.response?.data || err.message);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
}

module.exports = { requestWithdrawal, processWithdrawal };
