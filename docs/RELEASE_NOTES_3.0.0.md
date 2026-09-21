# HomeLab OS 3.0.0

Released 2026-09-21. This is a security-hardening release that also introduces browser-based Remote Desktop and an SSH terminal. Because it changes how the dashboard is deployed and how WebSocket clients sign in, please read the upgrade steps first. The complete list of changes is in [CHANGELOG.md](../CHANGELOG.md).

## Highlights

- **Remote Desktop.** Open the host's desktop in your browser over WebRTC, with keyboard, mouse and scroll input. If WebRTC cannot play, it falls back to a JPEG stream automatically. The host daemon installs and updates from Settings and shows its journal there.
- **Works on Wayland and X11.** Capture and input happen at the kernel level (DRM/KMS and `/dev/uinput`), so the stream is not tied to one display server. It needs a Linux host and a powered display output; a headless server needs a display or a dummy plug. Details: [REMOTE_DESKTOP.md](REMOTE_DESKTOP.md#11-supported-environments).
- **SSH terminal** with a full interactive shell in the console.
- **Roles that are actually enforced.** `viewer`, `editor` and `admin` are checked on every route from one policy table, and a route nobody classified is admin-only.
- **Safer sessions.** Signing out or changing your password ends every session for your account. Sessions have an absolute lifetime (12 hours by default). WebSockets use single-use tickets instead of putting your token in the URL.
- **Hardened deployment.** The container runs unprivileged as a non-root user with dropped capabilities. Host access is a separate, opt-in compose file. A Content Security Policy, security headers and Subresource Integrity are on by default.
- **Secrets are encrypted with your own key.** The publicly known built-in key is gone in production.
- **The site opens on the dashboard.** Refreshing keeps you on the page you were on.

## Upgrade steps

1. **Generate the two secrets** and add them to `dashboard/backend/.env`:
   ```bash
   openssl rand -hex 32
   ```
   Run it twice: one value for `JWT_SECRET`, one for `ENCRYPTION_KEY`. The server will not start in production without both. Keep `ENCRYPTION_KEY` stable afterwards; if you change it, re-enter the SMTP and remote desktop passwords.
2. **Set `TRUST_PROXY`** if the dashboard sits behind Cloudflare Tunnel or another reverse proxy, for example `TRUST_PROXY=1`. Not sure how many proxies there are? Count the hops between the visitor and the dashboard; a single tunnel or proxy is `1`. Leave it unset if clients connect directly.
3. **Pull and rebuild.** Without host access:
   ```bash
   cd dashboard
   docker compose up -d --build
   ```
   With host access (needed to manage the Remote Desktop daemon from the dashboard and to auto-discover Cloudflare Tunnel configs; it makes the container privileged, so read the header of `docker-compose.host-access.yml` first):
   ```bash
   cd dashboard
   docker compose -f docker-compose.yml -f docker-compose.host-access.yml up -d --build
   ```
   To make the choice permanent, set `COMPOSE_FILE=docker-compose.yml:docker-compose.host-access.yml` in the environment or in `dashboard/.env`.
4. **Update the host daemon** if you use Remote Desktop: open Settings, Remote Desktop, and press **Install Host Daemon** (this needs host access). The daemon and the dashboard are updated together.
5. **Update any custom WebSocket clients.** `?token=` is no longer accepted. Request a ticket from `POST /api/v1/auth/ws-ticket` and connect with `?ticket=`. The bundled frontend already does this.
6. **Check integrations that call the API.** Errors now come in two shapes (a flat `{ "error": "..." }` and `{ "success": false, "error": { "message", "code" } }`), and roles are enforced. See [API.md](API.md).

If your SMTP relay uses a self-signed certificate or has no STARTTLS, certificate validation and STARTTLS are now required; set `SMTP_ALLOW_INSECURE=true` to keep the old behaviour, and only on a network you trust.

## Behaviour changes to be aware of

| Before | Now |
|---|---|
| Any signed-in user could call most routes | Roles decide, and unlisted routes are admin-only |
| A token stayed valid until it expired | Logout or a password change revokes all of a user's tokens |
| Sessions renewed indefinitely | Renewal stops at `SESSION_MAX_HOURS` (default 12) |
| WebSockets took `?token=` | WebSockets take a single-use `?ticket=` |
| The container was privileged | Privileged only with the host-access override |
| The site reopened on the last page | The site opens on the dashboard; a refresh stays put |

## Known issues

- **GPU widget.** It shows no data: GPU metrics are not implemented yet.
- **Video codec.** The browser's offer order decides between VP8 (software) and H.264. Only H.264 can use hardware encoding, and only where VAAPI works on the host.
- **Daemon token on the command line.** The Remote Desktop daemon receives its token as a command-line argument, so a local user on the host can see it in the process list. Treat the host as trusted, or rotate the token by deleting it and reinstalling the daemon.
- **Per-user 2FA** is not included. 2FA is a single system-wide setting.
- **Display required.** Remote Desktop cannot show anything while the monitor is off or unplugged.
- **Verification scope.** Remote Desktop was tested on an Ubuntu host through the `libdrmtap` capture path. The X11 (`mss`) fallback and a working `grim` session were not verified in this release.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | passes |
| `eslint` | passes |
| `npm test` | 49 of 49 pass |
| `npm audit --omit=dev` | 0 vulnerabilities |

## Documentation

- [API.md](API.md): rewritten against the actual routes, including roles, response formats, WebSockets and environment variables.
- [REMOTE_DESKTOP.md](REMOTE_DESKTOP.md): supported environments, input scaling and the service unit corrected.
- Not re-audited in this release: [TOPOLOGY.md](TOPOLOGY.md), [SERVICES.md](SERVICES.md), [PLUGIN_SDK.md](PLUGIN_SDK.md), [ROADMAP.md](ROADMAP.md).
