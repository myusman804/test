const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Validate required environment variables
    if (!process.env.MONGO_URL) {
      throw new Error("MONGO_URL environment variable is required");
    }

    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false, // Disable mongoose buffering
      heartbeatFrequencyMS: 2000, // Send heartbeat every 2 seconds
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
    };

    const conn = await mongoose.connect(process.env.MONGO_URL, options);

    console.log("✅ MongoDB Connected Successfully");
    console.log(`📍 Database: ${conn.connection.db.databaseName}`);
    console.log(`🖥️  Host: ${conn.connection.host}:${conn.connection.port}`);

    // Connection event listeners for better monitoring
    mongoose.connection.on("connected", () => {
      console.log("📡 Mongoose connected to MongoDB");
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ Mongoose connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("📡 Mongoose disconnected from MongoDB");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("🔄 Mongoose reconnected to MongoDB");
    });

    // Graceful shutdown handlers
    process.on("SIGINT", async () => {
      try {
        await mongoose.connection.close();
        console.log("🔒 MongoDB connection closed through app termination");
        process.exit(0);
      } catch (err) {
        console.error("❌ Error during MongoDB connection closure:", err);
        process.exit(1);
      }
    });

    process.on("SIGTERM", async () => {
      try {
        await mongoose.connection.close();
        console.log("🔒 MongoDB connection closed through SIGTERM");
        process.exit(0);
      } catch (err) {
        console.error("❌ Error during MongoDB connection closure:", err);
        process.exit(1);
      }
    });
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err.message);

    // Log additional connection details for debugging
    if (err.code) console.error(`Error Code: ${err.code}`);
    if (err.codeName) console.error(`Error Code Name: ${err.codeName}`);

    process.exit(1);
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

    return {
      status: states[state],
      readyState: state,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.db?.databaseName,
    };
  } catch (error) {
    return {
      status: "error",
      error: error.message,
    };
  }
};

module.exports = { connectDB, checkDBHealth };
