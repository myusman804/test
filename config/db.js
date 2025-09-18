const mongoose = require("mongoose");
const User = require("../models/User"); // Import the User model

const MONGO_URI =
  "mongodb+srv://test:zy67KdyGXru378fq@cluster0.cahuezj.mongodb.net/party?retryWrites=true&w=majority&appName=Cluster0";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI); // no need for deprecated options
    console.log("✅ MongoDB Connected Successfully");

    // Optional: check connection state
    console.log("Connection Successfully"); // 1 = connected
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err.message);
    process.exit(1);
  }
};

connectDB();

module.exports = connectDB;
