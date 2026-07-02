# Prometheus

Systems monitoring database and alert manager. It scrapes metrics from configured jobs (like Node Exporter, cAdvisor, and Uptime Kuma) at regular intervals, evaluates rule expressions, and stores the time-series stats in its TSDB database.

## Ports
- **Internal**: `9090/tcp` (queried by Grafana over `homelab-network`)
- **Exposed Host Port**: `9090` (for console access and direct querying at `/`)

## Volumes & Permissions
- `./config/prometheus.yml:/etc/prometheus/prometheus.yml:ro`
- `./data:/prometheus` (TSDB database directory)

> [!IMPORTANT]
> Prometheus runs as UID `65534` (`nobody`) inside the container. To prevent write permission denied errors on Linux, ensure the local host `./data` directory is writable by this UID:
> ```bash
> chown -R 65534:65534 ./data
> ```

## Setup & Deployment
1. Ensure the shared external network `homelab-network` exists.
2. Start the service:
   ```bash
   docker compose up -d
   ```
3. Open the web interface at `http://localhost:9090` to verify status targets are "UP".

## Backup & Restore
- **Backup**: Run a backup of the TSDB database directory by stopping the container and archiving the `./data` folder:
   ```bash
   tar -czf prometheus-backup.tar.gz ./data
   ```
- **Restore**: Extract the archive back to the `./data` folder and restore owner permissions before starting the container:
   ```bash
   tar -xzf prometheus-backup.tar.gz
   chown -R 65534:65534 ./data
   docker compose up -d
   ```
