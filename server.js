const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./src/config');
const { initializeDatabase, closeDatabase } = require('./src/database');
const { requireAuth, loginUser, logoutUser } = require('./src/auth');
const { handleChatStream, handleChat } = require('./src/llm');
const { processMessageContent } = require('./src/content');
const conversationRoutes = require('./src/routes/conversations');
const fileRoutes = require('./src/routes/files');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: config.CSP_DIRECTIVES
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS
});
app.use(limiter);

// Session configuration
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: config.SESSION_MAX_AGE
  }
}));

// Initialize database
initializeDatabase().catch(error => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

// Serve static files
app.use(express.static('public'));

// Routes
app.use('/api', requireAuth, conversationRoutes);
app.use('/api', requireAuth, fileRoutes);

// Root and auth routes
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/chat');
  } else {
    res.redirect('/login');
  }
});

app.get('/login', (req, res) => {
  if (req.session.userId) {
    res.redirect('/chat');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  const result = await loginUser(username, password);
  
  if (result.success) {
    req.session.userId = result.user.id;
    req.session.username = result.user.username;
    res.json({ success: true, redirect: '/chat' });
  } else {
    res.status(401).json({ error: result.error });
  }
});

app.get('/chat', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// API endpoint to get current user info
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    username: req.session.username,
    userId: req.session.userId
  });
});

// Chat endpoints
app.post('/api/chat-stream', requireAuth, handleChatStream);
app.post('/api/chat', requireAuth, handleChat);

// Content processing endpoint for markdown rendering
app.post('/api/process-content', requireAuth, (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    const processedContent = processMessageContent(content);
    res.json({ processedContent });
  } catch (error) {
    console.error('Content processing error:', error);
    res.status(500).json({ error: 'Failed to process content' });
  }
});

// Logout endpoint
app.post('/logout', requireAuth, async (req, res) => {
  try {
    await logoutUser(req);
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\nShutting down gracefully...');
  await closeDatabase();
  process.exit(0);
});

// Start server
app.listen(config.PORT, () => {
  console.log(`ChatGPTay server running on port ${config.PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Using model: ${config.LLM_MODEL}`);
});