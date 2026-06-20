# Use the official Playwright Docker image containing pre-installed browsers
FROM mcr.microsoft.com/playwright:v1.60.0-noble

# Install the virtual display, window manager, and VNC/noVNC viewer used by headed mode
RUN apt-get update && \
    apt-get install -y xvfb fluxbox x11vnc novnc && \
    rm -rf /var/lib/apt/lists/*

# Set up app directory
WORKDIR /app

# Copy package configuration files
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Install Chromium browser binaries via the same Playwright version used by package-lock
RUN npx playwright install --with-deps chromium

# Copy all application code
COPY . .

# Expose backend API port
EXPOSE 3000

# Set default env variables
ENV PORT=3000
ENV NODE_ENV=production

# Start Node server
CMD ["node", "server.js"]
