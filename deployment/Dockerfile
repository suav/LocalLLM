FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create users database directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Start application
CMD ["node", "server.js"]