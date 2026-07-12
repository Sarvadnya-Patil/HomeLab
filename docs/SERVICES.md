# HomeLab Services Catalog

This document describes how services are registered and indexed inside the HomeLab OS environment.

## Dynamic Service Discovery

Rather than pre-bundling a static list of catalog templates, HomeLab OS uses a **Dynamic Discovery Engine**. It scans and discovers services in two ways:

1. **User Custom Services**: You can add your own custom services by creating a folder under [services/](file:///D:/My_Projects/HomeLab/services/) with a `service.yaml` manifest. The system will auto-register and present it on the dashboard.
2. **Running Docker Containers**: All active Docker containers running on the host Docker socket are dynamically auto-discovered and registered in real-time under the **Containers** category.

## Service Manifest Schema

If you wish to create a custom service manifest in your `services/` directory, refer to [PLUGIN_SDK.md](file:///D:/My_Projects/HomeLab/docs/PLUGIN_SDK.md) for details on metadata properties, capabilities (`open`, `start`, `stop`, `restart`, `logs`), ports, and permissions.

---

## Logo & Icon Resolution Engine

HomeLab OS employs a fully dynamic, client-side logo resolution system:

### 1. Dynamic CDN Mapping
The dashboard maps service and container identifiers to the public [selfh.st/icons](https://selfh.st/icons) library, dynamically fetching high-performance `.webp` logos from the jsDelivr CDN.

*   **Typo & Alias Matching:** An in-memory resolver maps common typos or variations (e.g., `postgres` $\rightarrow$ `postgresql`, `homelab-dashboard`/`docker-proxy` $\rightarrow$ `falcon`).
*   **Persistent Caching:** Assets are loaded with aggressive CDN caching headers so logos remain visible in the browser even when containers go offline or during a `docker compose down` state.

### 2. Auto-Brightness Canvas Analyzer
To ensure optimal legibility on the dashboard's dark theme:
*   As each WebP logo loads, an in-memory `canvas` (8x8 pixels) analyzes the average relative luminance of the visible pixels.
*   If the logo is detected as dark, grey, or black (brightness $< 130$ out of 255), the image `src` is automatically updated to the native CDN light-theme variant (appending `-light.webp`).

### 3. Bulletproof SVG Fallbacks
If a logo does not exist in the selfh.st catalog or fails to load:
*   The `onerror` handler captures the network failure.
*   It immediately swaps the failed image element for a high-quality, local vector SVG (e.g., the falcon icon for HomeLab services, or the database icon for SQLite/PostgreSQL databases), preserving the integrity and premium look of the UI.

---

> [!NOTE]
> Public subdomain URLs are dynamically resolved using the active host Cloudflare Tunnel configuration (`config.yml` or `config.yaml` inside `/etc/cloudflared/` or your home directory `~/.cloudflared/`). If a service is not mapped in the tunnel, it safely falls back to local LAN routing (`http://127.0.0.1:port`).
