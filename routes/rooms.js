const express = require("express");
const router = express.Router();
const { payForRoom, checkRoomAccess } = require("../controllers/roomsController");
const { getRoom } = require("../controllers/privateRoomsController");

// 1️⃣ Pay for room
router.post("/pay", payForRoom);

// 2️⃣ Check room access — must come BEFORE /:id
router.get("/:room_id/access/:user_id", checkRoomAccess);

// 3️⃣ Fetch room info — generic /:id route
router.get("/:id", getRoom);

module.exports = router;
