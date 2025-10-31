# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src ./src
COPY public ./public
COPY swagger.v1.json ./swagger.v1.json

# Default runtime port
ENV PORT=4040
EXPOSE 4040

CMD ["node", "src/server.js"]
