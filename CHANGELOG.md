# Changelog

All notable changes to this project are documented in this file. The format is based on Keep a Changelog.

Releases `1.0.0` through `2.0.0` were tagged without changelog entries. Everything since `2.0.0` is described under 3.0.0 below.

---

## [3.0.0] - 2026-09-21

3.0.0 is a security-hardening release with a new Remote Desktop feature. It changes how the dashboard is deployed and how WebSocket clients authenticate, so read **Upgrade notes** before updating. Full notes: [docs/RELEASE_NOTES_3.0.0.md](docs/RELEASE_NOTES_3.0.0.md).

### Upgrade notes (breaking)
* **`ENCRYPTION_KEY` is required in production.** The server refuses to start without it. Secrets saved by earlier releases (SMTP password, remote desktop password) are still readable and are re-encrypted with your key the next time they are saved. Keep the key stable: changing it makes stored secrets unreadable until they are entered again.
* **`JWT_SECRET` is required in production**, as before.
* **Set `TRUST_PROXY`** (for example `1`) when the dashboard is behind a tunnel or reverse proxy. Without it every visitor shares the proxy's address for login rate limiting; with it wrongly set to `true` behind no proxy, clients could choose their own address.
* **WebSocket clients must use tickets.** `/ws`, `/ws/terminal` and `/ws/desktop` no longer accept `?token=`. Call `POST /api/v1/auth/ws-ticket` and pass the returned single-use ticket (`?ticket=`), valid for 30 seconds. The bundled frontend already does this.
* **The container runs unprivileged by default.** Managing the Remote Desktop daemon from the dashboard and auto-discovering Cloudflare Tunnel configs now need the opt-in override: `docker compose -f docker-compose.yml -f docker-compose.host-access.yml up -d --build`. The override grants a privileged container.
* **Roles are enforced.** `viewer`, `editor` and `admin` are checked per route from one policy table; anything not listed is admin-only. See [docs/API.md](docs/API.md).
* **Changing a password or signing out ends every session** for that user. The password-change response carries a replacement token so the browser that made the change stays signed in.
* **Sessions have an absolute lifetime** (`SESSION_MAX_HOURS`, default 12). Sliding renewal keeps an active session alive until then.
* **SMTP requires certificate validation and STARTTLS by default.** Relays with self-signed certificates or no STARTTLS need `SMTP_ALLOW_INSECURE=true`.
* **The site opens on the dashboard.** The last page is no longer remembered across visits; a refresh stays on the current page.
* **Per-user 2FA is not part of this release.** 2FA remains a single system-wide setting.

### Added
* **Remote Desktop.** Browser-based access to the host's desktop over WebRTC (VP8 or H.264, chosen by the browser), with keyboard, mouse and wheel input, automatic fallback to a JPEG stream over WebSocket, and a host daemon (`desktop_streamer.py`) that can be installed from Settings, with a log viewer. Capture uses the vendored libdrmtap library (hardware scanout, multi-card detection) and discovers user and login-screen (GDM) sessions automatically. It is not Wayland-only: it works on Wayland and X11 hosts, but needs Linux and a powered display output.
* **SSH terminal**: an interactive xterm.js terminal in the console, over an authenticated WebSocket.
* **Role-based access control** with a central policy table (`src/core/permissions.ts`) and tests covering it.
* **Session controls:** per-user token version (instant revocation), `POST /api/v1/auth/logout`, absolute session cap, single-use WebSocket tickets, and WebSockets closed when a session is revoked.
* **Login and 2FA rate limiting** keyed on the real client address.
* **Content Security Policy and security headers**, with CDN sources scoped per path, Subresource Integrity on third-party scripts, `FRAME_ANCESTORS` for embedding, and cache headers on static assets.
* **Docker Compose split:** the default file is unprivileged; `docker-compose.host-access.yml` opts in to host access. The container runs as a non-root user with `no-new-privileges` and dropped capabilities, and reaches Docker through the socket proxy.
* **Settings persistence** in the database with configurable data paths (`DATA_DIR`, `DB_PATH`), an account password form in Settings, and a cap on the Job Center panel height.
* Regression tests for authorization, WebSocket authentication, security headers and static assets (49 tests).

### Changed
* The container autostart endpoint validates the container identifier and runs `docker update` with an argument array instead of a shell string.
* Custom container icons are checked against a known-icon list, which removes the console 404 errors for containers without one.
* Cloudflare Tunnel detection finds the live `cloudflared` configuration and no longer drops ingress hostnames.
* The audit log attributes each action to the authenticated user.
* Untrusted values (container names, service labels, settings, API error text) are escaped before they reach `innerHTML`.
* Documentation was brought back in line with the code: API reference rewritten against the real routes, deployment and environment variables documented.

### Fixed
* Remote Desktop: single key presses repeating (`iiiiiiii`), capture threads leaking after disconnect (idle CPU near 260% before the fix), a `runuser`/`grim` retry storm that flooded the journal, and the video freezing on a stale frame after WebRTC recovered from the JPEG fallback.
* Frame-ancestors input could smuggle a line break into the header.
* `@fastify/static` 10 crashed on the first static request because header hooks now receive a reply.
* WebSocket handlers now use the `(socket, request)` signature of `@fastify/websocket` 11.

### Security
* Stored secrets no longer fall back to a publicly known key in production.
* The desktop daemon endpoint requires the configured token, compared in constant time; a loopback source address is no longer treated as proof of identity.
* Unlisted API routes are denied to non-admins by default.
* Login returns one message for an unknown user and a wrong password.

### Known issues
* The GPU widget reports no data; GPU metrics are not implemented yet.
* Remote Desktop may negotiate VP8 (software) when the browser offers it first; hardware H.264 depends on the browser's offer order and the host's VAAPI support.
* The daemon token is passed on the daemon's command line, so it is visible in the host's process list to local users.

## [0.9.0] - 2026-07-02
### Added
* Hashed user credentials using scrypt and unique random salts per user.
* Centralized Backup and Restore engine for SQLite databases and volumes.
* Workflow Automation Engine for executing operational triggers and actions.
* Interactive Workflows rules panel on the client dashboard.

## [0.8.0] - 2026-07-02
### Added
* Asynchronous Job Center logs panel.
* Subsystem Health Checks status dashboard.
* Dynamic plugin settings form builder.
* Drag-and-drop Visual Infrastructure Designer canvas.

## [0.7.0] - 2026-07-02
### Added
* Master Runtime Service Registry DI container.
* ContainerProvider interface layer abstracting Docker client socket proxy.
* Asynchronous Jobs Execution Engine.
* Modular routes folder structures under API v1.

## [0.6.0] - 2026-07-02
### Added
* WebSocket stream event subscription gateway.
* Core engine background collector cron schedulers.
* Real-time SVG telemetry sparkline charts.

## [0.5.0] - 2026-07-02
### Added
* Docker Compose service manifests configurations for standard infrastructure stacks.

## [0.4.0] - 2026-07-02
### Added
* Persistent SQLite database layer replacing legacy JSON files.
* Repository interfaces for users, settings, audit trails, and layouts.

## [0.3.0] - 2026-07-01
### Added
* Fastify-based backend REST API gateways.

## [0.2.0] - 2026-07-01
### Added
* Front-end HTML/CSS/JS client-side single-page dashboard grid.

## [0.1.0] - 2026-07-01
### Added
* Initial project directory structure.
