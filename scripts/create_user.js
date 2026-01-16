const path = require('path');
const { initializeDatabase, closeDatabase } = require('../src/database');
const { createUser } = require('../src/auth');

// Script to create a user manually using modular components
async function createUserScript(username, password) {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Create user using auth module
    const result = await createUser(username, password);
    
    if (result.success) {
      console.log(`✅ ${result.message}`);
      console.log(`   User ID: ${result.userId}`);
    } else {
      console.error(`❌ Error: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await closeDatabase();
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.log('Usage: node scripts/create_user.js <username> <password>');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/create_user.js admin mypassword123');
  process.exit(1);
}

const [username, password] = args;

// Validate input
if (username.length < 3) {
  console.error('❌ Username must be at least 3 characters long');
  process.exit(1);
}

if (password.length < 6) {
  console.error('❌ Password must be at least 6 characters long');
  process.exit(1);
}

createUserScript(username, password);