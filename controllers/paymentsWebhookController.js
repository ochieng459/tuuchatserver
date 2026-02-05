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

        // Room payment flow
        if (room_id && user_id) {
          const roomRes = await client.query(
            "SELECT price, created_by FROM private_rooms WHERE id=$1",
            [room_id]
          );

          if (roomRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.sendStatus(200);
          }

          const price = parseFloat(roomRes.rows[0].price);
          const creatorId = roomRes.rows[0].created_by;

          // Optional safety check: make sure paid amount covers price
          if (amountPaid < price) {
            await client.query("ROLLBACK");
            return res.sendStatus(200);
          }

          const creatorShare = +(price * 0.8).toFixed(2);
          const platformShare = +(price * 0.2).toFixed(2);

          // Credit creator wallet (upsert)
          const creatorUpdate = await client.query(
            "UPDATE wallets SET balance = balance + $1, updated_at=now() WHERE user_id=$2",
            [creatorShare, creatorId]
          );
          if (creatorUpdate.rowCount === 0) {
            await client.query(
              "INSERT INTO wallets (user_id, balance) VALUES ($1, $2)",
              [creatorId, creatorShare]
            );
          }

          // Credit platform wallet (upsert)
          const platformUserId = process.env.PLATFORM_USER_ID;
          const platformUpdate = await client.query(
            "UPDATE wallets SET balance = balance + $1, updated_at=now() WHERE user_id=$2",
            [platformShare, platformUserId]
          );
          if (platformUpdate.rowCount === 0) {
            await client.query(
              "INSERT INTO wallets (user_id, balance) VALUES ($1, $2)",
              [platformUserId, platformShare]
            );
          }

          // Transaction records
          await client.query(
            `INSERT INTO transactions
             (user_id, type, amount, status, description, created_at)
             VALUES ($1, 'room_earning', $2, 'success', $3, now())`,
            [creatorId, creatorShare, `Room earning ${room_id}`]
          );

          await client.query(
            `INSERT INTO transactions
             (user_id, type, amount, status, description, created_at)
             VALUES ($1, 'platform_fee', $2, 'success', $3, now())`,
            [platformUserId, platformShare, `Room fee ${room_id}`]
          );

          // Grant room access
          await client.query(
            `INSERT INTO room_access (room_id, user_id, amount, status, created_at)
             VALUES ($1, $2, $3, 'active', now())
             ON CONFLICT DO NOTHING`,
            [room_id, user_id, price]
          );
        } else {
          // Fallback: credit user wallet for non-room deposit
          await client.query(
            "UPDATE wallets SET balance = balance + $1, updated_at=now() WHERE user_id=$2",
            [amountPaid, tx.user_id]
          );
        }

        await client.query("COMMIT");
        console.log("Payment processed:", reference);

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
