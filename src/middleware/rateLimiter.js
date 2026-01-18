const { rateLimiter, users } = require('../database');

// Rate limit configurations by user role
const RATE_LIMITS = {
  super: {
    requests_per_hour: 1000,
    chat_requests_per_hour: 500,
    image_requests_per_hour: 100,
    file_uploads_per_hour: 50
  },
  employer: {
    requests_per_hour: 100,
    chat_requests_per_hour: 30,
    image_requests_per_hour: 10,
    file_uploads_per_hour: 5
  }
};

// Get client IP address from request
function getClientIP(req) {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.ip;
}

// Extract MAC address from User-Agent or custom headers (limited effectiveness)
function extractMACAddress(req) {
  // Note: MAC addresses are not directly accessible from web requests for privacy reasons
  // This is a placeholder for any custom client implementations
  return req.headers['x-client-mac'] || null;
}

// Get rate limit for user role and endpoint type
function getRateLimit(userRole, endpointType) {
  const limits = RATE_LIMITS[userRole] || RATE_LIMITS.employer;
  
  switch (endpointType) {
    case 'chat':
      return limits.chat_requests_per_hour;
    case 'image':
      return limits.image_requests_per_hour;
    case 'file':
      return limits.file_uploads_per_hour;
    default:
      return limits.requests_per_hour;
  }
}

// Determine endpoint type from request path
function getEndpointType(path) {
  if (path.includes('/chat') || path.includes('/messages')) return 'chat';
  if (path.includes('/generate-image') || path.includes('/image')) return 'image';
  if (path.includes('/upload') || path.includes('/files')) return 'file';
  return 'general';
}

// Rate limiting middleware
async function rateLimitMiddleware(req, res, next) {
  // Skip rate limiting for certain endpoints
  const skipPaths = ['/login', '/register', '/logout', '/static', '/api/system-status'];
  if (skipPaths.some(path => req.path.includes(path))) {
    return next();
  }

  try {
    const userId = req.user?.id;
    const userRole = req.user?.user_role || 'employer';
    const ipAddress = getClientIP(req);
    const endpointType = getEndpointType(req.path);
    
    // Log the request
    if (userId) {
      await rateLimiter.log(userId, ipAddress, req.path, false);
      
      // Update user activity tracking
      const macAddress = extractMACAddress(req);
      await users.updateActivity(userId, ipAddress, req.headers['user-agent'], macAddress);
    }

    // Check rate limits for authenticated users
    if (userId) {
      const rateLimit = getRateLimit(userRole, endpointType);
      const requestCount = await rateLimiter.getRequestCount(userId, 60); // Last 60 minutes
      
      if (requestCount >= rateLimit) {
        // Log blocked request
        await rateLimiter.log(userId, ipAddress, req.path, true);
        
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Maximum ${rateLimit} ${endpointType} requests per hour allowed for ${userRole} users`,
          retryAfter: 3600, // 1 hour in seconds
          currentUsage: requestCount,
          limit: rateLimit,
          userRole: userRole,
          resetTime: new Date(Date.now() + 3600000).toISOString()
        });
      }
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': rateLimit,
        'X-RateLimit-Remaining': Math.max(0, rateLimit - requestCount),
        'X-RateLimit-Reset': new Date(Date.now() + 3600000).toISOString(),
        'X-RateLimit-User-Role': userRole
      });
    }

    next();
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Don't block requests if rate limiting fails
    next();
  }
}

// Admin middleware to view rate limit stats
async function rateLimitStatsMiddleware(req, res, next) {
  try {
    const userRole = req.user?.user_role;
    
    if (userRole !== 'super') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const stats = await rateLimiter.getStats(null, 24); // Last 24 hours
    req.rateLimitStats = stats;
    next();
  } catch (error) {
    console.error('Error fetching rate limit stats:', error);
    res.status(500).json({ error: 'Failed to fetch rate limit statistics' });
  }
}

// Middleware to track session activity
async function trackSessionActivity(req, res, next) {
  try {
    if (req.sessionToken) {
      const { sessions } = require('../database');
      await sessions.updateActivity(req.sessionToken);
    }
    next();
  } catch (error) {
    console.error('Session tracking error:', error);
    next();
  }
}

module.exports = {
  rateLimitMiddleware,
  rateLimitStatsMiddleware,
  trackSessionActivity,
  getClientIP,
  extractMACAddress,
  RATE_LIMITS
};