// Configuration module
module.exports = {
  // Server configuration
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database configuration
  DB_PATH: process.env.NODE_ENV === 'production' ? './data/users.db' : './users.db',
  
  // Session configuration
  SESSION_SECRET: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  SESSION_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
  
  // LLM configuration
  OLLAMA_HOST: process.env.OLLAMA_HOST || 'http://localhost:11434',
  LLM_MODEL: process.env.LLM_MODEL || 'llama3.2:3b',
  MAX_TOKENS: parseInt(process.env.MAX_TOKENS || '2048'),
  TEMPERATURE: parseFloat(process.env.TEMPERATURE || '0.7'),
  CONTEXT_WINDOW_MESSAGES: parseInt(process.env.CONTEXT_WINDOW_MESSAGES || '20'),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // Security
  CSP_DIRECTIVES: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
  }
};