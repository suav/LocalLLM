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
  
  create(username, hashedPassword) {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username, hashedPassword],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
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

module.exports = {
  db,
  initializeDatabase,
  users,
  conversations,
  messages,
  closeDatabase
};