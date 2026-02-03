const crypto = require("crypto");
const pool = require("../db");

async function paystackWebhook(req, res) {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    // Verify signature
    const hash = crypto.createHmac("sha512", secret)
      .update(req.body)
      .digest("hex");
    const signature = req.headers["x-paystack-signature"];

    if (hash !== signature) {
      console.log("Invalid Paystack signature");
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(req.body.toString());

    // Debug
    console.log("Paystack event:", event.event, event.data.reference);

    if (event.event === "charge.success") {
      const metadata = event.data.metadata || {};
      const { user_id, room_id } = metadata;

      // Grant room access
      if (room_id && user_id) {
        await pool.query(
          `INSERT INTO room_access (room_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [room_id, user_id]
        );
      }

      const reference = event.data.reference; // tx id
      const amountPaid = event.data.amount / 100;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const txRes = await client.query(
          "SELECT * FROM transactions WHERE id=$1 FOR UPDATE",
          [reference]
        );

        if (txRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.sendStatus(200);
        }

        const tx = txRes.rows[0];

        if (tx.status === "success") {
          await client.query("ROLLBACK");
          return res.sendStatus(200);
        }

        // Mark transaction success
        await client.query(
          "UPDATE transactions SET status='success', updated_at=now() WHERE id=$1",
          [reference]
        );

        // Credit wallet
        await client.query(
          "UPDATE wallets SET balance = balance + $1, updated_at=now() WHERE user_id=$2",
          [amountPaid, tx.user_id]
        );

        await client.query("COMMIT");
        console.log("Wallet credited:", tx.user_id, amountPaid);

      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Transaction error:", err);
      } finally {
        client.release();
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
}

module.exports = { paystackWebhook };
