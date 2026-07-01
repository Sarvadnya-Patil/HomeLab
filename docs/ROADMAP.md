# HomeLab Development Roadmap

This document outlines the milestones for the deployment, configuration, and feature integration of the HomeLab system.

---

## Deployment Status Summary

### Milestone 1: Core Host Environment (Completed)
- Operating System: Linux environment initialized.
- Containerization Engine: Docker and Docker Compose configured.
- Networking & Security: Cloudflare Tunnel configured for secure public routing. Firewall rules and SSH keys active.

### Milestone 2: Basic Services Stack (Completed)
- Portainer: Deployed for container inspection.
- Uptime Kuma: Configured for service availability health checks.
- Dozzle: Configured for raw container logs rendering.
- Watchtower: Configured for automated image pulling.

### Milestone 3: Telemetry Infrastructure (Completed)
- Node Exporter: Configured to collect host hardware telemetry.
- cAdvisor: Configured to parse container-specific resource usage.
- Prometheus: Installed to scrap and buffer time-series statistics.
- Grafana: Deployed to render metrics dashboards.

### Milestone 4: Storage & Database Engines (Pending)
- Relational Storage: PostgreSQL deployment.
- Document Storage: MongoDB deployment.
- Memory Caching: Redis deployment.

### Milestone 5: Workflow Automation (Pending)
- n8n Integration: Deployed to coordinate automated cron events, alerts, and backups.

### Milestone 6: AI Subsystems (Pending)
- Ollama: Local inference runner configured.
- Open WebUI: Interface deployed for local model execution.
- Qdrant: Vector database indexed for RAG systems.
- SearXNG: Meta-search engine for privacy-preserving research.

### Milestone 7: File Management & Developer Tools (Pending)
- Nextcloud: File hosting and sync daemon.
- Immich: Media organization catalog.
- Code Server: Browser-based code IDE.

### Milestone 8: HomeLab OS Control Plane (Phase 0-1 Completed, Phase 2+ In Progress)
- Backend: TypeScript Fastify server with embedded SQLite engine.
- Dynamic Discovery: manifest scanning (`service.yaml`).
- Widget Engine: Fully responsive UI rendered from layout records.
- Docker API: Lifecycle command controls via Docker Socket Proxy.
