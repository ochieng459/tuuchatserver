const axios = require("axios");
const crypto = require("crypto");
const pool = require("../db");

// ---------------- Initialize deposit ----------------
async function initDepositCheckout(req, res) {
  const { user_id, amount, email, room_id } = req.body;

  if (!user_id || !amount || !email || !room_id) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    const amountFloat = parseFloat(amount);

    // 1️⃣ Create pending transaction
    const txRes = await pool.query(
      `INSERT INTO transactions (user_id, type, amount, status, created_at)
       VALUES ($1, 'deposit', $2, 'pending', now())
       RETURNING id`,
      [user_id, amountFloat]
    );
    const txId = txRes.rows[0].id;

    // 2️⃣ Initialize Paystack payment
    const paystackRes = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(amountFloat * 100),
        reference: txId,
        metadata: { user_id, room_id, tx_id: txId },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      checkout_url: paystackRes.data.data.authorization_url,
      reference: txId,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ message: "Payment init failed" });
  }
}

// ---------------- Paystack webhook ----------------
async function paystackWebhook(req, res) {
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.sendStatus(401);
    }

    const event = req.body;
    if (event.event !== "charge.success") {
      return res.sendStatus(200); // ignore other events
    }

    const data = event.data;
    const reference = data.reference;
    const userId = data.metadata?.user_id;
    const roomId = data.metadata?.room_id;

    if (!userId || !roomId) return res.sendStatus(400);

    // ✅ Mark transaction as success
    await pool.query(
      `UPDATE transactions SET status='success' WHERE id=$1`,
      [reference]
    );

    // ✅ Fetch room price & creator
    const roomRes = await pool.query(
      `SELECT price, creator_id FROM private_rooms WHERE id=$1`,
      [roomId]
    );
    if (roomRes.rows.length === 0) return res.sendStatus(404);

    const { price, creator_id } = roomRes.rows[0];

    // ✅ Split amount 80/20
    const platformAmount = price * 0.2;
    const creatorAmount = price * 0.8;

    // ✅ Update wallets
    await pool.query(
      `UPDATE wallets
       SET balance = balance + $1
       WHERE user_id = $2`,
      [platformAmount, process.env.PLATFORM_USER_ID] // platform wallet
    );

    await pool.query(
      `UPDATE wallets
       SET balance = balance + $1
       WHERE user_id = $2`,
      [creatorAmount, creator_id]
    );

    // ✅ Grant room access
    await pool.query(
      `INSERT INTO room_access (user_id, room_id, granted_at)
       VALUES ($1, $2, now())
       ON CONFLICT DO NOTHING`,
      [userId, roomId]
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
}

module.exports = {
  initDepositCheckout,
  paystackWebhook
};
