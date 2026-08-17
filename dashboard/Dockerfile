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

# Install native compilation dependencies, Docker CLI client, and util-linux (nsenter)
RUN apk add --no-cache python3 make g++ docker-cli docker-cli-compose util-linux



# Copy package files and node_modules from the build stage directly to skip rebuilding native binaries
COPY backend/package*.json ./backend/
COPY --from=build /app/backend/node_modules ./backend/node_modules

# Copy compiled JavaScript output
COPY --from=build /app/backend/dist ./backend/dist

# Copy database schema DDL file to the expected path in dist
COPY --from=build /app/backend/src/database/schema.sql ./backend/dist/src/database/schema.sql

# Copy desktop streamer script to compiled api directory in dist
COPY --from=build /app/backend/src/api/desktop_streamer.py ./backend/dist/src/api/desktop_streamer.py

# Copy vendored native source libraries to dist
COPY --from=build /app/backend/src/native ./backend/dist/src/native

# Copy frontend static files
COPY frontend/ ./backend/frontend/

# Runtime environment settings
EXPOSE 8081

ENV NODE_ENV=production
ENV PORT=8081

WORKDIR /app/backend
CMD ["node", "dist/server.js"]
