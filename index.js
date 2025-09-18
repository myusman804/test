const express = require("express")
const connectDB = require("./config/db")
const dotenv = require("dotenv") // Import dotenv

// Load environment variables
dotenv.config()

// Connect to MongoDB
connectDB()

const app = express()

app.use(express.json()) // Middleware to parse JSON

// Remove express-session middleware as we are switching to JWT
// app.use(session({
//     secret: 'supersecretkey',
//     resave: false,
//     saveUninitialized: true,
//     cookie: { secure: false }
// }));

const authRoutes = require("./routes/authRoute")
app.use("/api/auth", authRoutes)

const PORT = process.env.PORT || 3000 // Use PORT from .env or default to 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
