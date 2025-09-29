const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Validate required environment variables
    if (!process.env.MONGO_URL) {
      throw new Error("MONGO_URL environment variable is required");
    }

    console.log("🔌 Attempting to connect to MongoDB...");
    console.log(
      "📍 Connection string (masked):",
      process.env.MONGO_URL.replace(/\/\/.*:.*@/, "//***:***@")
    );

    const options = {
      // Connection pool settings
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 10000, // Keep trying to send operations for 10 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 10000, // Give up initial connection after 10 seconds

      // Retry settings
      maxIdleTimeMS: 1000000, // Close connections after 30 seconds of inactivity
      heartbeatFrequencyMS: 2000, // Send heartbeat every 2 seconds

      // Atlas specific settings
      retryWrites: true,
      w: "majority",

      // Additional timeout settings for Atlas
      serverSelectionTimeoutMS: 15000, // Increase server selection timeout
      connectTimeoutMS: 15000, // Increase connection timeout
    };

    // Attempt connection with detailed error logging
    const conn = await mongoose.connect(process.env.MONGO_URL, options);

    console.log("✅ MongoDB Connected Successfully");
    console.log(`📍 Database: ${conn.connection.db.databaseName}`);
    console.log(`🖥️  Host: ${conn.connection.host}:${conn.connection.port}`);
    console.log(
      `🔗 Connection State: ${mongoose.connection.readyState} (1=connected)`
    );

    // Connection event listeners for better monitoring
    mongoose.connection.on("connected", () => {
      console.log("📡 Mongoose connected to MongoDB Atlas");
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ Mongoose connection error:", err);

      // Log specific error types for better debugging
      if (err.name === "MongoServerSelectionError") {
        console.error("🔍 Server Selection Error - Possible causes:");
        console.error("   • IP whitelist restrictions");
        console.error("   • Network connectivity issues");
        console.error("   • Cluster is paused or deleted");
        console.error("   • Invalid connection string");
      }

      if (err.name === "MongooseTimeoutError") {
        console.error("⏰ Connection timeout - Check network connectivity");
      }

      if (err.name === "MongoNetworkError") {
        console.error("🌐 Network error - Check internet connection");
      }
    });

    mongoose.connection.on("disconnected", () => {
      console.log("📡 Mongoose disconnected from MongoDB");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("🔄 Mongoose reconnected to MongoDB");
    });

    // Test the connection immediately
    await mongoose.connection.db.admin().ping();
    console.log("🏓 MongoDB ping successful");
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err.message);

    // Enhanced error logging
    console.error("\n🔍 Connection Troubleshooting:");
    console.error("1. Check MongoDB Atlas IP Whitelist:");
    console.error("   • Go to Network Access in Atlas dashboard");
    console.error("   • Ensure 0.0.0.0/0 is added for any IP access");
    console.error("   • Or add your current IP specifically");

    console.error("\n2. Verify Connection String:");
    console.error("   • Check username and password are correct");
    console.error("   • Ensure cluster name is correct");
    console.error("   • Verify database name exists");

    console.error("\n3. Check Cluster Status:");
    console.error("   • Ensure cluster is not paused");
    console.error("   • Verify cluster region is accessible");

    console.error("\n4. Network Issues:");
    console.error("   • Check internet connectivity");
    console.error("   • Try connecting from different network");
    console.error("   • Check firewall/proxy settings");

    if (err.code) console.error(`\n📋 Error Code: ${err.code}`);
    if (err.codeName) console.error(`📋 Error Code Name: ${err.codeName}`);

    // Log the full error in development
    if (process.env.NODE_ENV === "development") {
      console.error("\n🐛 Full Error Details:");
      console.error(err);
    }

    // Don't exit immediately, allow for retry
    console.error("\n🔄 Will attempt to reconnect...");

    // Retry connection after 5 seconds
    setTimeout(() => {
      console.log("🔄 Retrying MongoDB connection...");
      connectDB();
    }, 5000);
  }
};

// Health check function
const checkDBHealth = async () => {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    // If connected, test with a ping
    if (state === 1) {
      await mongoose.connection.db.admin().ping();
    }

    return {
      status: states[state],
      readyState: state,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.db?.databaseName,
      isHealthy: state === 1,
    };
  } catch (error) {
    return {
      status: "error",
      readyState: 0,
      error: error.message,
      isHealthy: false,
    };
  }
};

// Connection string validation
const validateConnectionString = (connectionString) => {
  const issues = [];

  if (!connectionString) {
    issues.push("Connection string is missing");
    return issues;
  }

  if (!connectionString.includes("mongodb+srv://")) {
    issues.push("Should use mongodb+srv:// for Atlas connections");
  }

  if (!connectionString.includes("@")) {
    issues.push("Missing authentication credentials");
  }

  if (!connectionString.includes(".mongodb.net")) {
    issues.push("Does not appear to be a valid Atlas connection string");
  }

  return issues;
};

// Validate connection string on startup
const connectionIssues = validateConnectionString(process.env.MONGO_URL);
if (connectionIssues.length > 0) {
  console.error("❌ Connection string validation failed:");
  connectionIssues.forEach((issue) => console.error(`   • ${issue}`));
}

module.exports = { connectDB, checkDBHealth };
