const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const connectDB = require("./config/db");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { generalLimiter } = require("./middleware/rateLimiter");
require("dotenv").config();

const app = express();

// Connect to MongoDB
connectDB();

app.use(helmet()); // Security headers
app.use(morgan("combined")); // Logging
app.use(generalLimiter); // Rate limiting

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.FRONTEND_URL,
      "http://localhost:3000",
      "http://localhost:3001",
      "http://192.168.85.122:3000",
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" })); // Body parser with size limit
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const authRoutes = require("./routes/authRoutes");
const referralRoutes = require("./routes/referralRoutes");

console.log("[v0] Registering auth routes...");
app.use("/api/auth", authRoutes);
console.log("[v0] Auth routes registered at /api/auth");

console.log("[v0] Registering referral routes...");
app.use("/api/referral", referralRoutes);
console.log("[v0] Referral routes registered at /api/referral");

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "AdsMoney API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    database: "Connected",
  });
});

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "AdsMoney API v1.0.0",
    endpoints: {
      auth: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login",
        verifyOTP: "POST /api/auth/verify-otp",
        resendOTP: "POST /api/auth/resend-otp",
        dashboard: "GET /api/auth/dashboard",
        logout: "POST /api/auth/logout",
      },
      referral: {
        stats: "GET /api/referral/stats",
        history: "GET /api/referral/history",
        analytics: "GET /api/referral/analytics",
        verify: "GET /api/referral/verify/:code",
        leaderboard: "GET /api/referral/leaderboard",
      },
    },
    documentation: "Visit /api for endpoint details",
  });
});

app.get("/api/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods),
      });
    } else if (middleware.name === "router") {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path:
              middleware.regexp.source
                .replace("\\/?(?=\\/|$)", "")
                .replace(/\\\//g, "/") + handler.route.path,
            methods: Object.keys(handler.route.methods),
          });
        }
      });
    }
  });
  res.json({
    success: true,
    routes: routes,
  });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🌐 API Documentation: http://localhost:${PORT}/api`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

module.exports = app;
