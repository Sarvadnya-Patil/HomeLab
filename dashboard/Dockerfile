# Multi-stage production build for HomeLab OS Dashboard
FROM node:20-alpine AS build

WORKDIR /app

# Install backend dependencies
COPY backend/package.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy backend source files
COPY backend/server.js ./backend/

# Copy frontend static files
COPY frontend/ ./frontend/

# Runtime environment
FROM node:20-alpine

WORKDIR /app

# Copy built files from build stage
COPY --from=build /app /app

EXPOSE 8081

ENV NODE_ENV=production
ENV BACKEND_PORT=8081

WORKDIR /app/backend
CMD ["node", "server.js"]
