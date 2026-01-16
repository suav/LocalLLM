const { marked } = require('marked');
const hljs = require('highlight.js');

// Configure marked for syntax highlighting
marked.setOptions({
  renderer: new marked.Renderer(),
  highlight: function(code, language) {
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language }).value;
      } catch (err) {
        // Fall back to auto-detection
      }
    }
    return hljs.highlightAuto(code).value;
  },
  langPrefix: 'hljs language-',
  pedantic: false,
  gfm: true,
  breaks: false,
  sanitize: false,
  smartypants: false,
  xhtml: false
});

// Process message content with markdown and syntax highlighting
function processMessageContent(content) {
  if (!content) return '';
  
  try {
    // Convert markdown to HTML
    const htmlContent = marked.parse(content);
    return htmlContent;
  } catch (error) {
    console.error('Error processing markdown:', error);
    // Return original content if markdown parsing fails
    return escapeHtml(content);
  }
}

// Escape HTML to prevent XSS attacks
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Extract plain text from markdown (for conversation titles)
function extractPlainText(markdown) {
  if (!markdown) return '';
  
  try {
    // Remove markdown syntax for title generation
    return markdown
      .replace(/```[\s\S]*?```/g, '[code]') // Replace code blocks
      .replace(/`([^`]+)`/g, '$1') // Remove inline code backticks
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract link text
      .replace(/#+\s*/g, '') // Remove headers
      .replace(/>\s*/g, '') // Remove blockquotes
      .replace(/[-*+]\s*/g, '') // Remove list markers
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();
  } catch (error) {
    console.error('Error extracting plain text:', error);
    return markdown;
  }
}

module.exports = {
  processMessageContent,
  extractPlainText,
  escapeHtml
};