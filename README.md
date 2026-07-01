# HomeLab OS

A scalable, modular, self-hosted infrastructure control plane developed for heterogeneous server deployment.

## Repository Structure

- [dashboard/](file:///D:/My_Projects/HomeLab/dashboard/) - HomeLab OS administration interface (Frontend/Backend).
- [services/](file:///D:/My_Projects/HomeLab/services/) - Discovered plugin manifest directories and docker-compose configurations.
- [configs/](file:///D:/My_Projects/HomeLab/configs/) - Shared application configuration files, certificates, and proxy variables.
- [templates/](file:///D:/My_Projects/HomeLab/templates/) - Docker Compose template definitions.
- [scripts/](file:///D:/My_Projects/HomeLab/scripts/) - Deployment, backup, update, and monitoring utilities.
- [backups/](file:///D:/My_Projects/HomeLab/backups/) - Local backup staging directory (Git-ignored).
- [logs/](file:///D:/My_Projects/HomeLab/logs/) - Infrastructure and container logs (Git-ignored).
- [docs/](file:///D:/My_Projects/HomeLab/docs/) - Detailed project specifications.

## Documentation Index

- [PLAN.md](file:///D:/My_Projects/HomeLab/docs/PLAN.md) - Infrastructure specifications and implementation constraints.
- [ROADMAP.md](file:///D:/My_Projects/HomeLab/docs/ROADMAP.md) - Project development phases and status.
- [SERVICES.md](file:///D:/My_Projects/HomeLab/docs/SERVICES.md) - Port allocations and capability mappings.

## Plugin Discovery Engine

Services are discovered dynamically by scanning `services/*/service.yaml` manifests. The HomeLab OS control plane registers discovered manifests, caches telemetry metadata in the SQLite database, and streams real-time updates to the UI.
