const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
  try {
    // DEV ONLY: skip auth if SKIP_AUTH env or header is set (remove in production)
    if (process.env.NODE_ENV !== 'production' && (process.env.SKIP_AUTH === 'true' || req.headers['x-skip-auth'] === 'true')) {
      req.user = { id: 'testuserid', isAdmin: true }; // fake user
      return next();
    }
    
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token, authorization denied' });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token, authorization denied' });
    }
    
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    
    // Fetch user from database to get latest permissions
    const user = await User.findById(decoded.id).select('mobile isAdmin isSuperAdmin role permissions eventPermissions');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = {
      ...decoded,
      mobile: user.mobile,
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin,
      role: user.role,
      permissions: user.permissions,
      eventPermissions: user.eventPermissions
    };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Token verification failed' });
  }
}; 