const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { users, sessions } = require('../database');
const { getClientIP, extractMACAddress } = require('../middleware/rateLimiter');

// Enhanced authentication middleware with user context
async function requireAuth(req, res, next) {
  try {
    if (req.session.userId) {
      // Get full user details including role
      const user = await users.findById(req.session.userId);
      if (user) {
        req.user = {
          id: user.id,
          username: user.username,
          user_role: user.user_role,
          job_title: user.job_title,
          company_name: user.company_name
        };
        req.sessionToken = req.session.sessionToken;
        next();
      } else {
        // User not found, clear session
        req.session.destroy(() => {
          res.redirect('/login');
        });
      }
    } else {
      res.redirect('/login');
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.redirect('/login');
  }
}

// Role-based authorization middleware
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userRole = req.user.user_role || 'employer';
    if (allowedRoles.includes(userRole)) {
      next();
    } else {
      res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: userRole 
      });
    }
  };
}

// Enhanced login with session tracking
async function loginUser(username, password, req) {
  try {
    const user = await users.findByUsername(username);
    
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return { success: false, error: 'Invalid credentials' };
    }
    
    // Create session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const ipAddress = getClientIP(req);
    const userAgent = req.headers['user-agent'];
    const macAddress = extractMACAddress(req);
    
    // Store session in database
    await sessions.create(user.id, sessionToken, ipAddress, userAgent, macAddress);
    
    // Update user activity
    await users.updateActivity(user.id, ipAddress, userAgent, macAddress);
    
    return { 
      success: true, 
      user: { 
        id: user.id, 
        username: user.username,
        user_role: user.user_role,
        job_title: user.job_title,
        company_name: user.company_name
      },
      sessionToken
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Database error' };
  }
}

// Enhanced user creation with role and job data
async function createUser(username, password, userRole = 'employer', jobData = {}) {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await users.create(username, hashedPassword, userRole, jobData);
    
    return { 
      success: true, 
      userId,
      userRole,
      message: `${userRole} user '${username}' created successfully` 
    };
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return { success: false, error: 'Username already exists' };
    }
    console.error('Create user error:', error);
    return { success: false, error: 'Database error' };
  }
}

// Enhanced logout with session cleanup
async function logoutUser(req) {
  try {
    // Deactivate session in database
    if (req.sessionToken) {
      await sessions.deactivate(req.sessionToken);
    }
    
    // Destroy Express session
    return new Promise((resolve, reject) => {
      req.session.destroy(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('Logout error:', error);
    // Still destroy session even if DB cleanup fails
    return new Promise((resolve, reject) => {
      req.session.destroy(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

// Utility functions for admin features
async function getUserStats() {
  try {
    return await users.getStats();
  } catch (error) {
    console.error('Get user stats error:', error);
    return [];
  }
}

async function cleanupExpiredSessions(hours = 24) {
  try {
    const cleaned = await sessions.cleanupExpired(hours);
    console.log(`Cleaned up ${cleaned} expired sessions`);
    return cleaned;
  } catch (error) {
    console.error('Cleanup sessions error:', error);
    return 0;
  }
}

module.exports = {
  requireAuth,
  requireRole,
  loginUser,
  createUser,
  logoutUser,
  getUserStats,
  cleanupExpiredSessions
};