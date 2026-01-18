const sqlite3 = require('sqlite3').verbose();
const config = require('../config');

// Database connection
const db = new sqlite3.Database(config.DB_PATH);

// Initialize database tables
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        user_role TEXT DEFAULT 'employer' CHECK (user_role IN ('super', 'employer')),
        job_title TEXT,
        company_name TEXT,
        job_description TEXT,
        last_ip TEXT,
        last_user_agent TEXT,
        mac_address TEXT,
        request_count INTEGER DEFAULT 0,
        last_request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        rate_limit_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      
      db.run(`CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`);
      
      db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        model TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
      )`);
      
      db.run(`CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        mac_address TEXT,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`);
      
      db.run(`CREATE TABLE IF NOT EXISTS rate_limit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ip_address TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        was_blocked BOOLEAN DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database tables initialized');
          resolve();
        }
      });
    });
  });
}

// Database helper functions
const users = {
  findByUsername(username) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  
  findById(userId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  
  create(username, hashedPassword, userRole = 'employer', jobData = {}) {
    return new Promise((resolve, reject) => {
      const { jobTitle, companyName, jobDescription } = jobData;
      db.run(
        `INSERT INTO users (username, password, user_role, job_title, company_name, job_description) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [username, hashedPassword, userRole, jobTitle, companyName, jobDescription],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },
  
  updateActivity(userId, ipAddress, userAgent, macAddress = null) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET 
         last_ip = ?, 
         last_user_agent = ?, 
         mac_address = COALESCE(?, mac_address),
         last_request_time = CURRENT_TIMESTAMP,
         request_count = request_count + 1 
         WHERE id = ?`,
        [ipAddress, userAgent, macAddress, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  },
  
  updateRateLimit(userId) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET 
         rate_limit_reset = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  },
  
  getStats(userId = null) {
    return new Promise((resolve, reject) => {
      const query = userId ? 
        'SELECT * FROM users WHERE id = ?' : 
        'SELECT id, username, user_role, job_title, company_name, request_count, last_request_time, created_at FROM users';
      const params = userId ? [userId] : [];
      
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(userId ? rows[0] : rows);
      });
    });
  }
};

const conversations = {
  create(userId, title = 'New Chat') {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO conversations (user_id, title) VALUES (?, ?)',
        [userId, title],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },
  
  findByUser(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT c.*, 
         (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
         FROM conversations c 
         WHERE c.user_id = ? 
         ORDER BY c.updated_at DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },
  
  updateTitle(conversationId, userId, title) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [title, conversationId, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  },
  
  updateTimestamp(conversationId) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [conversationId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  },
  
  delete(conversationId, userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM conversations WHERE id = ? AND user_id = ?',
        [conversationId, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }
};

const messages = {
  save(conversationId, role, content, model = null) {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO messages (conversation_id, role, content, model) VALUES (?, ?, ?, ?)',
        [conversationId, role, content, model],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },
  
  findByConversation(conversationId, userId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT m.* FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.conversation_id = ? AND c.user_id = ?
         ORDER BY m.created_at ASC`,
        [conversationId, userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },
  
  getConversationContext(conversationId) {
    return new Promise((resolve, reject) => {
      // Get the most recent messages within the context window
      db.all(
        `SELECT role, content FROM messages 
         WHERE conversation_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [conversationId, config.CONTEXT_WINDOW_MESSAGES],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Reverse to get chronological order (oldest first)
            const messages = rows.reverse().map(row => ({
              role: row.role,
              content: row.content
            }));
            
            // Add system message if this is the start of context window and we're truncating
            if (rows.length === config.CONTEXT_WINDOW_MESSAGES) {
              messages.unshift({
                role: 'system',
                content: 'This is a continuation of an ongoing conversation. Previous context may have been truncated due to length limits. Please maintain consistency with the conversation flow.'
              });
            }
            
            resolve(messages);
          }
        }
      );
    });
  }
};

// Graceful shutdown
function closeDatabase() {
  return new Promise((resolve) => {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
      resolve();
    });
  });
}

const sessions = {
  create(userId, sessionToken, ipAddress, userAgent, macAddress = null) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, mac_address)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, sessionToken, ipAddress, userAgent, macAddress],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },
  
  findByToken(sessionToken) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT s.*, u.username, u.user_role, u.job_title, u.company_name 
         FROM user_sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.session_token = ? AND s.is_active = 1`,
        [sessionToken],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  },
  
  updateActivity(sessionToken) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE user_sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_token = ?',
        [sessionToken],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  },
  
  deactivate(sessionToken) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE user_sessions SET is_active = 0 WHERE session_token = ?',
        [sessionToken],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  },
  
  cleanupExpired(hours = 24) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE user_sessions SET is_active = 0 
         WHERE last_activity < datetime('now', '-' || ? || ' hours')`,
        [hours],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }
};

const rateLimiter = {
  log(userId, ipAddress, endpoint, wasBlocked = false) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO rate_limit_log (user_id, ip_address, endpoint, was_blocked)
         VALUES (?, ?, ?, ?)`,
        [userId, ipAddress, endpoint, wasBlocked ? 1 : 0],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },
  
  getRequestCount(userId, minutes = 60) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count 
         FROM rate_limit_log 
         WHERE user_id = ? AND request_time > datetime('now', '-' || ? || ' minutes')`,
        [userId, minutes],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  },
  
  getStats(userId = null, hours = 24) {
    return new Promise((resolve, reject) => {
      const query = userId ? 
        `SELECT endpoint, COUNT(*) as requests, SUM(was_blocked) as blocked
         FROM rate_limit_log 
         WHERE user_id = ? AND request_time > datetime('now', '-' || ? || ' hours')
         GROUP BY endpoint` :
        `SELECT u.username, u.user_role, r.endpoint, COUNT(*) as requests, SUM(r.was_blocked) as blocked
         FROM rate_limit_log r
         JOIN users u ON r.user_id = u.id
         WHERE r.request_time > datetime('now', '-' || ? || ' hours')
         GROUP BY r.user_id, r.endpoint
         ORDER BY requests DESC`;
      
      const params = userId ? [userId, hours] : [hours];
      
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

module.exports = {
  db,
  initializeDatabase,
  users,
  conversations,
  messages,
  sessions,
  rateLimiter,
  closeDatabase
};