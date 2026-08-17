# HomeLab OS API Specification

This document provides a comprehensive reference for all RESTful HTTP endpoints, WebSocket event streams, authentication flows, error formats, and rate limiting policies in the HomeLab OS control plane (v1 API).

---

## 1. Global Conventions & Standards

### 1.1 Base URL
All REST routes are prefixed under the versioned namespace:
```
http://<host>:8081/api/v1
```

### 1.2 Standard Success Response Envelope
All mutating and authenticated queries return payloads encapsulated in a standard envelope:
```json
{
  "success": true,
  "data": { ... }
}
```

### 1.3 Standard Error Response Envelope
Errors follow a uniform JSON schema providing machine-readable error codes and human-readable explanations:
```json
{
  "success": false,
  "error": {
    "message": "The password must be at least 8 characters long.",
    "code": "VALIDATION_ERROR"
  }
}
```

Common error codes:
- `UNAUTHORIZED`: Authentication token missing, invalid, or expired.
- `FORBIDDEN`: User role lacks required permission for this resource.
- `VALIDATION_ERROR`: Request body failed AJV schema constraints.
- `RATE_LIMIT_EXCEEDED`: Too many requests submitted in a time window.
- `NOT_FOUND`: Target entity or service does not exist.
- `INTERNAL_ERROR`: Unhandled runtime exception inside the daemon.

### 1.4 Authentication & Sliding JWT Tokens
Mutating and administrative endpoints require a Bearer token in the `Authorization` header:
```http
Authorization: Bearer <jwt_token>
```
If a valid token has less than 30 minutes before expiration, the server automatically issues a renewed token via the `X-Renewed-Token` response header.

### 1.5 Role-Based Access Control (RBAC)
HomeLab OS enforces a three-tier role access model across all API routes:
- `admin`: Full administrative access (Container management, Settings, Terminal, Remote Desktop, Backups).
- `editor`: Operational access (Start, stop, and restart containers, edit workspace layouts).
- `viewer`: Read-only access (Inspect metrics, health, container status, and topology diagrams). Mutating requests are rejected with HTTP 403 Forbidden.

> Note: Initial setup creates the primary Master Administrator (`admin`). RBAC permission enforcement is active across all endpoints.

---

## 2. Authentication Endpoints (`/api/v1/auth`)

### `GET /api/v1/auth/setup-status`
Checks whether initial administrator setup has been completed.
- **Access**: Public
- **Response**:
  ```json
  {
    "isSetup": true,
    "hasUsers": true
  }
  ```

### `POST /api/v1/auth/setup`
Initializes the primary root administrator account. Only executable when no users exist.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "SecurePassword123!",
    "email": "admin@example.com"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "user": { "id": "uuid", "username": "admin", "role": "admin" },
    "token": "<jwt_token>"
  }
  ```

### `POST /api/v1/auth/login`
Validates user credentials and triggers 2FA challenge dispatch if enabled.
- **Access**: Public (Subject to IP rate limiting: 5 failed attempts / 10 min)
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "SecurePassword123!"
  }
  ```
- **Response (2FA Disabled)**:
  ```json
  {
    "success": true,
    "token": "<jwt_token>",
    "user": { "id": "uuid", "username": "admin", "role": "admin" }
  }
  ```
- **Response (2FA Enabled)**:
  ```json
  {
    "success": true,
    "requires2FA": true,
    "maskedEmail": "a***n@example.com",
    "challengeToken": "<temp_challenge_token>"
  }
  ```

### `POST /api/v1/auth/2fa-email-confirm`
Verifies user confirmation to send a 6-digit OTP code to their registered email.
- **Access**: Public with `challengeToken`
- **Request Body**:
  ```json
  {
    "challengeToken": "<temp_challenge_token>"
  }
  ```

### `POST /api/v1/auth/2fa-verify`
Validates the submitted 6-digit numeric OTP code.
- **Access**: Public with `challengeToken`
- **Request Body**:
  ```json
  {
    "challengeToken": "<temp_challenge_token>",
    "code": "123456"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "token": "<jwt_token>",
    "user": { "id": "uuid", "username": "admin", "role": "admin" }
  }
  ```

### `GET /api/v1/auth/me`
Fetches authenticated user identity.
- **Access**: `viewer`, `editor`, `admin`
- **Response**: User profile data and active permissions.

### `PUT /api/v1/auth/password`
Updates user account password.
- **Access**: `viewer`, `editor`, `admin`
- **Request Body**:
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "NewSecurePassword456!"
  }
  ```

---

## 3. Docker & Container Management (`/api/v1/docker`)

### `GET /api/v1/docker/containers`
Lists all containers detected on the Docker socket with enriched status, ports, and public Cloudflare URL bindings.
- **Access**: `editor`, `admin`
- **Response**: Array of container descriptors.

### `GET /api/v1/docker/containers/:id/logs`
Streams recent log buffers for the specified container.
- **Access**: `editor`, `admin`
- **Query Parameters**:
  - `tail`: Integer line count (default: `100`).
- **Response**: Raw stdout/stderr string lines.

### `POST /api/v1/docker/containers/:id/:action`
Executes a lifecycle operation asynchronously via the Jobs engine.
- **Access**: `editor`, `admin`
- **Path Parameters**:
  - `id`: Container identifier or name.
  - `action`: `start` | `stop` | `restart` | `kill` | `pause` | `unpause`.
- **Response**:
  ```json
  {
    "success": true,
    "jobId": "job-uuid"
  }
  ```

### `GET /api/v1/docker/stats`
Fetches real-time CPU percentage, memory consumption, and network I/O per container.
- **Access**: `editor`, `admin`

---

## 4. Infrastructure Topology & Designer (`/api/v1/designer`)

### `GET /api/v1/designer/topology`
Returns the topological graph representation containing nodes (Internet, Cloudflare Tunnel, Reverse Proxy, Containers) and links with saved canvas coordinates.
- **Access**: `editor`, `admin`

### `POST /api/v1/designer/layout`
Persists visual node coordinates configured in the visual designer canvas.
- **Access**: `editor`, `admin`
- **Request Body**:
  ```json
  {
    "layout": {
      "internet": { "x": 400, "y": 50 },
      "cloudflared": { "x": 400, "y": 150 },
      "portainer": { "x": 100, "y": 340 }
    }
  }
  ```

### `POST /api/v1/designer/deploy`
Compiles an interactive node-link canvas graph into a valid Docker Compose configuration and triggers deployment.
- **Access**: `editor`, `admin`
- **Request Body**:
  ```json
  {
    "nodes": [ ... ],
    "links": [ ... ]
  }
  ```

---

## 5. System Health & Telemetry (`/api/v1/health`, `/api/v1/metrics`)

### `GET /api/v1/health`
Evaluates and reports operational health of all underlying host subsystems.
- **Access**: Public
- **Response**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-08-17T23:30:00.000Z",
    "subsystems": {
      "database": { "status": "online", "details": "SQLite WAL connected" },
      "docker": { "status": "online", "details": "Socket proxy responsive" },
      "tunnel": { "status": "online", "details": "Cloudflare tunnel active" },
      "scheduler": { "status": "online", "details": "6 active cron jobs" }
    }
  }
  ```

### `GET /api/v1/metrics`
Returns current host hardware usage (CPU load averages, RAM allocations, disk usage, GPU utilization).
- **Access**: `viewer`, `editor`, `admin`

### `GET /api/v1/metrics/history`
Returns buffered time-series metrics over the previous 60 minutes for rendering sparkline charts.
- **Access**: `viewer`, `editor`, `admin`

---

## 6. Jobs & Task Operations (`/api/v1/jobs`)

### `GET /api/v1/jobs`
Lists active running tasks and execution history logs.
- **Access**: `editor`, `admin`

### `GET /api/v1/jobs/:id`
Returns real-time progress percentage, status (`pending`, `running`, `success`, `failed`), and output log buffers for a specific job.
- **Access**: `editor`, `admin`

### `POST /api/v1/jobs/:id/cancel`
Terminates a currently running background task.
- **Access**: `editor`, `admin`

---

## 7. Backups & Disaster Recovery (`/api/v1/backups`)

### `GET /api/v1/backups`
Lists all available backup tarballs staging in the `backups/` directory.
- **Access**: `admin`

### `POST /api/v1/backups/create`
Triggers an immediate transactional SQLite database backup and services archive.
- **Access**: `admin`

### `POST /api/v1/backups/restore`
Restores database state and configurations from a specified archive.
- **Access**: `admin`
- **Request Body**:
  ```json
  {
    "filename": "homelab_backup_2026-08-17.tar.gz"
  }
  ```

### `DELETE /api/v1/backups/:filename`
Deletes a backup archive from disk.
- **Access**: `admin`

---

## 8. Settings, SMTP & SSH (`/api/v1/settings`)

### `GET /api/v1/settings`
Returns all system configuration preferences grouped by category (`general`, `auth`, `smtp`, `ssh`, `desktop`, `backup`).
- **Access**: `admin`

### `PUT /api/v1/settings`
Updates system settings keys.
- **Access**: `admin`

### `POST /api/v1/settings/smtp/test`
Sends a test email over RFC 3207 STARTTLS to verify SMTP host, port, credentials, and TLS upgrade capabilities.
- **Access**: `admin`

### `POST /api/v1/settings/ssh/test`
Validates SSH connection credentials and handshake to the configured host node.
- **Access**: `admin`

### `GET /api/v1/audit`
Returns historical records of all mutating administrative actions with user IDs, timestamps, client IPs, and status codes.
- **Access**: `admin`

---

## 9. Dynamic Plugins & Widgets (`/api/v1/plugins`, `/api/v1/widgets`)

### `GET /api/v1/plugins`
Lists all discovered plugins parsed from `services/*/service.yaml`.
- **Access**: `viewer`, `editor`, `admin`

### `GET /api/v1/plugins/:id/settings`
Returns the plugin's dynamic settings schema alongside current persisted preference values.
- **Access**: `editor`, `admin`

### `PUT /api/v1/plugins/:id/settings`
Saves customized settings for a specific plugin.
- **Access**: `editor`, `admin`

### `POST /api/v1/plugins/reload`
Forces an immediate re-scan of the `services/` directory.
- **Access**: `admin`

---

## 10. WebSocket Gateway Specifications

### 10.1 System Event Stream (`ws://<host>:8081/ws?token=<jwt>`)
Used by the dashboard UI to subscribe to live updates without HTTP polling:
- **Subscribe Message**:
  ```json
  {
    "type": "subscribe",
    "events": ["system.metrics", "job.updated", "audit.created"]
  }
  ```
- **Live Metric Frame**:
  ```json
  {
    "type": "system.metrics",
    "data": { "cpu": 14.2, "ram": 42.8, "disk": 68.1 }
  }
  ```
- **Container Log Subscription**:
  ```json
  { "type": "subscribe_logs", "serviceId": "portainer" }
  ```

### 10.2 Interactive Terminal Stream (`ws://<host>:8081/ws/terminal?token=<jwt>`)
Multiplexes real-time terminal I/O over WebSocket directly to a remote SSH session or host shell:
- **Auth Handshake**:
  ```json
  {
    "type": "auth",
    "username": "sarvdev",
    "secret": "ssh_password_or_key",
    "cols": 120,
    "rows": 32
  }
  ```
- **Window Resize Event**:
  ```json
  { "type": "resize", "cols": 140, "rows": 40 }
  ```
- **Data Payload**:
  ```json
  { "type": "data", "data": "ls -la\n" }
  ```

### 10.3 Remote Desktop Signaling Stream (`ws://<host>:8081/ws/desktop?token=<jwt>`)
Facilitates WebRTC SDP offer/answer exchanges and transmits normalized input events to the host streamer daemon:
- **SDP Offer Exchange**:
  ```json
  { "type": "offer", "sdp": "v=0\r\no=...", "target": "host" }
  ```
- **Mouse Coordinate Event**:
  ```json
  { "type": "mousemove", "x": 0.452, "y": 0.318 }
  ```
- **Keyboard Injection Event**:
  ```json
  { "type": "keydown", "code": "KeyA" }
  ```
