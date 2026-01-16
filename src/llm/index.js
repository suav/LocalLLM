const { Ollama } = require('ollama');
const config = require('../config');
const { conversations, messages } = require('../database');
const { extractPlainText } = require('../content');

// Initialize Ollama client
const ollama = new Ollama({ 
  host: config.OLLAMA_HOST
});

// Generate conversation title from first message
function generateConversationTitle(content) {
  const plainText = extractPlainText(content);
  const words = plainText.trim().split(/\s+/);
  if (words.length <= 5) {
    return plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;
  }
  return words.slice(0, 5).join(' ') + '...';
}

// Check if Ollama is available
async function checkOllamaAvailability() {
  try {
    await ollama.list();
    return true;
  } catch (error) {
    console.error('Ollama connection failed:', error.message);
    return false;
  }
}

// Handle chat request (streaming)
async function handleChatStream(req, res) {
  const { message, conversationId } = req.body;
  
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }
  
  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  let currentConversationId = conversationId;
  let assistantResponse = '';
  
  try {
    console.log(`[${req.session.username}] User message: ${message}`);
    
    // Create new conversation if none provided
    if (!currentConversationId) {
      const title = generateConversationTitle(message);
      currentConversationId = await conversations.create(req.session.userId, title);
    }
    
    // Save user message
    await messages.save(currentConversationId, 'user', message);
    
    // Build conversation context with windowing
    const conversationHistory = await messages.getConversationContext(currentConversationId);
    console.log(`[${req.session.username}] Context: ${conversationHistory.length} messages (windowed)`);
    
    // Check if Ollama is available
    const ollamaAvailable = await checkOllamaAvailability();
    if (!ollamaAvailable) {
      const errorMessage = `Sorry, the AI service is currently unavailable. (Ollama not running)\n\nEcho: ${message}`;
      
      // Save assistant response
      await messages.save(currentConversationId, 'assistant', errorMessage);
      await conversations.updateTimestamp(currentConversationId);
      
      res.write(`data: ${JSON.stringify({
        type: 'error',
        content: errorMessage,
        conversationId: currentConversationId,
        model: null
      })}\n\n`);
      return res.end();
    }
    
    // Send initial response
    res.write(`data: ${JSON.stringify({
      type: 'start',
      model: config.LLM_MODEL,
      conversationId: currentConversationId
    })}\n\n`);
    
    // Log conversation context for debugging
    console.log(`[${req.session.username}] Sending context:`, 
      conversationHistory.map(m => `${m.role}: ${m.content.substring(0, 50)}...`));
    
    // Stream response from Ollama with windowed conversation context
    const response = await ollama.chat({
      model: config.LLM_MODEL,
      messages: conversationHistory,
      stream: true,
      options: {
        num_predict: config.MAX_TOKENS,
        temperature: config.TEMPERATURE,
        top_k: 40,
        top_p: 0.9,
      }
    });
    
    for await (const part of response) {
      if (part.message?.content) {
        assistantResponse += part.message.content;
        res.write(`data: ${JSON.stringify({
          type: 'content',
          content: part.message.content
        })}\n\n`);
      }
    }
    
    // Save assistant response and update conversation
    await messages.save(currentConversationId, 'assistant', assistantResponse, config.LLM_MODEL);
    await conversations.updateTimestamp(currentConversationId);
    
    // Send completion signal
    res.write(`data: ${JSON.stringify({
      type: 'done',
      conversationId: currentConversationId
    })}\n\n`);
    
  } catch (error) {
    console.error('LLM Streaming Error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      content: `Sorry, I encountered an error: ${error.message}`
    })}\n\n`);
  } finally {
    res.end();
  }
}

// Handle chat request (non-streaming fallback)
async function handleChat(req, res) {
  const { message, conversationId } = req.body;
  
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }
  
  let currentConversationId = conversationId;
  
  try {
    console.log(`[${req.session.username}] User message: ${message}`);
    
    // Create new conversation if none provided
    if (!currentConversationId) {
      const title = generateConversationTitle(message);
      currentConversationId = await conversations.create(req.session.userId, title);
    }
    
    // Save user message
    await messages.save(currentConversationId, 'user', message);
    
    // Build conversation context with windowing
    const conversationHistory = await messages.getConversationContext(currentConversationId);
    console.log(`[${req.session.username}] Context: ${conversationHistory.length} messages (windowed)`);
    
    // Check if Ollama is available
    const ollamaAvailable = await checkOllamaAvailability();
    if (!ollamaAvailable) {
      const errorMessage = `Sorry, the AI service is currently unavailable. (Ollama not running)\n\nEcho: ${message}`;
      
      // Save assistant response
      await messages.save(currentConversationId, 'assistant', errorMessage);
      await conversations.updateTimestamp(currentConversationId);
      
      return res.json({ 
        response: errorMessage,
        user: req.session.username,
        conversationId: currentConversationId
      });
    }
    
    // Log conversation context for debugging
    console.log(`[${req.session.username}] Sending context:`, 
      conversationHistory.map(m => `${m.role}: ${m.content.substring(0, 50)}...`));
    
    // Generate response with Ollama using windowed conversation context
    const response = await ollama.chat({
      model: config.LLM_MODEL,
      messages: conversationHistory,
      options: {
        num_predict: config.MAX_TOKENS,
        temperature: config.TEMPERATURE,
        top_k: 40,
        top_p: 0.9,
      }
    });
    
    const aiResponse = response.message.content;
    console.log(`[${req.session.username}] AI response: ${aiResponse.substring(0, 100)}...`);
    
    // Save assistant response and update conversation
    await messages.save(currentConversationId, 'assistant', aiResponse, config.LLM_MODEL);
    await conversations.updateTimestamp(currentConversationId);
    
    res.json({ 
      response: aiResponse,
      user: req.session.username,
      model: config.LLM_MODEL,
      conversationId: currentConversationId
    });
    
  } catch (error) {
    console.error('LLM Error:', error);
    
    // Try to save error message if we have a conversation
    if (currentConversationId) {
      try {
        const errorMessage = `Sorry, I encountered an error processing your request. Please try again.\n\nError: ${error.message}`;
        await messages.save(currentConversationId, 'assistant', errorMessage);
        await conversations.updateTimestamp(currentConversationId);
      } catch (saveError) {
        console.error('Failed to save error message:', saveError);
      }
    }
    
    res.json({ 
      response: `Sorry, I encountered an error processing your request. Please try again.\n\nError: ${error.message}`,
      user: req.session.username,
      conversationId: currentConversationId
    });
  }
}

module.exports = {
  handleChatStream,
  handleChat,
  generateConversationTitle,
  checkOllamaAvailability
};