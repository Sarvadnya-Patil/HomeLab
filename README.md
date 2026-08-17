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
- **Multi-Tier Frame Capture:** Automated capture hierarchy supporting GNOME Shell D-Bus Screencast, Wayland native `grim`, MIT-SHM shared memory (`mss`), and Linux linear framebuffers (`/dev/fb0`).

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
- **Role-Based Access Control (RBAC):** Strict operational boundaries for `admin`, `editor`, and `viewer` roles.
- **Sliding JWT Sessions:** Auto-renewing access tokens for uninterrupted administrative sessions.

---

## 4. Quick Start (Docker Deployment)

Deploy HomeLab OS in under 60 seconds using Docker Compose:

```bash
# 1. Clone repository
git clone https://github.com/Sarvadnya-Patil/HomeLab.git
cd HomeLab/dashboard

# 2. Create the external homelab bridge network
docker network create homelab-network

# 3. Launch control plane and socket proxy
docker compose up -d --build
```

Open your browser at `http://localhost:8081` to access the console.

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

HomeLab OS integrates seamlessly with existing Cloudflare Tunnel deployments. Mount the read-only configuration file into the dashboard container:

```yaml
volumes:
  - ~/.cloudflared/config.yml:/etc/cloudflared/config.yml:ro
```

Tunnel private keys and certificate files remain isolated on the host operating system and are never exposed to the control plane.

---

## 8. Open Source Acknowledgements

HomeLab OS incorporates and builds upon high-quality open-source technologies:
- [libdrmtap](https://github.com/fxd0h/libdrmtap) by fxd0h — Direct DRM/KMS hardware screen grabber engine (MIT License).
- [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) by Tecnativa — Secure Docker socket proxy security profile (Apache 2.0).
- [selfh.st/icons](https://selfh.st/icons) by selfh.st — Homelab and self-hosted service iconography (MIT License).
