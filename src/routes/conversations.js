const express = require('express');
const router = express.Router();
const { conversations, messages } = require('../database');

// Get all conversations for the logged-in user
router.get('/conversations', async (req, res) => {
  try {
    const userConversations = await conversations.findByUser(req.session.userId);
    res.json(userConversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get messages for a specific conversation
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const conversationMessages = await messages.findByConversation(
      req.params.id,
      req.session.userId
    );
    res.json(conversationMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Update conversation title
router.put('/conversations/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }
    
    const updated = await conversations.updateTitle(
      req.params.id,
      req.session.userId,
      title.trim()
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating conversation title:', error);
    res.status(500).json({ error: 'Failed to update title' });
  }
});

// Delete a conversation
router.delete('/conversations/:id', async (req, res) => {
  try {
    const deleted = await conversations.delete(req.params.id, req.session.userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

module.exports = router;