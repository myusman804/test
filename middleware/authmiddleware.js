const jwt = require("jsonwebtoken") // Import jsonwebtoken

module.exports = (req, res, next) => {
  // Get token from header
  const token = req.header("Authorization")

  // Check if not token
  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" })
  }

  // Extract the token part (remove "Bearer ")
  const tokenParts = token.split(" ")
  if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
    return res.status(401).json({ message: "Token format is 'Bearer <token>'" })
  }
  const actualToken = tokenParts[1]

  try {
    // Verify token
    const decoded = jwt.verify(actualToken, process.env.JWT_SECRET) // Use JWT_SECRET from .env

    // Attach user from token payload to request object
    req.user = decoded.user
    next()
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" })
  }
}
