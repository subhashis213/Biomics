const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'biomics_jwt_secret_change_in_prod';
const JWT_EXPIRES_IN = '7d';

function authenticateToken(role) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    jwt.verify(token, JWT_SECRET, (err, payload) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token' });
      if (role && payload.role !== role) return res.status(403).json({ error: 'Forbidden' });
      req.user = payload;
      next();
    });
  };
}

module.exports = { authenticateToken, JWT_SECRET, JWT_EXPIRES_IN };
