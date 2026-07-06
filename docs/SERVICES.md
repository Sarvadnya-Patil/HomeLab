# HomeLab Services Catalog

This document describes how services are registered and indexed inside the HomeLab OS environment.

## Dynamic Service Discovery

Rather than pre-bundling a static list of catalog templates, HomeLab OS uses a **Dynamic Discovery Engine**. It scans and discovers services in two ways:

1. **User Custom Services**: You can add your own custom services by creating a folder under [services/](file:///D:/My_Projects/HomeLab/services/) with a `service.yaml` manifest. The system will auto-register and present it on the dashboard.
2. **Running Docker Containers**: All active Docker containers running on the host Docker socket are dynamically auto-discovered and registered in real-time under the **Containers** category.

## Service Manifest Schema

If you wish to create a custom service manifest in your `services/` directory, refer to [PLUGIN_SDK.md](file:///D:/My_Projects/HomeLab/docs/PLUGIN_SDK.md) for details on metadata properties, capabilities (`open`, `start`, `stop`, `restart`, `logs`), ports, and permissions.

---

> [!NOTE]
> Public subdomain URLs are dynamically resolved using the active host Cloudflare Tunnel configuration (`config.yml` or `config.yaml` inside `/etc/cloudflared/` or your home directory `~/.cloudflared/`). If a service is not mapped in the tunnel, it safely falls back to local LAN routing (`http://127.0.0.1:port`).
