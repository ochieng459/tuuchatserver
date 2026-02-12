

const axios = require("axios");
const crypto = require("crypto");
const pool = require("../db");

async function initDepositCheckout(req, res) {
  const { user_id, amount, email, room_id } = req.body;

  if (!user_id || !amount || !email) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    const amountFloat = parseFloat(amount);
    if (!Number.isFinite(amountFloat) || amountFloat <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // 1️⃣ Create pending transaction
    const txRes = await pool.query(
      `INSERT INTO transactions (user_id, type, amount, status, created_at)
       VALUES ($1, 'deposit', $2, 'pending', now())
       RETURNING id`,
      [user_id, amountFloat]
    );

    const txId = txRes.rows[0].id;
    const callbackBase = process.env.PAYSTACK_CALLBACK_URL;
    let callbackUrl;
    if (callbackBase) {
      const url = new URL(callbackBase);
      url.searchParams.set("reference", txId);
      if (room_id) {
        url.searchParams.set("room_id", room_id);
      }
      url.searchParams.set("user_id", user_id);
      callbackUrl = url.toString();
    }

    // 2️⃣ Paystack init
    const paystackRes = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(amountFloat * 100),
        reference: txId,
        metadata: {
          user_id,
          room_id,   // ✅ add this
          tx_id: txId,
        },
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
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

//
// ✅ ADD THIS — WEBHOOK
//
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

    if (event.event === "charge.success") {
      const data = event.data;
      const reference = data.reference;

      // mark transaction success
      await pool.query(
        `UPDATE transactions SET status='success' WHERE id=$1`,
        [reference]
      );

      const userId = data.metadata?.user_id;
      const roomId = data.metadata?.room_id;

      // grant room access
      if (userId && roomId) {
        await pool.query(
          `INSERT INTO room_access (user_id, room_id, granted_at)
           VALUES ($1,$2,now())
           ON CONFLICT DO NOTHING`,
          [userId, roomId]
        );
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
}

module.exports = {
  initDepositCheckout
};
