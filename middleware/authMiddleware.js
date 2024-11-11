const jwt = require('jsonwebtoken');
const JWT_SECRET = 'secret';  // Use a more secure secret key in production

const isAuthenticated = (req, res, next) => {
  const token = req.headers['authorization'];  // Extract token from headers

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized access. Please log in.' });
  }

  // Remove 'Bearer ' prefix if it exists
  const tokenWithoutBearer = token.startsWith('Bearer ') ? token.slice(7) : token;

  // Verify the token
  jwt.verify(tokenWithoutBearer, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid or expired token.' });

    // Attach decoded user data to request for further use
    req.user = decoded;
    next();  // Proceed to the next middleware or route handler
  });
};

module.exports = isAuthenticated;
