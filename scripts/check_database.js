const { initializeDatabase, conversations, messages, users, closeDatabase } = require('../src/database');

async function checkDatabase() {
  try {
    await initializeDatabase();
    
    console.log('📊 Database Status Check');
    console.log('========================');
    
    // Count users
    const userCount = await new Promise((resolve, reject) => {
      const { db } = require('../src/database');
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    // Count conversations
    const conversationCount = await new Promise((resolve, reject) => {
      const { db } = require('../src/database');
      db.get('SELECT COUNT(*) as count FROM conversations', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    // Count messages
    const messageCount = await new Promise((resolve, reject) => {
      const { db } = require('../src/database');
      db.get('SELECT COUNT(*) as count FROM messages', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`👥 Users: ${userCount}`);
    console.log(`💬 Conversations: ${conversationCount}`);
    console.log(`📝 Messages: ${messageCount}`);
    
    if (conversationCount > 0) {
      console.log('\\n📋 Recent Conversations:');
      const recentConversations = await new Promise((resolve, reject) => {
        const { db } = require('../src/database');
        db.all(`
          SELECT c.id, c.title, c.created_at, c.updated_at, 
                 COUNT(m.id) as message_count
          FROM conversations c
          LEFT JOIN messages m ON c.id = m.conversation_id
          GROUP BY c.id
          ORDER BY c.updated_at DESC
          LIMIT 5
        `, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      recentConversations.forEach(conv => {
        console.log(`  • ID ${conv.id}: "${conv.title}" (${conv.message_count} messages)`);
        console.log(`    Updated: ${conv.updated_at}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  } finally {
    await closeDatabase();
  }
}

checkDatabase();