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

// System status endpoint
app.get('/api/system-status', requireAuth, async (req, res) => {
  try {
    const axios = require('axios');
    const { exec } = require('child_process');
    
    // Check GPU availability
    let gpuAvailable = false;
    let gpuInfo = '';
    try {
      await new Promise((resolve, reject) => {
        exec('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', (error, stdout) => {
          if (!error && stdout.trim()) {
            gpuAvailable = true;
            gpuInfo = stdout.trim();
          }
          resolve();
        });
      });
    } catch (e) {
      // GPU not available
    }
    
    // Check Stable Diffusion API status and actual compute mode
    let sdStatus = 'Offline';
    let sdCompute = 'Unknown';
    try {
      await axios.get('http://localhost:7860/sdapi/v1/progress', { timeout: 3000 });
      sdStatus = 'Online';
      // Check actual SD logs to determine if using GPU or CPU
      try {
        const { exec } = require('child_process');
        const sdLogs = await new Promise((resolve) => {
          exec('(docker logs sd-webui-fast 2>/dev/null || docker logs sd-webui 2>/dev/null) | grep -E "(GPU detected|CUDA|CPU.*mode)" | tail -1', (error, stdout) => {
            resolve(stdout.trim());
          });
        });
        sdCompute = (sdLogs.includes('GPU') || sdLogs.includes('CUDA')) ? 'GPU' : 'CPU';
      } catch (e) {
        sdCompute = 'CPU'; // Default assumption
      }
    } catch (e) {
      sdStatus = 'Loading...';
    }
    
    // Check Ollama status
    let ollamaStatus = 'Unknown';
    let ollamaCompute = 'Unknown';
    try {
      await axios.get('http://localhost:11434/api/tags', { timeout: 2000 });
      ollamaStatus = 'Online';
      ollamaCompute = gpuAvailable ? 'GPU' : 'CPU';
    } catch (e) {
      ollamaStatus = 'Offline';
    }
    
    res.json({
      compute: {
        gpu_available: gpuAvailable,
        gpu_info: gpuInfo,
        stable_diffusion: sdStatus,
        sd_compute: sdCompute
      },
      ollama: {
        status: ollamaStatus,
        compute: ollamaCompute
      }
    });
  } catch (error) {
    console.error('Error checking system status:', error);
    res.json({
      compute: {
        gpu_available: false,
        gpu_info: '',
        stable_diffusion: 'Unknown',
        sd_compute: 'Unknown'
      },
      ollama: {
        status: 'Unknown',
        compute: 'Unknown'
      }
    });
  }
});

// Chat endpoints
app.post('/api/chat-stream', requireAuth, handleChatStream);
app.post('/api/chat', requireAuth, handleChat);

// Model management endpoints
app.get('/api/ollama/models', requireAuth, async (req, res) => {
  try {
    const response = await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
    const models = response.data.models.map(model => ({
      name: model.name,
      size: model.size,
      modified_at: model.modified_at,
      details: model.details
    }));
    res.json({ models });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Ollama models', details: error.message });
  }
});

app.get('/api/sd/models', requireAuth, async (req, res) => {
  try {
    const response = await axios.get('http://localhost:7860/sdapi/v1/sd-models', { timeout: 5000 });
    res.json({ models: response.data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch SD models', details: error.message });
  }
});

app.post('/api/sd/switch-model', requireAuth, async (req, res) => {
  try {
    const { model_name } = req.body;
    if (!model_name) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    
    const response = await axios.post('http://localhost:7860/sdapi/v1/options', {
      sd_model_checkpoint: model_name
    }, { timeout: 30000 });
    
    res.json({ 
      success: true, 
      message: `Switched to model: ${model_name}`,
      data: response.data 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to switch SD model', 
      details: error.response?.data?.message || error.message 
    });
  }
});

app.post('/api/sd/refresh-models', requireAuth, async (req, res) => {
  try {
    const response = await axios.post('http://localhost:7860/sdapi/v1/refresh-checkpoints', {}, { timeout: 10000 });
    res.json({ 
      success: true, 
      message: 'Models refreshed',
      data: response.data 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to refresh SD models', 
      details: error.response?.data?.message || error.message 
    });
  }
});

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