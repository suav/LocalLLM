# Deployment Guide

## Local Development Setup

### Requirements
- Node.js 18+
- Docker and Docker Compose
- Git with SSH keys configured

### Quick Start
```bash
# Start the main application
node server.js

# Start Stable Diffusion service (takes ~5 minutes first time)
docker-compose -f docker-compose.sd.yml up -d

# Monitor SD model loading (first time only)
docker logs sd-webui -f
```

## EC2 Production Deployment

### Prerequisites
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose
sudo usermod -aG docker ubuntu
sudo systemctl start docker
sudo systemctl enable docker

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git
sudo apt install -y git
```

### Application Setup
```bash
# Clone repository
git clone git@github.com:suav/LocalLLM.git
cd LocalLLM

# Install dependencies
npm install

# Create required directories
mkdir -p data/users sd-data/{models,outputs}

# Start services
./deploy.sh
```

### Production Configuration

#### Environment Variables
Create `.env` file:
```
NODE_ENV=production
PORT=3000
OLLAMA_HOST=http://localhost:11434
```

#### Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### SSL with Let's Encrypt
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Service Management

#### Systemd Service
Create `/etc/systemd/system/chatgptay.service`:
```ini
[Unit]
Description=ChatGPTay Application
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/LocalLLM
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable chatgptay
sudo systemctl start chatgptay
sudo systemctl status chatgptay
```

## Resource Requirements

### Minimum Specs
- **CPU**: 4+ cores (8+ recommended for SD)
- **RAM**: 8GB+ (16GB+ recommended)  
- **Storage**: 20GB+ free space
- **Network**: Stable internet for model downloads

### Performance Notes
- **Stable Diffusion**: Takes 3-4 minutes per image on CPU
- **First run**: Downloads 4GB+ models (10-15 minutes)
- **Concurrent users**: 2-3 simultaneous SD generations max

## Troubleshooting

### Container Issues
```bash
# Check container status
docker ps
docker logs sd-webui

# Restart SD service
docker-compose -f docker-compose.sd.yml restart

# Full cleanup and restart
docker-compose -f docker-compose.sd.yml down
docker system prune -f
docker-compose -f docker-compose.sd.yml up -d
```

### Port Conflicts
- Main app: Port 3000
- Stable Diffusion: Port 7860
- Ollama (if installed): Port 11434

### Performance Optimization
```bash
# Increase Docker memory limit
echo 'vm.overcommit_memory = 1' | sudo tee -a /etc/sysctl.conf

# Monitor resource usage
htop
docker stats
```

## Security Considerations

- Change default ports in production
- Use proper SSL/TLS certificates  
- Configure firewall rules
- Regular security updates
- Monitor logs for suspicious activity
- Implement rate limiting for image generation

## Backup Strategy

```bash
# Backup user data
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Backup configuration
cp docker-compose.sd.yml server.js CLAUDE.md backup/
```