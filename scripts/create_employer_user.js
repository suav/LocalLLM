#!/usr/bin/env node

// Script to create employer users with job details for demonstration purposes
const { createUser } = require('../src/auth');
const config = require('../src/config');
const { initializeDatabase, closeDatabase } = require('../src/database');

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function createEmployerUser() {
  try {
    console.log('\n🏢 Creating Employer User for Job Search Demo\n');
    
    // Initialize database
    await initializeDatabase();
    
    // Get user details
    const username = await askQuestion('Username: ');
    const password = await askQuestion('Password: ');
    const jobTitle = await askQuestion('Job Title (optional): ');
    const companyName = await askQuestion('Company Name (optional): ');
    const jobDescription = await askQuestion('Job Description (optional): ');
    
    // Determine user role
    let userRole = 'employer';
    if (username.toLowerCase().includes('admin') || username.toLowerCase().includes('super')) {
      const makeSuper = await askQuestion('Make this a super user? (y/N): ');
      if (makeSuper.toLowerCase() === 'y' || makeSuper.toLowerCase() === 'yes') {
        userRole = 'super';
      }
    }
    
    const jobData = {
      jobTitle: jobTitle.trim() || null,
      companyName: companyName.trim() || null,
      jobDescription: jobDescription.trim() || null
    };
    
    // Create user
    console.log('\n🔄 Creating user...');
    const result = await createUser(username, password, userRole, jobData);
    
    if (result.success) {
      console.log('\n✅ User created successfully!');
      console.log(`   • Username: ${username}`);
      console.log(`   • Role: ${userRole}`);
      console.log(`   • User ID: ${result.userId}`);
      
      if (jobData.jobTitle) console.log(`   • Job Title: ${jobData.jobTitle}`);
      if (jobData.companyName) console.log(`   • Company: ${jobData.companyName}`);
      
      console.log('\n📋 Rate Limits:');
      if (userRole === 'super') {
        console.log('   • Chat requests: 500/hour');
        console.log('   • Image generation: 100/hour');
        console.log('   • File uploads: 50/hour');
      } else {
        console.log('   • Chat requests: 30/hour');
        console.log('   • Image generation: 10/hour');
        console.log('   • File uploads: 5/hour');
      }
      
      console.log('\n🌐 Access URL: http://localhost:3000');
      console.log('🔐 Login with the credentials above to demo the system');
      
      if (userRole === 'employer' && jobData.companyName) {
        console.log('\n💡 Demo Features:');
        console.log('   • AI responses will be contextually enhanced for employer evaluation');
        console.log('   • System will highlight technical capabilities relevant to the role');
        console.log('   • Professional context will be automatically added to conversations');
      }
      
    } else {
      console.error('\n❌ Failed to create user:', result.error);
    }
    
  } catch (error) {
    console.error('\n💥 Error:', error.message);
  } finally {
    await closeDatabase();
    rl.close();
  }
}

// Pre-defined employer templates
async function createTemplateUsers() {
  console.log('\n🏭 Creating Template Employer Users\n');
  
  await initializeDatabase();
  
  const templates = [
    {
      username: 'microsoft_hr',
      password: 'demo2024',
      jobTitle: 'Senior Full-Stack Engineer',
      companyName: 'Microsoft',
      jobDescription: 'Looking for an experienced full-stack developer to join our Azure team. Must have experience with cloud architecture, microservices, and modern frontend frameworks.'
    },
    {
      username: 'google_recruiter',
      password: 'demo2024',
      jobTitle: 'AI/ML Engineer',
      companyName: 'Google',
      jobDescription: 'Seeking an AI/ML engineer with experience in LLM deployment, computer vision, and production ML systems. Experience with TensorFlow, PyTorch, and cloud platforms required.'
    },
    {
      username: 'startup_cto',
      password: 'demo2024',
      jobTitle: 'Lead Developer',
      companyName: 'TechCorp Startup',
      jobDescription: 'Join our fast-growing startup as a lead developer. Need someone who can work across the full stack, set up DevOps, and lead a small team.'
    }
  ];
  
  for (const template of templates) {
    try {
      const result = await createUser(template.username, template.password, 'employer', {
        jobTitle: template.jobTitle,
        companyName: template.companyName,
        jobDescription: template.jobDescription
      });
      
      if (result.success) {
        console.log(`✅ Created: ${template.username} (${template.companyName})`);
      } else {
        console.log(`❌ Failed: ${template.username} - ${result.error}`);
      }
    } catch (error) {
      console.log(`💥 Error creating ${template.username}: ${error.message}`);
    }
  }
  
  console.log('\n📋 Template users created! Use these for quick demos:');
  templates.forEach(t => {
    console.log(`   • ${t.username} / ${t.password} (${t.companyName})`);
  });
  
  await closeDatabase();
}

// Main menu
async function main() {
  console.log('🎯 ChatGPTay Employer User Creator');
  console.log('==================================');
  console.log('1. Create custom employer user');
  console.log('2. Create template employer users');
  console.log('3. Exit');
  
  const choice = await askQuestion('\nSelect option (1-3): ');
  
  switch (choice) {
    case '1':
      await createEmployerUser();
      break;
    case '2':
      await createTemplateUsers();
      rl.close();
      break;
    case '3':
      console.log('👋 Goodbye!');
      rl.close();
      break;
    default:
      console.log('❌ Invalid option');
      rl.close();
      break;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  createEmployerUser,
  createTemplateUsers
};