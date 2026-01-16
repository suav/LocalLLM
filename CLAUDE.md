# Claude Code Instructions

## Development Commands

### Server Management
- `node server.js` - Start the ChatGPTay application server
- Server runs on http://localhost:3000
- Uses SQLite database for conversation storage
- Supports file uploads and image generation

### Testing and Quality
- No specific test commands configured yet
- No linting commands configured yet

## Git Configuration

### SSH Key Setup for Multiple GitHub Accounts
This project uses SSH keys for Git authentication. The following SSH configuration supports multiple GitHub accounts:

**SSH Config (~/.ssh/config):**
```
# Evpatarini account
Host github-evpatarini
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519

# Suav account  
Host github-suav
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_secondary

# Default to suav account
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_secondary
```

### Git Commands for This Repository

**Push to GitHub (using correct SSH key):**
```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_secondary -o IdentitiesOnly=yes" git push origin main
```

**Repository Details:**
- Remote URL: git@github-suav:suav/LocalLLM.git
- Account: suav
- SSH Key: ~/.ssh/id_ed25519_secondary (SHA256:uRsjPRrHUrKQKKAhcPnEFxSRyYc3pW5ud+/gswZPMU0)

### Important Notes
- Always use the GIT_SSH_COMMAND when pushing to ensure correct SSH key usage
- The repository is configured for the "suav" GitHub account
- Standard git commands may default to wrong SSH key without explicit override

## Docker Services

### Stable Diffusion Setup (Real AI Model)
```bash
# Start Real Stable Diffusion with PyTorch + Diffusers
docker-compose -f docker-compose.sd.yml up -d

# Monitor model loading progress (first time: 5-10 minutes)
docker logs sd-webui -f

# Test API readiness
curl http://localhost:7860/sdapi/v1/progress
```

### Production Deployment
```bash
# Quick deployment script for EC2 or local production
./deploy.sh

# Manual deployment steps in DEPLOY.md
```

## Project Structure

### Key Files
- `src/storage/index.js` - File storage and metadata management
- `src/routes/files.js` - File upload and image generation endpoints
- `src/routes/conversations.js` - Chat conversation management
- `src/llm/index.js` - Ollama LLM integration
- `public/chat.html` - Main chat interface with image preview grid
- `docker-compose.sd.yml` - Real Stable Diffusion v1.5 configuration
- `real_sd_server.py` - Actual AI image generation server (PyTorch + Diffusers)
- `deploy.sh` - Production deployment script
- `DEPLOY.md` - Complete deployment guide

### Recent Enhancements
- **Real AI Image Generation**: Stable Diffusion v1.5 with PyTorch and Diffusers
- **True Image Model**: CPU-based real AI (not placeholders) - 3-4 minutes per generation
- File metadata display (timestamps, size, type)
- 2-column image preview grid with hover overlays
- Prompt-based filename generation for images
- Production-ready deployment configuration
- EC2 deployment documentation and scripts