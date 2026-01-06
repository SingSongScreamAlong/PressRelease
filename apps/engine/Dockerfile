FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install && npm cache clean --force

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Default command: run the worker (scheduler)
CMD ["node", "dist/index.js"]

