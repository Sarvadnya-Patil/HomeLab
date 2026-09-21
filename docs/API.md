# HomeLab OS API Specification

This document is the reference for the HomeLab OS control plane (v1 API): every REST endpoint, the WebSocket channels, authentication, roles, and the response and error formats. It is checked against the route definitions in `dashboard/backend/src/api/`; if the two ever disagree, the code wins and this file has a bug.

---

## 1. Global Conventions

### 1.1 Base URL
All REST routes live under `/api/v1`:
```
http://<host>:8081/api/v1
```

### 1.2 Success Responses
Every authenticated `/api/v1` response is wrapped by a serialization hook, unless the handler already returned an object containing `success`, `error` or `statusCode`:

```json
{ "success": true, "data": { ... } }
```

- A handler that returns an array or a plain object (for example `GET /docker/containers`) is delivered as `data`.
- A handler that returns `{ "success": true, ... }` (for example `POST /services/:id/action` returning `{ "success": true, "jobId": "..." }`) is delivered as is, with no `data` wrapper.
- The **public** endpoints listed in section 1.4 are never wrapped.

The endpoint tables below show what the handler returns; apply the rule above to know what arrives on the wire.

### 1.3 Errors
Errors arrive in one of two shapes, depending on where they are raised:

- **Rejections from a handler or the auth layer** (missing token, wrong role, bad credentials, not found, rate limit) send a flat message:
  ```json
  { "error": "Forbidden: admin privilege required" }
  ```
- **Exceptions and schema validation failures** go through the central error handler:
  ```json
  {
    "success": false,
    "error": { "message": "The password must be at least 6 characters long.", "code": "VALIDATION_ERROR" }
  }
  ```
  `code` is `VALIDATION_ERROR` for request-body validation failures and otherwise the error's own code, falling back to `INTERNAL_ERROR`.

Clients should therefore read `error` as either a string or an object with a `message`.

Status codes in use: `400` bad input, `401` missing or invalid token or credentials, `403` role too low, `404` not found, `409` feature unavailable in this deployment (host access off), `429` rate limited (login responses include `Retry-After`), `500` server error.

### 1.4 Authentication
Every `/api/v1` request needs a Bearer token, except these public paths:

`/auth/login`, `/auth/setup`, `/auth/setup-status`, `/auth/2fa-verify`, `/auth/2fa-email-confirm`, `/health`, `/apps`, `/docs`, `/system/header`

```http
Authorization: Bearer <jwt_token>
```

If a valid token is close to expiry, the server sends a replacement in the `X-Renewed-Token` response header (also exposed through `Access-Control-Expose-Headers`); clients should store it.

Sessions are revocable and bounded:
- Each token carries the user's token version. Signing out (`POST /auth/logout`) or changing the password increments the version, which invalidates every token issued earlier on every device, and closes that user's open WebSockets.
- Each request re-reads the user, so a deleted user or a changed role takes effect immediately.
- Renewal keeps an active session alive only until its absolute lifetime (`SESSION_MAX_HOURS`, default 12). After that the user must sign in again.

### 1.5 Role-Based Access Control
Three roles form a ladder, `viewer` < `editor` < `admin`. Access is decided from one policy table (`dashboard/backend/src/core/permissions.ts`), matching the longest path prefix. `GET` and `HEAD` use the *Read* column; every other method uses *Write*.

| Route prefix | Read | Write |
|---|---|---|
| `/terminal`, `/backups`, `/settings`, `/audit` | admin | admin |
| `/docker`, `/designer`, `/jobs` | editor | editor |
| `/servers` | viewer | admin |
| `/auth/me`, `/auth/password`, `/auth/logout`, `/auth/ws-ticket` | viewer | viewer |
| `/metrics`, `/workspaces`, `/notifications`, `/categories`, `/services`, `/plugins`, `/search`, `/health`, `/system`, `/apps`, `/docs` | viewer | editor |
| anything not listed | admin | admin |

The last row is deliberate: a new endpoint is admin-only until someone adds it to the table. A request below the required role gets `403`. Unknown roles are denied everywhere.

### 1.6 Audit Trail
Every `POST`, `PUT`, `PATCH` and `DELETE` is recorded in the audit log with the acting user, method, path and client IP. Request bodies, passwords and tokens are never logged. Read the log with `GET /audit`.

### 1.7 Long-running Operations
Actions that take time (container actions, image pulls, backups, restores, compose scans and deploys) return `{ "success": true, "jobId": "<id>" }` immediately. Follow progress with `GET /jobs/:id` or the `job.updated` WebSocket event.

---

## 2. Authentication (`/auth`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/auth/setup-status` | public | Is first-run setup still required? |
| POST | `/auth/setup` | public, only while no user exists | Create the first administrator |
| POST | `/auth/login` | public | Sign in |
| POST | `/auth/2fa-email-confirm` | public | 2FA step 1: confirm the registered email, send a code |
| POST | `/auth/2fa-verify` | public | 2FA step 2: submit the code, receive a token |
| GET | `/auth/me` | viewer | The signed-in user |
| PUT | `/auth/password` | viewer | Change own password |
| POST | `/auth/logout` | viewer | Sign out everywhere |
| POST | `/auth/ws-ticket` | viewer | Get a single-use WebSocket ticket |

### `GET /auth/setup-status`
```json
{ "setupRequired": true }
```

### `POST /auth/setup`
Creates the administrator. Fails with `400` once any user exists.
```json
{ "username": "admin", "password": "at-least-6-chars", "displayName": "Admin" }
```
`username` is 3 to 30 characters, `password` at least 6, `displayName` 1 to 50. Response: `{ "success": true, "user": { "id", "username", "role" } }`. It does **not** return a token; sign in afterwards.

### `POST /auth/login`
```json
{ "username": "admin", "password": "..." }
```
- **2FA off:** `200 { "token": "<jwt>" }`
- **2FA on:** `202 { "twoFARequired": true, "emailHint": "...", "message": "..." }`. No token is issued yet.
- **Wrong credentials:** `401 { "error": "Incorrect username or password" }`, the same message whether or not the username exists.
- **Rate limit:** 5 failed attempts per client address per 10 minutes, then `429` with a `Retry-After` header. Successful logins are not counted. Set `TRUST_PROXY` so the address is the real client behind a tunnel or proxy.

### `POST /auth/2fa-email-confirm`
Step 1 of the 2FA sign-in. Re-checks the credentials and that the email matches the registered 2FA address, then emails a 6-digit code (valid 5 minutes).
```json
{ "username": "admin", "password": "...", "email": "admin@example.com" }
```
Response: `{ "otpDispatched": true, "message": "..." }`. Wrong email attempts are limited to 5 per 10 minutes per address.

### `POST /auth/2fa-verify`
Step 2. Credentials are checked again on every call.
```json
{ "username": "admin", "password": "...", "otp": "123456" }
```
Response: `{ "token": "<jwt>" }`. Limited to 5 attempts per 10 minutes per address.

### `GET /auth/me`
`{ "id", "username", "role", "displayName" }`. `401` if the token is missing, expired, revoked, or the user no longer exists.

### `PUT /auth/password`
```json
{ "currentPassword": "...", "newPassword": "at-least-6-chars" }
```
Response: `{ "success": true, "message": "...", "token": "<jwt>" }`. Every session issued before the change is revoked; the returned token keeps the calling browser signed in. `400` if the current password is wrong.

### `POST /auth/logout`
Revokes every session of the calling user. Response: `{ "success": true }`.

### `POST /auth/ws-ticket`
Issues a ticket for opening a WebSocket (section 10). Response: `{ "ticket": "<opaque string>" }`. A ticket is single use and expires after 30 seconds.

---

## 3. Containers, Services & Plugins

### 3.1 Services and plugins (`/services`, `/plugins`)
A *service* is a plugin manifest (`services/*/service.yaml`) merged with live container state.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/services` | viewer | Services enriched with container state |
| GET | `/services/:id/logs` | viewer | Recent log tail. Returns `{ "logs": "..." }`, including a readable message if Docker is offline or the container is not deployed |
| POST | `/services/:id/action` | editor | Run a container action as a job |
| PUT | `/services/:id/category` | editor | Move a service to another category |
| POST | `/services/:id/compose-up` | editor | Recreate the container from its Compose file, as a job |
| GET | `/plugins` | viewer | Discovered plugin manifests |
| GET | `/plugins/:id/settings` | viewer | `{ "schema": [...], "values": { ... } }` |
| PUT | `/plugins/:id/settings` | editor | Save plugin setting values |

`POST /services/:id/action` takes `{ "action": "start" | "stop" | "restart" | "toggle" | "remove" }` and returns `{ "success": true, "jobId": "..." }`. `remove` also adds the service to the ignore list so it is not rediscovered. Other actions fail the job with `Unsupported API action`.

`PUT /services/:id/category` takes `{ "categoryId": "...", "serverId": "local" }`.

### 3.2 Docker (`/docker`)
All Docker routes need `editor`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/docker/containers` | All containers with status, ports and public hostnames |
| GET | `/docker/images` | Local images |
| GET | `/docker/volumes` | Volumes |
| GET | `/docker/networks` | Networks |
| POST | `/docker/images` | Pull an image as a job. Body `{ "image": "nginx:alpine" }` |
| GET | `/docker/containers/:id/inspect` | Raw inspect output |
| GET | `/docker/containers/:id/logs` | `{ "logs": "..." }` |
| POST | `/docker/scan-compose` | Scan the host for Compose stacks as a job |
| POST | `/docker/containers/:id/autostart` | Body `{ "enabled": true }` sets the restart policy to `unless-stopped` (or `no`). Returns `{ "success": true, "policy": "..." }`. `400` for an invalid container identifier |

---

## 4. Topology Designer (`/designer`)
All need `editor`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/designer/topology` | Nodes (Internet, tunnel, proxy, containers, networks, volumes) with saved positions |
| POST | `/designer/layout` | Save node positions. Body `{ "layout": { "<nodeId>": { "x": 400, "y": 50 } } }` |
| POST | `/designer/deploy` | Compile `{ "nodes": [...], "links": [...] }` into a Compose stack (`services/custom-stack`) and deploy it as a job |

---

## 5. Health, System & Metrics

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | public | Subsystem status |
| GET | `/system/header` | public | Hostname, OS, kernel, uptime, current time and subsystem status for the page header |
| GET | `/system` | viewer | Latest hardware metrics snapshot |
| GET | `/metrics/history` | viewer | Recent metric samples. `?limit=` (default 60) |

`GET /health` (unwrapped):
```json
{
  "status": "healthy",
  "subsystems": {
    "database": { "status": "online", "details": "..." },
    "docker": { "status": "online", "details": "..." },
    "tunnel": { "status": "online", "details": "..." },
    "scheduler": { "status": "online", "details": "..." }
  }
}
```

> GPU fields in the metrics are currently `null`; GPU metrics are not implemented.

---

## 6. Jobs (`/jobs`)
All need `editor`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/jobs` | Recent jobs. `?limit=` (default 50) |
| GET | `/jobs/:id` | One job: status (`pending`, `running`, `success`, `failed`), progress and log output. `404` if unknown |
| POST | `/jobs/:id/cancel` | Marks a pending or running job failed. `400` if it already finished, `404` if unknown |

---

## 7. Backups (`/backups`)
All need `admin`. Each returns `{ "success": true, "jobId": "..." }`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/backups/db` | Back up the SQLite database |
| POST | `/backups/plugin/:pluginId` | Back up a plugin's volumes. `404` if the plugin is unknown |
| POST | `/backups/restore` | Restore the database. Body `{ "backupFile": "<file name>" }`; `400` if missing |

Old backups are pruned by the scheduler according to the `backup.retention_days` setting.

---

## 8. Settings, Security & Audit
All need `admin`.

### 8.1 General and audit
| Method | Path | Purpose |
|---|---|---|
| GET | `/settings` | All settings. The SMTP password is masked as `••••••••` |
| PUT | `/settings` | Body `{ "<key>": { "value": "...", "groupName": "general" } }`. Sending the masked SMTP password back leaves it unchanged |
| GET | `/audit` | Audit records, newest first. `?limit=` (default 100) |

### 8.2 SMTP and 2FA
2FA is one system-wide switch, not per user.

| Method | Path | Purpose |
|---|---|---|
| GET | `/settings/2fa/status` | `{ enabled, provider, smtpHost, smtpPort, smtpUser, senderEmail, senderName, targetEmail, hasPassword }` |
| POST | `/settings/smtp` | Save SMTP settings. Requires `smtpHost` and `smtpUser`; the password is encrypted with `ENCRYPTION_KEY`. Certificates are validated and STARTTLS is required unless `SMTP_ALLOW_INSECURE=true` |
| POST | `/settings/2fa/send-otp` | Email an activation code to `targetEmail`. One code per address per 60 seconds; the code is never returned |
| POST | `/settings/2fa/verify-otp` | Body `{ "targetEmail": "...", "otp": "123456" }`; enables 2FA when correct |
| POST | `/settings/2fa/disable` | Turn 2FA off |

### 8.3 SSH terminal
| Method | Path | Purpose |
|---|---|---|
| GET | `/settings/ssh` | `{ sshHost, sshPort, sshUser, sshAuthType }` |
| POST | `/settings/ssh` | Save the same fields; `sshHost` is required. Use `local` to open a shell on the dashboard host |
| POST | `/terminal` | Run a command in the built-in pseudo-shell. Body `{ "command": "..." }`, returns `{ "output": "..." }`. It understands a fixed set of dashboard commands (such as `uptime`, `df`, `docker stats` and `docker logs`); it is not a real shell |

### 8.4 Remote desktop
| Method | Path | Purpose |
|---|---|---|
| GET | `/settings/desktop` | `{ enabled, username, password (masked), hostUser, serviceActive, hostAccess }`. `hostAccess` is whether the host-access override is active |
| POST | `/settings/desktop` | Save settings and restart the host daemon. Enabling requires `username`, `password` and `hostUser` |
| GET | `/settings/desktop/logs` | `{ "logs": "..." }`, the last 50 journal lines of the daemon (Linux with host access) |
| POST | `/settings/desktop/install` | Install or update the host systemd service and streamer. `409` unless the host-access override is active |

---

## 9. Dashboard Content

All read routes need `viewer`; writes need `editor`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/workspaces` | List workspaces |
| POST | `/workspaces` | Create (an `id` is generated if omitted) |
| PUT | `/workspaces/:id` | Update |
| DELETE | `/workspaces/:id` | Delete, together with its widget layout |
| GET | `/workspaces/:workspaceId/widgets` | Widget layout |
| POST | `/workspaces/:workspaceId/widgets` | Save layout: array of `{ id, size, col, row, displayOrder }` |
| GET | `/categories` | List categories (includes an automatic `containers` category when needed) |
| POST | `/categories` | Create |
| PUT | `/categories/:id` | Update |
| DELETE | `/categories/:id` | Delete |
| GET | `/notifications` | `?limit=` (default 50), `?unread=true` |
| PUT | `/notifications/:id/read` | Mark one read |
| DELETE | `/notifications/read` | Clear all notifications |
| GET | `/search?q=` | Search services, workspaces, categories, jobs, notifications and commands (at most 15 results) |
| GET | `/servers` | Cluster servers (viewer) |
| POST | `/servers` | Add a server (admin) |
| PUT | `/servers/:id` | Update a server (admin) |
| DELETE | `/servers/:id` | Remove a server (admin) |

---

## 10. Application Registry and OpenAPI stub

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/apps` | public | The list of console views. The Remote Desktop entry reflects whether the host daemon is active |
| GET | `/docs` | public | A minimal OpenAPI document (title and version only). This file is the real reference |

---

## 11. WebSockets

Browsers cannot set an `Authorization` header on a WebSocket, and putting the session token in the URL would record it in proxy and access logs. Instead:

1. `POST /api/v1/auth/ws-ticket` (with the Bearer token) returns `{ "ticket": "..." }`.
2. Open the socket with `?ticket=<ticket>` within 30 seconds. A ticket works once.

`?token=` is not accepted. Sockets are closed when the user's sessions are revoked. A rejected connection receives `{ "type": "error", "message": "..." }` and is closed.

| Channel | Role | Purpose |
|---|---|---|
| `/ws?ticket=` | any | Live events |
| `/ws/terminal?ticket=` | admin | Interactive SSH or local shell |
| `/ws/desktop?ticket=` | admin | Remote desktop signaling and input (one client at a time; a new client replaces the previous one) |
| `/ws/desktop/daemon?token=` | daemon | The host streamer daemon. `token` is the daemon token generated at install time |

The daemon endpoint needs the configured token, compared in constant time. A loopback source address is never treated as proof of identity, because a proxy or tunnel on the same host makes every remote visitor look local.

### 11.1 Event stream (`/ws`)
```json
{ "type": "subscribe", "events": ["metrics", "services", "job.updated"] }
{ "type": "unsubscribe", "events": ["metrics"] }
{ "type": "subscribe_logs", "serviceId": "portainer" }
{ "type": "unsubscribe_logs", "serviceId": "portainer" }
```
A client receives only the event types it subscribed to (`"*"` subscribes to all). The server pushes `{ "type": "metrics", "data": { ... } }` roughly every 3 seconds, `{ "type": "services", "data": [...] }` when services change, and `{ "type": "job.updated", "data": { ... } }` as jobs progress. After `subscribe_logs`, the latest log tail arrives periodically as `{ "type": "terminal", "output": "...", "serviceId": "..." }`. An admin can also send `{ "type": "terminal", "command": "..." }` to the same pseudo-shell and receive `{ "type": "terminal", "command", "output" }`; other roles get an error frame.

### 11.2 Terminal (`/ws/terminal`)
Connects to the SSH target saved in Settings (or a local shell when the host is `local`). Without a configured host the server sends an error frame and closes.
```json
{ "type": "auth", "username": "user", "secret": "ssh_password_or_key", "cols": 120, "rows": 32 }
{ "type": "resize", "cols": 140, "rows": 40 }
{ "type": "data", "data": "ls -la\n" }
```

### 11.3 Remote desktop (`/ws/desktop`)
The server reports `{ "type": "status", "status": "daemon_online" | "daemon_offline" }` and forwards every other message between the browser and the daemon. Browser to daemon:
```json
{ "type": "offer", "sdp": "v=0\r\n..." }
{ "type": "mousemove", "x": 0.452, "y": 0.318 }
{ "type": "mousedown" }  { "type": "mouseup" }  { "type": "wheel" }
{ "type": "keydown", "code": "KeyA" }  { "type": "keyup", "code": "KeyA" }
{ "type": "reset_inputs" }
{ "type": "playback_status" }
```
Pointer coordinates are fractions of the screen (0 to 1). The daemon answers the offer, streams video over WebRTC, and falls back to `{ "type": "frame" }` JPEG messages when WebRTC is not playing; it also sends `{ "type": "telemetry" }`. See [REMOTE_DESKTOP.md](REMOTE_DESKTOP.md) for the full protocol and troubleshooting.

---

## 12. Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | random in development | Signs session tokens. **Required in production** |
| `ENCRYPTION_KEY` | development key only | Encrypts stored secrets. **Required in production**; keep it stable |
| `NODE_ENV` | | `production` enforces the two secrets above |
| `BACKEND_PORT`, `PORT` | `8081` | Listening port (`BACKEND_PORT` wins if both are set) |
| `TRUST_PROXY` | unset | `true`, a hop count (`1`), or a list of proxy IPs/CIDRs whose `X-Forwarded-For` is trusted |
| `SESSION_MAX_HOURS` | `12` | Absolute session lifetime |
| `FRAME_ANCESTORS` | none | Sites allowed to embed the dashboard (CSP source syntax) |
| `SMTP_ALLOW_INSECURE` | unset | `true` allows self-signed SMTP certificates and no STARTTLS |
| `HOST_ACCESS` | on, unless set to `false` | Host-level features (daemon install, tunnel discovery). The default compose file sets `false`; `docker-compose.host-access.yml` sets `true` |
| `DOCKER_PROXY_URL` | `http://docker-proxy:2375` | Docker socket proxy |
| `DATA_DIR`, `DB_PATH` (`DATABASE_PATH`) | | Data and database locations |
| `SERVICES_DIR` | | Where plugin manifests are discovered |
| `COMPOSE_CACHE_PATH` | | Compose discovery cache file |
| `CLOUDFLARE_CONFIG_PATH` | | Cloudflare Tunnel configuration to read |
| `NODE_EXPORTER_URL` | `http://node-exporter:9100` | Node exporter used for host metrics |
| `SERVER_HOSTNAME`, `HOST_HOSTNAME` | | Override the hostname shown in the dashboard |
