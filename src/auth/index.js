const bcrypt = require('bcryptjs');
const { users } = require('../database');

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Login user
async function loginUser(username, password) {
  try {
    const user = await users.findByUsername(username);
    
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return { success: false, error: 'Invalid credentials' };
    }
    
    return { 
      success: true, 
      user: { 
        id: user.id, 
        username: user.username 
      } 
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Database error' };
  }
}

// Create user (for admin use)
async function createUser(username, password) {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await users.create(username, hashedPassword);
    
    return { 
      success: true, 
      userId,
      message: `User '${username}' created successfully` 
    };
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return { success: false, error: 'Username already exists' };
    }
    console.error('Create user error:', error);
    return { success: false, error: 'Database error' };
  }
}

// Logout user
function logoutUser(req) {
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

module.exports = {
  requireAuth,
  loginUser,
  createUser,
  logoutUser
};