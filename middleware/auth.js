const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Admin = require('../models/admin.model');

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ success: false, message: 'Authentication token required' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid authentication token' });
        }
        
        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Authentication failed', error: error.message });
    }
};

// Middleware to authenticate admin
const authenticateAdmin = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ success: false, message: 'Authentication token required' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await Admin.findById(decoded.id);
        
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid authentication token' });
        }
        
        req.admin = admin;
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Authentication failed', error: error.message });
    }
};

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Access denied: Admin rights required' });
        }
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

module.exports = {
    authenticateUser,
    authenticateAdmin,
    isAdmin
};
