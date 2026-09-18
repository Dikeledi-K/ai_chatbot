FROM node:18-bullseye-slim

# Create app directory
WORKDIR /usr/src/app

# Install dependencies (use npm ci when lockfile present for reproducible builds)
COPY package*.json ./
RUN npm ci --only=production 2>/dev/null || npm install --only=production

# Copy application source
COPY . .

# Do not copy local secrets into the image; use runtime environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
