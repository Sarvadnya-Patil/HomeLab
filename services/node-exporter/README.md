# Node Exporter

Prometheus agent for host hardware and OS metrics. It runs as a container on the host system to scrape machine-level resources (CPU, Memory, Disk, Network) and expose them on port 9100.

## Ports
- **Internal**: `9100/tcp` (scraped by Prometheus over `homelab-network`)
- **Exposed Host Port**: `9100` (for direct debugging of metrics at `/metrics`)

## Volumes
Node Exporter requires read-only mounts from the host OS to access system stats:
- `/proc:/host/proc:ro`
- `/sys:/host/sys:ro`
- `/:/rootfs:ro`

## Setup & Deployment
1. Ensure the shared external network `homelab-network` exists:
   ```bash
   docker network create homelab-network
   ```
2. Start the service:
   ```bash
   docker compose up -d
   ```
3. Test metrics output by curl-ing the endpoint:
   ```bash
   curl http://localhost:9100/metrics
   ```

## Backup & Restore
- **Backup**: This service holds no persistent state (data is stateless). No database backups are required.
- **Restore**: Re-create the container on any machine using this repository's `docker-compose.yml` file.
