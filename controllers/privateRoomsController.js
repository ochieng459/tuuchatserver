const pool = require("../db");

async function getRoom(req, res) {
  const { id } = req.params;

  try {
    const roomRes = await pool.query(
      `SELECT r.id, r.name, r.description, r.price, r.image_url,
              p.username AS creator_username, p.avatar_url AS creator_avatar
       FROM private_rooms r
       JOIN profiles p ON r.created_by = p.id
       WHERE r.id = $1`,
      [id]
    );

    if (roomRes.rows.length === 0) {
      return res.status(404).json({ message: "Room not found" });
    }

    res.json(roomRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getRoom };
