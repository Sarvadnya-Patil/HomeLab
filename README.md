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
