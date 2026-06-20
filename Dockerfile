# Use the official Playwright Docker image containing pre-installed browsers
FROM mcr.microsoft.com/playwright:v1.49.0-noble

# Install Xvfb (X virtual framebuffer) so headed browser mode can run
RUN apt-get update && \
    apt-get install -y xvfb && \
    rm -rf /var/lib/apt/lists/*

# Set up app directory
WORKDIR /app

# Copy package configuration files
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Install Chromium browser binaries via Playwright (matching configuration)
RUN npx playwright install chromium

# Copy all application code
COPY . .

# Expose backend API port
EXPOSE 3000

# Set default env variables
ENV PORT=3000
ENV NODE_ENV=production

# Start Node server
CMD ["node", "server.js"]
