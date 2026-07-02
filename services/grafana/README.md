# Grafana

Data visualization and systems telemetry dashboard suite. It connects to Prometheus as a data source to query metric logs and display them in customizable charts.

## Ports
- **Internal**: `3000/tcp`
- **Exposed Host Port**: `3003` (accessible locally at `http://localhost:3003`)

## Volumes & Permissions
- `./data:/var/lib/grafana` (Dashboard and account database folder)

> [!IMPORTANT]
> Grafana runs as UID `472` inside the container. To prevent write permission denied errors on Linux, ensure the local host `./data` directory is writable by this UID:
> ```bash
> chown -R 472:472 ./data
> ```

## Setup & Deployment
1. Ensure the shared external network `homelab-network` exists.
2. Setup environment credentials:
   ```bash
   cp .env.example .env
   # Edit .env to set your passwords
   ```
3. Start the service:
   ```bash
   docker compose up -d
   ```
4. Log into `http://localhost:3003` (credentials default to admin/admin).
5. Go to Connections -> Data Sources -> Add Prometheus. Use `http://prometheus:9090` as the URL, and click "Save & Test".

## Backup & Restore
- **Backup**: Archive the `./data` folder containing Grafana's local SQLite database and dashboard configuration:
   ```bash
   tar -czf grafana-backup.tar.gz ./data
   ```
- **Restore**: Extract the archive back to `./data` and reset ownership permissions before booting up the stack:
   ```bash
   tar -xzf grafana-backup.tar.gz
   chown -R 472:472 ./data
   docker compose up -d
   ```
