# HomeLab OS

A scalable, modular, self-hosted infrastructure control plane developed for heterogeneous server deployment.

## Repository Structure

* [dashboard/](dashboard/) - HomeLab OS administration interface (Frontend/Backend).
* [services/](services/) - Discovered plugin manifest directories and docker-compose configurations.
* [configs/](configs/) - Shared application configuration files, certificates, and proxy variables.
* [templates/](templates/) - Docker Compose template definitions.
* [scripts/](scripts/) - Deployment, backup, update, and monitoring utilities.
* [backups/](backups/) - Local backup staging directory (Git-ignored).
* [logs/](logs/) - Infrastructure and container logs (Git-ignored).
* [docs/](docs/) - Detailed project specifications.

## Documentation Index

* [ROADMAP.md](docs/ROADMAP.md) - Project development phases and status.
* [SERVICES.md](docs/SERVICES.md) - Port allocations and capability mappings.
* [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Subsystem interface designs and lifecycle sequence flows.
* [PLUGIN_SDK.md](docs/PLUGIN_SDK.md) - Core SDK manifest schemes and widget models.

## Plugin Discovery Engine

Services are discovered dynamically by scanning `services/*/service.yaml` manifests. The HomeLab OS control plane registers discovered manifests, caches telemetry metadata in the SQLite database, and streams real-time updates to the UI.

## Prerequisites

Before deploying HomeLab OS, ensure the following components are available on the host machine.

### Docker Socket Proxy

HomeLab OS communicates with the Docker Engine through a Docker Socket Proxy. This proxy is required for container discovery, status monitoring, and infrastructure management.

### Cloudflare Tunnel (Optional, Recommended)

HomeLab OS can automatically discover and associate public domains with Docker services by integrating with an existing Cloudflare Tunnel deployment.

Supported deployments:
- Native `cloudflared` installation on the host.
- Dedicated `cloudflared` Docker container (recommended).

### Cloudflare Tunnel Requirements

Before enabling Cloudflare Tunnel integration:
- A Cloudflare Tunnel must already be created and authenticated.
- The active tunnel configuration must be available at one of the following locations:
  ```
  ~/.cloudflared/config.yml
  ```
  or
  ```
  ~/.cloudflared/config.yaml
  ```
- The tunnel configuration should define ingress rules using the **published Docker host ports** of your services.

Example:
```yaml
ingress:
  - hostname: portainer.example.com
    service: https://localhost:9443
  - hostname: n8n.example.com
    service: http://localhost:5678
  - service: http_status:404
```

---

## Automatic Cloudflare Service Discovery

HomeLab OS does **not** require users to manually configure public URLs for Docker containers.

Instead, it automatically:
1. Reads the local Cloudflare Tunnel configuration.
2. Parses all configured ingress rules.
3. Extracts the published Docker host ports referenced by each rule.
4. Queries the Docker Engine for every container's published host ports.
5. Automatically associates Docker services with their public Cloudflare hostnames.

This allows Cloudflare to remain the **single source of truth** for public routing while eliminating duplicate configuration inside HomeLab OS.

Example discovery flow:
```
Docker Container
        │
        │ Published Host Port
        ▼
localhost:9443
        │
        ▼
cloudflared config.yml
        │
        ▼
portainer.example.com
        │
        ▼
HomeLab OS
        │
        ▼
Open Service
```

---

## Security

HomeLab OS only requires read access to the Cloudflare Tunnel configuration.

Recommended volume mapping:
```yaml
volumes:
  - ~/.cloudflared/config.yml:/etc/cloudflared/config.yml:ro
```
Only the tunnel configuration file is mounted.

Tunnel credentials, certificates, and private authentication files remain isolated on the host and are never exposed to HomeLab OS.

---

## Recommended Cloudflare Deployment

Although HomeLab OS fully supports both native and Docker-based Cloudflare Tunnel deployments, running `cloudflared` as a dedicated Docker container is recommended for production environments.

Example:
```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    volumes:
      - ~/.cloudflared:/etc/cloudflared:ro
    command: tunnel run
```

### Why Docker is Recommended

Running Cloudflare Tunnel inside Docker provides several operational advantages:
- Automatic startup after system reboots.
- Automatic recovery if the tunnel process exits unexpectedly.
- Consistent deployment across Linux distributions.
- Simplified upgrades by pulling the latest container image.
- Isolation from the host operating system.
- Easy monitoring through Docker, Portainer, and HomeLab OS.
- Standard Docker lifecycle management (`start`, `stop`, `restart`, `logs`).

---

## Unified Global Search & Modifiers

HomeLab OS provides a fast, unified search bar in the header (accessible instantly using `Ctrl+K` or `Cmd+K`) that adapts to the active view:

*   **Dashboard & Containers**: Filters active services and container grids.
*   **Topology**: Highlights connection paths dynamically in **blue** (including flowing data animation) for matching nodes (ignoring root infrastructure nodes like Internet or Tunnel). Supports zoom-to-cursor scroll navigation.
*   **Health**: Dynamically filters active subsystem health cards (e.g., database, docker, tunnel) by name or status.
*   **Jobs**: Filters active operation threads and execution history logs. Supports advanced power-user filter prefix commands in both the Active and History lists:
    *   `/title <query>` - specifically filters jobs by their action/title (e.g., `/title system_backup`).
    *   `/target <query>` - specifically filters jobs by their target container (e.g., `/target n8n`).

---

## Database Backup System

Database configuration backups can be triggered manually in Settings under the **Backup** tab. Backups staging archives are transactionally saved to the `backups/` directory located at the root of the HomeLab OS workspace.

---

## Design Philosophy

HomeLab OS **does not create, configure, or manage Cloudflare Tunnels**.

Instead, it integrates with your existing Cloudflare deployment by discovering the active tunnel configuration and automatically resolving Docker services to their public domains.

This approach keeps Cloudflare responsible for ingress configuration while HomeLab OS focuses on infrastructure discovery, monitoring, and management.
