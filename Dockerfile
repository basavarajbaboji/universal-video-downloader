# Use Node.js 18 LTS
FROM node:18-alpine

# Install Python and build tools (needed for yt-dlp)
RUN apk add --no-cache python3 py3-pip build-base

# Install yt-dlp
RUN pip3 install --break-system-packages yt-dlp

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install backend dependencies
RUN npm install

# Copy client package files
COPY client/package*.json ./client/

# Install frontend dependencies
RUN cd client && npm install

# Copy source code
COPY . .

# Build frontend
RUN cd client && npm run build

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
