FROM node:20-alpine

WORKDIR /app

# Copy package files if they exist
COPY package*.json ./

# Install dependencies if package.json exists
RUN if [ -f "package.json" ]; then npm install --omit=dev; fi

# Copy application files
COPY server.js csuite.js agent_driver.js aggregated_chats.md ./
COPY .brain ./.brain

# Expose ports
EXPOSE 8002 8003

# Command is overridden in docker-compose.yml
CMD ["node", "server.js"]
