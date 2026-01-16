#!/bin/bash

# Update package index
sudo apt update

# Install Docker
sudo apt install -y docker.io docker-compose

# Add user to docker group (so you don't need sudo for docker commands)
sudo usermod -aG docker $USER

# Start and enable docker service
sudo systemctl start docker
sudo systemctl enable docker

echo "Docker installation complete!"
echo "Please log out and log back in (or run 'newgrp docker') for group changes to take effect"
echo "Test with: docker --version && docker-compose --version"