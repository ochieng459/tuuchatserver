const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");

const walletsRouter = require("./routes/wallets");
const transactionsRouter = require("./routes/transactions");
const roomsRouter = require("./routes/rooms");
//const cors = require("cors")

const app = express();



//test
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://tuuchat.netlify.app"
    ],
  })
);


// ✅ Webhook raw parser FIRST (before json parser)
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// ✅ Then normal JSON parser
app.use(express.json());

app.use("/api/wallets", walletsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/payments", require("./routes/payments"));
app.use("/api/payments/webhook", require("./routes/paymentsWebhook"));
app.use("/api/withdrawals", require("./routes/withdrawals"));



// ✅ DB test route
app.get("/test-db", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW()");
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Tuuchat server running on port ${PORT}`);
});
