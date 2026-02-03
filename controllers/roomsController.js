// controllers/roomsController.js
const pool = require("../db");

async function payForRoom(req, res) {
  const { user_id, room_id } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 🔒 lock buyer wallet
    const walletRes = await client.query(
      "SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE",
      [user_id]
    );

    if (walletRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Wallet not found" });
    }

    const walletBalance = parseFloat(walletRes.rows[0].balance);

    // 📦 get room info + creator
    const roomRes = await client.query(
      "SELECT price, created_by FROM private_rooms WHERE id=$1",
      [room_id]
    );

    if (roomRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Room not found" });
    }

    const price = parseFloat(roomRes.rows[0].price);
    const creatorId = roomRes.rows[0].created_by;

    // 🚫 creator cannot pay own room
    if (creatorId === user_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Creator cannot pay own room" });
    }

    // 🚫 prevent double payment
    const existingAccess = await client.query(
      "SELECT 1 FROM room_access WHERE user_id=$1 AND room_id=$2 AND status='active'",
      [user_id, room_id]
    );

    if (existingAccess.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Already has access" });
    }

    // 💰 check balance
    if (walletBalance < price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // 🧮 split
    const creatorShare = +(price * 0.8).toFixed(2);
    const platformShare = +(price * 0.2).toFixed(2);

    // ➖ deduct buyer
    await client.query(
      "UPDATE wallets SET balance = balance - $1, updated_at=now() WHERE user_id=$2",
      [price, user_id]
    );

    // ➕ credit creator
    await client.query(
      "UPDATE wallets SET balance = balance + $1, updated_at=now() WHERE user_id=$2",
      [creatorShare, creatorId]
    );

    // ➕ credit platform
    await client.query(
      "UPDATE wallets SET balance = balance + $1, updated_at=now() WHERE user_id=$2",
      [platformShare, process.env.PLATFORM_USER_ID]
    );

    // 🧾 creator earning record
    await client.query(
      `INSERT INTO transactions
       (user_id, type, amount, status, description, created_at)
       VALUES ($1, 'room_earning', $2, 'success', $3, now())`,
      [creatorId, creatorShare, `Room earning ${room_id}`]
    );

    // 🧾 platform fee record
    await client.query(
      `INSERT INTO transactions
       (user_id, type, amount, status, description, created_at)
       VALUES ($1, 'platform_fee', $2, 'success', $3, now())`,
      [process.env.PLATFORM_USER_ID, platformShare, `Room fee ${room_id}`]
    );

    // 🔓 grant access
    await client.query(
      `INSERT INTO room_access
       (id, user_id, room_id, amount, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active', now())`,
      [user_id, room_id, price]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Room access granted",
      split: {
        creator: creatorShare,
        platform: platformShare
      }
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
}

// ✅ unchanged
async function checkRoomAccess(req, res) {
  const { room_id, user_id } = req.params;

  try {
    const accessRes = await pool.query(
      "SELECT 1 FROM room_access WHERE room_id=$1 AND user_id=$2 AND status='active'",
      [room_id, user_id]
    );

    res.json({ has_access: accessRes.rows.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
}

module.exports = { payForRoom, checkRoomAccess };
