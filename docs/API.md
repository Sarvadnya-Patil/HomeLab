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

Sessions are revocable and bounded:
- Every token is tied to the user's current token version. Signing out (`POST /api/v1/auth/logout`) or changing the password increments that version, which invalidates every token issued earlier, on every device.
- Each request re-reads the user from the database, so a deleted user or a changed role takes effect immediately rather than when the token expires.
- Renewal keeps an active session alive but stops once the session reaches its absolute lifetime (`SESSION_MAX_HOURS`, default 12), after which a fresh sign-in is required.

### 1.5 Role-Based Access Control (RBAC)
HomeLab OS enforces a three-tier role ladder, `viewer` < `editor` < `admin`, from a single policy table (`src/core/permissions.ts`). Each route is matched by longest path prefix and has a minimum role for reads (`GET`/`HEAD`) and for writes (every other method).

| Route prefix | Read | Write |
|---|---|---|
| `/terminal`, `/backups`, `/settings`, `/audit` | admin | admin |
| `/docker`, `/designer`, `/jobs` | editor | editor |
| `/servers` | viewer | admin |
| `/auth/me`, `/auth/password`, `/auth/logout`, `/auth/ws-ticket` | viewer | viewer |
| `/metrics`, `/workspaces`, `/notifications`, `/categories`, `/services`, `/plugins`, `/search`, `/health`, `/system`, `/apps`, `/docs` | viewer | editor |
| anything not listed | admin | admin |

The last row is deliberate: a newly added endpoint is admin-only until someone adds it to the table. Requests below the required role receive HTTP 403.

> Note: Initial setup creates the primary Master Administrator (`admin`). Roles other than these three are not recognised and are denied everywhere.

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
- **Access**: Public (Subject to IP rate limiting: 5 failed attempts / 10 min; successful logins are not counted). Once the limit is reached the endpoint returns `429` with a `Retry-After` header until the window expires. Behind a reverse proxy or tunnel, set `TRUST_PROXY` so the limit is applied per real client address rather than per proxy.
- **Errors**: `401` with `Incorrect username or password` for any failed credential check, whether the username exists or not.
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
- **Response**: `{ "success": true, "message": "...", "token": "<jwt_token>" }`. The password change ends every other session, so the response carries a replacement token for the caller.

### `POST /api/v1/auth/logout`
Revokes every session token belonging to the calling user (sign out everywhere).
- **Access**: `viewer`, `editor`, `admin`
- **Response**: `{ "success": true }`

### `POST /api/v1/auth/ws-ticket`
Issues a single-use ticket, valid for 30 seconds, used to open a WebSocket (see section 10).
- **Access**: `viewer`, `editor`, `admin`
- **Response**: `{ "ticket": "<opaque string>" }`

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

Browsers cannot set an `Authorization` header on a WebSocket, and putting the session token in the URL would record it in proxy and access logs. Instead, call `POST /api/v1/auth/ws-ticket` with the normal Bearer token, then connect with the returned ticket as `?ticket=<ticket>`. A ticket works once and expires after 30 seconds, so a logged URL never contains a credential that outlives the connection. Passing `?token=` is no longer accepted. The terminal and desktop sockets additionally require the `admin` role.

The host streamer daemon connects to `/ws/desktop/daemon` with the token generated when the daemon was installed. A loopback source address is not treated as proof of identity, and there is no built-in default token.

### 10.1 System Event Stream (`ws://<host>:8081/ws?ticket=<ticket>`)
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

### 10.2 Interactive Terminal Stream (`ws://<host>:8081/ws/terminal?ticket=<ticket>`)
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

### 10.3 Remote Desktop Signaling Stream (`ws://<host>:8081/ws/desktop?ticket=<ticket>`)
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
