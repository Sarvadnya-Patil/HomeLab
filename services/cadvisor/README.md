# cAdvisor

Container resource and performance analysis agent. Developed by Google, cAdvisor gathers and exports real-time resource usage statistics (CPU, Memory, Disk, Network) of all active Docker containers running on the host system.

## Ports
- **Internal**: `8080/tcp` (scraped by Prometheus over `homelab-network`)
- **Exposed Host Port**: `8082` (for direct debugging of metrics at `/metrics`)

## Volumes
cAdvisor requires read-only mounts from the host OS to access active Docker processes and stats:
- `/:/rootfs:ro`
- `/var/run:/var/run:ro`
- `/sys:/sys:ro`
- `/var/lib/docker/:/var/lib/docker:ro`
- `/dev/disk/:/dev/disk:ro`

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
   curl http://localhost:8082/metrics
   ```

## Backup & Restore
- **Backup**: Stateless service. No database backup necessary.
- **Restore**: Deploy the docker-compose template using this directory's `docker-compose.yml` file.
