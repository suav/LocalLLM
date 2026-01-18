#!/bin/bash

# ChatGPTay Production Deployment Script
# For EC2 and local deployments

set -e

echo "🚀 Starting ChatGPTay Deployment..."

# Check system capabilities
echo "🔍 Checking system capabilities..."
if command -v nvidia-smi > /dev/null 2>&1; then
    nvidia-smi > /dev/null 2>&1 && HAS_GPU=true || HAS_GPU=false
else
    HAS_GPU=false
fi

if [ "$HAS_GPU" = "true" ]; then
    echo "⚡ NVIDIA GPU detected - will attempt GPU acceleration"
else
    echo "🔧 No GPU detected - using CPU mode (still fast!)"
fi

# Create required directories
echo "📁 Creating directories..."
mkdir -p data/users sd-data/{models,outputs}

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install --production

# Start Stable Diffusion service
echo "🎨 Starting adaptive Stable Diffusion service..."
docker-compose -f docker-compose.sd.yml up -d

# Wait for SD service to start
echo "⏳ Waiting for Stable Diffusion to initialize..."
echo "   This may take 5-10 minutes on first run (downloading 4GB+ models)"
if [ "$HAS_GPU" = "true" ]; then
    echo "   ⚡ With GPU: Expect ~10-30 seconds per image generation"
else
    echo "   🕒 With CPU: Expect ~3-4 minutes per image generation"
fi

# Monitor SD startup
timeout=300  # 5 minutes
counter=0
while [ $counter -lt $timeout ]; do
    if curl -s http://localhost:7860/sdapi/v1/progress >/dev/null 2>&1; then
        echo "✅ Stable Diffusion API is ready!"
        break
    fi
    echo "   Waiting... ($counter/$timeout seconds)"
    sleep 10
    counter=$((counter + 10))
done

if [ $counter -eq $timeout ]; then
    echo "⚠️  Stable Diffusion startup timed out, but continuing..."
    echo "   Check 'docker logs sd-webui' for details"
fi

# Start main application
echo "🌟 Starting ChatGPTay application..."
if [ "$NODE_ENV" = "production" ]; then
    echo "🔧 Production mode - using PM2..."
    npm install -g pm2
    pm2 start server.js --name chatgptay
    pm2 save
    pm2 startup
else
    echo "🔧 Development mode - starting directly..."
    node server.js &
    APP_PID=$!
    echo "Application PID: $APP_PID"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📍 Services:"
echo "   • ChatGPTay:        http://localhost:3000"
echo "   • Stable Diffusion: http://localhost:7860"
echo ""
echo "📊 Monitor with:"
echo "   • App logs:  docker logs chatgptay (or pm2 logs)"  
echo "   • SD logs:   docker logs sd-webui"
echo "   • Resources: docker stats"
echo ""
echo "🔧 Manage with:"
echo "   • Stop SD:   docker-compose -f docker-compose.sd.yml down"
echo "   • Restart:   ./deploy.sh"
echo ""