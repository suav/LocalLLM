#!/bin/bash

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
systemctl start ollama
systemctl enable ollama

# Pull a smaller Llama model (good for testing)
ollama pull llama3.2:3b

echo "Ollama installation complete!"
echo "Test with: ollama run llama3.2:3b"
echo "API will be available at: http://localhost:11434"