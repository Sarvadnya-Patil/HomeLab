# HomeLab OS

A modular, self-hosted infrastructure control plane and management console developed for heterogeneous server deployment.

---

## 1. Repository Structure

* [dashboard/](file:///D:/My_Projects/HomeLab/dashboard/) — HomeLab OS central administration interface (TypeScript Fastify Backend and Vanilla JS SPA Frontend).
* [services/](file:///D:/My_Projects/HomeLab/services/) — Discovered plugin manifest directories and Docker Compose stack definitions.
* [configs/](file:///D:/My_Projects/HomeLab/configs/) — Shared application configurations, certificates, and proxy variables.
* [templates/](file:///D:/My_Projects/HomeLab/templates/) — Docker Compose template blueprints.
* [scripts/](file:///D:/My_Projects/HomeLab/scripts/) — Deployment, backup, update, and telemetry utilities.
* [backups/](file:///D:/My_Projects/HomeLab/backups/) — Local backup staging directory (Git-ignored).
* [logs/](file:///D:/My_Projects/HomeLab/logs/) — Infrastructure and daemon logs (Git-ignored).
* [docs/](file:///D:/My_Projects/HomeLab/docs/) — Technical specifications and architectural guides.

---

## 2. Documentation Index

* [ARCHITECTURE.md](file:///D:/My_Projects/HomeLab/docs/ARCHITECTURE.md) — Master system architecture, dependency injection registry, and lifecycle flows.
* [API.md](file:///D:/My_Projects/HomeLab/docs/API.md) — Exhaustive REST API endpoints and WebSocket gateway specifications.
* [REMOTE_DESKTOP.md](file:///D:/My_Projects/HomeLab/docs/REMOTE_DESKTOP.md) — Low-latency WebRTC video streaming and Linux `/dev/uinput` hardware kernel input engine.
* [TOPOLOGY.md](file:///D:/My_Projects/HomeLab/docs/TOPOLOGY.md) — Container topology auto-discovery and visual infrastructure designer.
* [COMPONENTS.md](file:///D:/My_Projects/HomeLab/docs/COMPONENTS.md) — Frontend web components, Single-Page Application (SPA) structure, and Dynamic Widget SDK.
* [PLUGIN_SDK.md](file:///D:/My_Projects/HomeLab/docs/PLUGIN_SDK.md) — Third-party plugin manifest schema (`service.yaml`) and lifecycle hooks.
* [SERVICES.md](file:///D:/My_Projects/HomeLab/docs/SERVICES.md) — Service catalog, logo resolution engine, and port mappings.
* [ROADMAP.md](file:///D:/My_Projects/HomeLab/docs/ROADMAP.md) — Development milestones and feature integration roadmap.

---

## 3. Core Capabilities

### 3.1 Remote Desktop & Streaming Engine
HomeLab OS incorporates a browser-based remote desktop streamer:
- **Low-Latency Video Pipeline:** Real-time H.264 video streaming over WebRTC (`aiortc`) with presentation timestamp synchronization and adaptive JPEG fallbacks.
- **Hardware Kernel Input (`/dev/uinput`):** Direct hardware-level mouse positioning and keyboard scancode injection via the Linux kernel `uinput` module, bypassing display server permissions.
- **Works on Wayland and X11:** capture and input happen at the kernel level, so the stream is not tied to one display server. It needs a Linux host and a powered display output (see [docs/REMOTE_DESKTOP.md](docs/REMOTE_DESKTOP.md#11-supported-environments)).
- **Multi-Tier Frame Capture:** Automated capture hierarchy: direct DRM/KMS scanout (`libdrmtap`), Wayland `grim` (wlroots compositors), MIT-SHM shared memory (`mss`), and Linux linear framebuffers (`/dev/fb0`).

### 3.2 Dynamic Container Topologies & Visual Designer
- **Automatic Graph Construction:** Resolves network pathways from external Internet DNS, through Cloudflare Tunnels, across reverse proxies, into application containers and volumes.
- **Interactive Visual Canvas:** Drag-and-drop node positioning with persistent coordinate storage.
- **Visual Compose Compiler:** Compiles interactive canvas diagrams directly into production-ready Docker Compose configurations.

### 3.3 Dynamic Service & Cloudflare Tunnel Discovery
- **Manifest Scanning:** Discovers custom services by scanning `services/*/service.yaml`.
- **Automatic Ingress Binding:** Parses active Cloudflare Tunnel configurations (`~/.cloudflared/config.yml`) and matches published container ports to public hostnames without manual URL configuration.

### 3.4 Enterprise-Grade Security Engine
- **Two-Factor Authentication (2FA):** Mandatory 3-step authentication challenge flow (Password $\rightarrow$ Email Confirmation $\rightarrow$ 6-Digit OTP).
- **RFC 3207 STARTTLS Support:** Native TLS socket upgrades for Gmail App Passwords, Outlook, and custom SMTP relays.
- **Multi-Layer Rate Limiting:** Anti-bruteforce protection (5 failed attempts / 10 min per IP) and OTP resend cooldown timers.
- **Role-Based Access Control (RBAC):** Strict operational boundaries for `admin`, `editor`, and `viewer` roles, enforced from a single policy table. Routes that are not listed require `admin`.
- **Revocable Sliding Sessions:** Auto-renewing access tokens that end on sign-out or password change and stop renewing after an absolute 12-hour limit. Browsers open WebSockets with single-use tickets, so the session token never appears in a URL.
- **Hardened Web Surface:** Content-Security-Policy without inline scripts, Subresource Integrity on CDN assets, output escaping in the SPA, no CORS, and `no-store` on API responses.

---

## 4. Quick Start (Docker Deployment)

Deploy HomeLab OS in under 60 seconds using Docker Compose:

```bash
# 1. Clone repository
git clone https://github.com/Sarvadnya-Patil/HomeLab.git
cd HomeLab/dashboard

# 2. Create the external homelab bridge network
docker network create homelab-network

# 3. Create the backend configuration, then set JWT_SECRET and ENCRYPTION_KEY in it
#    (both are required in production; generate each with: openssl rand -hex 32)
cp backend/.env.example backend/.env

# 4. Launch control plane and socket proxy
docker compose up -d --build
```

Open your browser at `http://localhost:8081` to access the console.

The stack runs **unprivileged** by default. Two features need host access and are opt-in: managing the Remote Desktop daemon from the dashboard, and auto-discovering Cloudflare Tunnel configs stored on the host. To enable them, layer the override file (read its header first: it makes the dashboard container privileged, which is effectively root on the host):

```bash
docker compose -f docker-compose.yml -f docker-compose.host-access.yml up -d --build
```

Running behind a reverse proxy or Cloudflare Tunnel? Set `TRUST_PROXY` in `backend/.env` so login rate limiting sees real client addresses.

---

## 5. Local Development Setup

To run the control plane locally without Docker containers:

```bash
# Navigate to backend source
cd dashboard/backend

# Install dependencies
npm install

# Start development server with live TypeScript reload
npm run dev
```

Run test suite and verify code quality:
```bash
# Run unit and integration tests
npm run test

# Run ESLint analysis
npm run lint
```

---

## 6. Docker Socket Proxy Architecture

HomeLab OS communicates with the Docker Engine through Tecnativa's Docker Socket Proxy rather than binding the raw `/var/run/docker.sock` to the web container:
- **Enforced Security Profile:** Only `CONTAINERS`, `IMAGES`, `POST` (for container start/stop/restart), `NETWORKS`, `VOLUMES`, and `INFO` APIs are enabled.
- **Blocked Operations:** Container execution (`EXEC`), secret inspection, and host filesystem mounting are blocked at the proxy boundary.

---

## 7. Cloudflare Tunnel Integration

HomeLab OS integrates with existing Cloudflare Tunnel deployments by reading the tunnel's `config.yml`. There are two ways to give it access, with different exposure:

**Narrow (recommended):** mount only the config file and tell HomeLab OS where it is. The container never sees your tunnel credentials.

```yaml
services:
  dashboard:
    volumes:
      - /etc/cloudflared/config.yml:/etc/cloudflared/config.yml:ro
    environment:
      - CLOUDFLARE_CONFIG_PATH=/etc/cloudflared/config.yml
```

**Automatic discovery:** `docker-compose.host-access.yml` mounts `/etc/cloudflared`, `/root/.cloudflared` and `/home` read-only so the dashboard can locate whichever config the running tunnel uses. Those directories can also contain tunnel credential JSON files and certificates, and the container can read them, so use this only where you accept that.

If `cloudflared` runs as a Docker container, HomeLab OS inspects that container directly (its launch arguments and bind mounts) to determine which `config.yml` it actually uses, rather than guessing among the well-known host locations above -- this matters on hosts with more than one candidate file (e.g. a stale file left in a user's home directory alongside the real one under `/etc/cloudflared`). When that detection isn't possible (`cloudflared` running natively via systemd, or its container not reachable), HomeLab OS falls back to scanning `/etc/cloudflared`, `/root/.cloudflared`, the dashboard user's own home directory, and every other user under `/home`, in that order. Set `CLOUDFLARE_CONFIG_PATH` to override with an explicit path.

With the narrow setup, tunnel private keys and certificate files stay on the host and are not visible to the container. With automatic discovery they are readable by it; see above.

---

## 8. Open Source Acknowledgements

HomeLab OS incorporates and builds upon high-quality open-source technologies:
- [libdrmtap](https://github.com/fxd0h/libdrmtap) by fxd0h — Direct DRM/KMS hardware screen grabber engine (MIT License).
- [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) by Tecnativa — Secure Docker socket proxy security profile (Apache 2.0).
- [selfh.st/icons](https://selfh.st/icons) by selfh.st — Homelab and self-hosted service iconography (MIT License).
