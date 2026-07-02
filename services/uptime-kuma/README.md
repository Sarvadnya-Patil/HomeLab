# Uptime Kuma Service

Uptime Kuma is a self-hosted monitoring tool that tracks the availability of websites, APIs, Ping (ICMP) targets, TCP ports, DNS records, and Docker containers in real-time, sending alerts through over 90+ notification services (including Telegram, Discord, Gotify, and Email).

## Technical Specifications

- **Exposed Host Ports**:
  - `3001` (HTTP Web Interface)
- **Volume Mounts**:
  - `./data` - Holds the SQLite database (`kuma.db`), configuration settings, and historical monitoring logs.
  - `./backup` - Target directory for backups and database dumps.

## Environment Variables

See [.env.example](file:///D:/My_Projects/HomeLab/services/uptime-kuma/.env.example):
- `UPTIME_KUMA_PORT`: Host port bound to the HTTP web interface (default: `3001`).
- `TZ`: System timezone (e.g. `UTC`, `Asia/Kolkata`).

## Initial Setup Steps

1. Copy this folder to the Ubuntu host server.
2. Create your `.env` file from the template:
   ```bash
   cp .env.example .env
   ```
3. Start the Uptime Kuma container:
   ```bash
   docker compose up -d
   ```
4. Access the web interface at `http://<server-ip>:3001` in your browser.
5. Create the primary administrator account and configure your global settings.

## Backup Procedure

### Method 1: GUI Export (Configuration Only)
1. Open the Uptime Kuma UI.
2. Click your user avatar/settings icon in the top-right corner.
3. Select **Backup** from the sidebar.
4. Click **Export** to download a `.json` configuration dump.
   * *Note: This exports all monitors, settings, and notification channels, but does not export historical uptime logs.*

### Method 2: Host CLI Archive (Full Backup - Config + Uptime Logs)
1. Stop the container to prevent active sqlite locks:
   ```bash
   docker compose down
   ```
2. Archive the contents of the `./data` folder to the backup path:
   ```bash
   tar -czf ./backup/uptime-kuma-backup-$(date +%F).tar.gz ./data
   ```
3. Restart the container:
   ```bash
   docker compose up -d
   ```

## Restore Procedure

### Method 1: Clean Install GUI Restore
1. Spin up a fresh Uptime Kuma instance.
2. In the settings pane, navigate to **Backup**, select **Import**, and upload your configuration JSON backup.

### Method 2: Host CLI Database Restore
1. Stop the container:
   ```bash
   docker compose down
   ```
2. Remove the current database directory:
   ```bash
   rm -rf ./data
   ```
3. Extract your backup archive:
   ```bash
   tar -xzf ./backup/uptime-kuma-backup-YYYY-MM-DD.tar.gz
   ```
4. Restart the container:
   ```bash
   docker compose up -d
   ```

## Upgrade Procedure

Uptime Kuma is upgraded seamlessly:
1. Navigate to the `services/uptime-kuma` directory.
2. Pull the latest image:
   ```bash
   docker compose pull
   ```
3. Recreate the containers:
   ```bash
   docker compose up -d --remove-orphans
   ```
