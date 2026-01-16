# ChatGPTay 🤖✨

A local LLM hosting interface similar to ChatGPT, powered by Ollama. Deploy your own AI assistant with multi-user support, conversation management, and streaming responses.

## Features

- 🔐 **Multi-user authentication** with secure session management
- 💬 **Real-time streaming responses** from local LLM models
- 📚 **Conversation history** with persistent storage
- 🎨 **ChatGPT-inspired UI** with responsive design
- 🔧 **Modular architecture** for easy maintenance and extension
- 🚀 **Production ready** with Docker support

## Quick Start

### Prerequisites

- Node.js 16+
- Ollama installed and running locally
- A compatible LLM model (e.g., `llama3.2:3b`)

### Installation

1. Clone and install dependencies:
```bash
git clone <your-repo>
cd localLLMDeployment
npm install
```

2. Install and start Ollama:
```bash
# Use provided script or install manually
./scripts/install-ollama.sh

# Pull a model
ollama pull llama3.2:3b
```

3. Create your first user:
```bash
npm run create-user admin mypassword123
```

4. Start the server:
```bash
npm start
# or for development
npm run dev
```

5. Open http://localhost:3000 and login!

## Project Structure

```
├── src/
│   ├── config/           # Configuration management
│   ├── database/         # Database abstraction layer
│   ├── auth/            # Authentication middleware
│   ├── llm/             # LLM integration (Ollama)
│   └── routes/          # API route handlers
├── public/              # Static frontend files
├── scripts/             # Utility scripts
├── deployment/          # Docker configuration
└── server.js           # Main application entry
```

## Configuration

Set environment variables:

```bash
export PORT=3000
export NODE_ENV=production
export SESSION_SECRET=your-secret-key
export OLLAMA_HOST=http://localhost:11434
export LLM_MODEL=llama3.2:3b
export MAX_TOKENS=500
export TEMPERATURE=0.7
export CONTEXT_WINDOW_MESSAGES=20
```

## Deployment

### Docker

```bash
cd deployment
docker-compose up -d
```

### Manual Deployment

1. Set `NODE_ENV=production`
2. Create `/data` directory for production database
3. Configure reverse proxy (nginx recommended)
4. Use PM2 or similar for process management

## API Endpoints

- `POST /login` - User authentication
- `GET /api/conversations` - List conversations
- `GET /api/conversations/:id/messages` - Get conversation messages
- `POST /api/chat-stream` - Streaming chat endpoint
- `POST /api/chat` - Non-streaming chat endpoint

## Development

The codebase is organized with a modular architecture:

- **Config**: Centralized configuration management
- **Database**: SQLite with promise-based abstractions
- **Auth**: bcrypt-based authentication with sessions
- **LLM**: Ollama integration with streaming support
- **Routes**: RESTful API endpoints

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Roadmap

- [ ] Rich content support (Markdown, code highlighting)
- [ ] File upload capabilities  
- [ ] Artifacts system
- [ ] Image generation/display
- [ ] Plugin architecture
- [ ] Advanced user management