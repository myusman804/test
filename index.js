const express = require("express");
const connectDB = require("./config/db");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

app.use(express.json()); // Middleware to parse JSON

// Routes
const authRoutes = require("./routes/authRoute");
const referralRoutes = require("./routes/referralRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/referral", referralRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "AdsMoney API is running",
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
