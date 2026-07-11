# Multi-stage production build for HomeLab OS Dashboard

# Stage 1: Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Install native compilation dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Install all dependencies (production + development)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy TypeScript configuration and source files
COPY backend/tsconfig.json ./backend/
COPY backend/server.ts ./backend/
COPY backend/src ./backend/src

# Compile TypeScript to JavaScript
RUN cd backend && npm run build

# Stage 2: Runtime stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Install native compilation dependencies and Docker CLI client
RUN apk add --no-cache python3 make g++ docker-cli docker-cli-compose

# Install only production dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy compiled JavaScript output
COPY --from=build /app/backend/dist ./backend/dist

# Copy database schema DDL file to the expected path in dist
COPY --from=build /app/backend/src/database/schema.sql ./backend/dist/src/database/schema.sql

# Copy frontend static files
COPY frontend/ ./backend/frontend/

# Runtime environment settings
EXPOSE 8081

ENV NODE_ENV=production
ENV PORT=8081

WORKDIR /app/backend
CMD ["node", "dist/server.js"]
