const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const { connectDB, checkDBHealth } = require("./config/db");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { generalLimiter } = require("./middleware/rateLimiter");

// Load environment variables
require("dotenv").config();

// Validate required environment variables
const requiredEnvVars = ["JWT_SECRET", "MONGO_URL", "EMAIL_USER", "EMAIL_PASS"];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    "❌ Missing required environment variables:",
    missingEnvVars.join(", ")
  );
  console.error(
    "Please check your .env file and ensure all required variables are set."
  );
  process.exit(1);
}

const app = express();

// Trust proxy if behind reverse proxy (for rate limiting)
app.set("trust proxy", 1);

// Security and performance middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

app.use(compression()); // Compress responses
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(generalLimiter); // Apply rate limiting

// CORS configuration with better security
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.FRONTEND_URL,
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      // Add your production domains here
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS policy"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Body parsing middleware with size limits
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        res.status(400).json({
          success: false,
          message: "Invalid JSON format",
        });
        throw new Error("Invalid JSON");
      }
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// Connect to MongoDB
connectDB();

// Import routes
const authRoutes = require("./routes/authRoutes");
const referralRoutes = require("./routes/referralRoutes");

// API Routes
console.log("🔗 Registering API routes...");

app.use("/api/auth", authRoutes);
console.log("✅ Auth routes registered at /api/auth");

app.use("/api/referral", referralRoutes);
console.log("✅ Referral routes registered at /api/referral");

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const dbHealth = await checkDBHealth();
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();

    const healthData = {
      success: true,
      message: "AdsMoney API is running smoothly",
      version: "2.0.0",
      timestamp,
      uptime: {
        seconds: uptime,
        human: `${Math.floor(uptime / 3600)}h ${Math.floor(
          (uptime % 3600) / 60
        )}m ${Math.floor(uptime % 60)}s`,
      },
      environment: process.env.NODE_ENV || "development",
      database: {
        status: dbHealth.status,
        ...dbHealth,
      },
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      },
    };

    // Set appropriate status code
    const statusCode = dbHealth.status === "connected" ? 200 : 503;
    res.status(statusCode).json(healthData);
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      success: false,
      message: "Service temporarily unavailable",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// API documentation endpoint
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "AdsMoney API v2.0.0",
    documentation: {
      version: "2.0.0",
      lastUpdated: "2025-01-21",
      baseUrl: `${req.protocol}://${req.get("host")}/api`,
    },
    endpoints: {
      auth: {
        register: "POST /api/auth/register - Register new user",
        login: "POST /api/auth/login - User login",
        verifyOTP: "POST /api/auth/verify-otp - Verify email OTP",
        resendOTP: "POST /api/auth/resend-otp - Resend verification OTP",
        dashboard: "GET /api/auth/dashboard - User dashboard (Protected)",
        logout: "POST /api/auth/logout - User logout (Protected)",
        usersCount: "GET /api/auth/users-count - Admin statistics (Admin only)",
        verifyAdmin:
          "GET /api/auth/verify-admin - Check admin status (Protected)",
      },
      referral: {
        stats: "GET /api/referral/stats - User referral stats (Protected)",
        history: "GET /api/referral/history - Referral history (Protected)",
        analytics:
          "GET /api/referral/analytics - Referral analytics (Protected)",
        verify:
          "GET /api/referral/verify/:code - Verify referral code (Public)",
        leaderboard: "GET /api/referral/leaderboard - Top referrers (Public)",
      },
      system: {
        health: "GET /health - System health check",
        routes: "GET /api/routes - List all routes",
        docs: "GET /api - This documentation",
      },
    },
    authentication: {
      type: "JWT Bearer Token",
      header: "Authorization: Bearer <token>",
      expiry: "24 hours",
    },
    rateLimit: {
      general: "100 requests per 15 minutes",
      auth: "5 requests per 15 minutes",
      otp: "3 requests per 5 minutes",
    },
  });
});

// Routes listing endpoint for debugging
app.get("/api/routes", (req, res) => {
  try {
    const routes = [];

    const extractRoutes = (stack, basePath = "") => {
      stack.forEach((layer) => {
        if (layer.route) {
          // Direct route
          routes.push({
            path: basePath + layer.route.path,
            methods: Object.keys(layer.route.methods).map((method) =>
              method.toUpperCase()
            ),
            middleware: layer.route.stack
              .map((s) => s.name || "anonymous")
              .join(", "),
          });
        } else if (layer.name === "router" && layer.handle.stack) {
          // Router middleware
          const routerBasePath =
            basePath +
            layer.regexp.source
              .replace("\\/?(?=\\/|$)", "")
              .replace(/\\\//g, "/")
              .replace(/\$.*/, "")
              .replace(/^\^/, "");

          extractRoutes(layer.handle.stack, routerBasePath);
        }
      });
    };

    extractRoutes(app._router.stack);

    res.json({
      success: true,
      message: "Available API routes",
      count: routes.length,
      routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Routes listing error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate routes list",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Catch-all for undefined routes (404 handler)
app.use(notFound);

// Global error handler (must be last)
app.use(errorHandler);

// Server configuration
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log("\n🚀 ===== AdsMoney API Server Started =====");
  console.log(`📡 Server: http://${HOST}:${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📚 API Docs: http://${HOST}:${PORT}/api`);
  console.log(`❤️  Health Check: http://${HOST}:${PORT}/health`);
  console.log(`⚡ Process ID: ${process.pid}`);
  console.log(`🕒 Started at: ${new Date().toISOString()}`);
  console.log("==========================================\n");
});

// Graceful shutdown handlers
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received, initiating graceful shutdown...`);

  server.close(async () => {
    console.log("✅ HTTP server closed");

    try {
      // Close database connection
      const mongoose = require("mongoose");
      await mongoose.connection.close();
      console.log("✅ Database connection closed");

      console.log("✅ Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error("❌ Forcing shutdown after 30 seconds");
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  console.error("Stack trace:", error.stack);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

// Keep process alive
process.on("SIGHUP", () => {
  console.log("📡 SIGHUP received, keeping process alive");
});

module.exports = app;
