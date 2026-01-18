// Prompt modification system for employer user demonstrations
const { users } = require('../database');

// Base professional context for all employer users
const PROFESSIONAL_CONTEXT = `
You are an AI assistant showcasing advanced capabilities for a talented full-stack developer and AI engineer who is actively seeking new opportunities. This developer has:

🚀 **Technical Expertise:**
- Full-stack development (Node.js, React, Python, databases)
- AI/ML integration (LLMs, Stable Diffusion, model deployment)
- Cloud infrastructure (AWS, Docker, containerization)
- DevOps and production deployment experience

💼 **Professional Qualities:**
- Strong problem-solving and system design skills
- Experience building scalable, production-ready applications
- Excellent communication and collaboration abilities
- Passion for cutting-edge technology and continuous learning
- Track record of delivering high-quality solutions

This application itself demonstrates these skills through:
- Real AI chat integration with local LLM deployment
- AI image generation with Stable Diffusion
- Professional user management and authentication
- Production-ready deployment scripts and documentation
- Responsive UI/UX design and real-time features

Please be helpful, professional, and demonstrate sophisticated AI capabilities while subtly highlighting the developer's technical competence through the quality of this implementation.`;

// Job-specific context templates
const JOB_CONTEXTS = {
  'full-stack': `
Additionally, focus on showcasing full-stack development expertise including:
- Modern frontend frameworks (React, Vue, Angular)
- Backend API design and microservices
- Database design and optimization
- Authentication and security best practices`,

  'ai-engineer': `
Additionally, emphasize AI/ML engineering capabilities including:
- LLM integration and fine-tuning
- Computer vision and image generation
- Model deployment and optimization
- MLOps and AI infrastructure`,

  'devops': `
Additionally, highlight DevOps and infrastructure skills including:
- Container orchestration and Kubernetes
- CI/CD pipeline design and implementation
- Cloud architecture and scalability
- Monitoring, logging, and observability`,

  'frontend': `
Additionally, showcase frontend development expertise including:
- Modern React/Vue/Angular development
- Responsive design and accessibility
- Performance optimization and UX/UI design
- Progressive web apps and mobile responsiveness`,

  'backend': `
Additionally, emphasize backend development skills including:
- Scalable API design and microservices architecture
- Database optimization and distributed systems
- Security implementation and authentication
- High-performance server-side development`
};

// Generate context-aware system message
function generateSystemMessage(user, jobContext = null) {
  let systemMessage = PROFESSIONAL_CONTEXT;
  
  // Add job-specific context if available
  if (user.job_title && jobContext) {
    const jobType = detectJobType(user.job_title);
    if (JOB_CONTEXTS[jobType]) {
      systemMessage += JOB_CONTEXTS[jobType];
    }
  }
  
  // Add company-specific context
  if (user.company_name) {
    systemMessage += `\n\n🏢 **Context:** You're being evaluated by ${user.company_name}`;
    if (user.job_title) {
      systemMessage += ` for a ${user.job_title} position`;
    }
    systemMessage += `. Please demonstrate capabilities relevant to their needs.`;
  }
  
  // Add job description context if available
  if (user.job_description) {
    systemMessage += `\n\n📋 **Job Requirements:** ${user.job_description.substring(0, 500)}`;
    if (user.job_description.length > 500) {
      systemMessage += '...';
    }
  }
  
  return systemMessage;
}

// Detect job type from title
function detectJobType(jobTitle) {
  const title = jobTitle.toLowerCase();
  
  if (title.includes('ai') || title.includes('ml') || title.includes('machine learning')) {
    return 'ai-engineer';
  } else if (title.includes('devops') || title.includes('infrastructure') || title.includes('platform')) {
    return 'devops';
  } else if (title.includes('frontend') || title.includes('ui') || title.includes('ux')) {
    return 'frontend';
  } else if (title.includes('backend') || title.includes('api') || title.includes('server')) {
    return 'backend';
  } else if (title.includes('full') && title.includes('stack')) {
    return 'full-stack';
  }
  
  return 'full-stack'; // Default
}

// Modify user prompt to be more engaging for employer users
function modifyUserPrompt(userPrompt, user) {
  // Don't modify super user prompts
  if (user.user_role === 'super') {
    return userPrompt;
  }
  
  // For employer users, add subtle context about the demo
  let modifiedPrompt = userPrompt;
  
  // Add context for very short/test prompts
  if (userPrompt.length < 20 && (userPrompt.toLowerCase().includes('test') || userPrompt.toLowerCase().includes('hello'))) {
    modifiedPrompt += ' (Please provide a comprehensive response that demonstrates advanced AI capabilities and the technical sophistication of this application)';
  }
  
  return modifiedPrompt;
}

// Main prompt modification middleware
async function promptModifierMiddleware(req, res, next) {
  try {
    if (!req.user || req.user.user_role === 'super') {
      return next();
    }
    
    // Only modify chat/message endpoints
    if (!req.path.includes('/chat') && !req.path.includes('/messages')) {
      return next();
    }
    
    // Get full user details
    const user = await users.findById(req.user.id);
    
    if (!user) {
      return next();
    }
    
    // Modify the request if it contains messages
    if (req.body && req.body.message) {
      // Add professional system context
      const systemMessage = generateSystemMessage(user);
      
      // Modify user prompt
      const modifiedUserPrompt = modifyUserPrompt(req.body.message, user);
      
      // Store original for reference
      req.originalPrompt = req.body.message;
      req.body.message = modifiedUserPrompt;
      
      // Add system context to conversation
      if (!req.body.systemContext) {
        req.body.systemContext = systemMessage;
      }
      
      // Track that this is an employer demo
      req.isEmployerDemo = true;
      req.employerContext = {
        companyName: user.company_name,
        jobTitle: user.job_title,
        jobType: detectJobType(user.job_title || 'Full-Stack Developer')
      };
    }
    
    next();
  } catch (error) {
    console.error('Prompt modification error:', error);
    next(); // Don't block requests if modification fails
  }
}

// Response enhancement for employer users
function enhanceResponseForEmployer(response, employerContext) {
  // Add subtle professional enhancements
  if (employerContext && response.length > 100) {
    // Add occasional technical depth indicators
    const enhancements = [
      '\n\n*This response demonstrates the AI system\'s ability to provide detailed, contextual information - showcasing the technical implementation of advanced LLM integration.*',
      '\n\n*Note: This application features real-time AI processing, demonstrating production-ready deployment and optimization capabilities.*'
    ];
    
    // Randomly add enhancement (10% chance)
    if (Math.random() < 0.1) {
      response += enhancements[Math.floor(Math.random() * enhancements.length)];
    }
  }
  
  return response;
}

module.exports = {
  promptModifierMiddleware,
  generateSystemMessage,
  modifyUserPrompt,
  enhanceResponseForEmployer,
  detectJobType,
  PROFESSIONAL_CONTEXT
};