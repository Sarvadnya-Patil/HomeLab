# Portainer Community Edition (CE)

Portainer is a lightweight management user interface that allows you to easily manage your Docker environments, containers, stacks, volumes, and images via a web dashboard.

## Technical Specifications

- **Exposed Host Ports**:
  - `9443` (HTTPS - Recommended interface)
  - `9000` (HTTP - Legacy/Fallback interface)
- **Volume Mounts**:
  - `/var/run/docker.sock` - Read-write socket access to manage server-wide container daemons.
  - `./data` - Stores application database (`portainer.db`), encryption keys, credentials, and settings.
  - `./backup` - Mount point for backup exports.

## Environment Variables

See [.env.example](file:///D:/My_Projects/HomeLab/services/portainer/.env.example):
- `PORTAINER_HTTPS_PORT`: Host port bound to HTTPS (default: `9443`).
- `PORTAINER_HTTP_PORT`: Host port bound to HTTP (default: `9000`).
- `TZ`: System timezone (e.g., `UTC`, `Asia/Kolkata`).

## Initial Setup Steps

1. Copy this folder to the Ubuntu host server.
2. Copy `.env.example` to `.env` and verify ports:
   ```bash
   cp .env.example .env
   ```
3. Start the Portainer service:
   ```bash
   docker compose up -d
   ```
4. Access the web interface at `https://<server-ip>:9443` (or `http://<server-ip>:9000`).
5. **CRITICAL SECURITY NOTE:** You must configure the admin password within **12 minutes** of starting Portainer. If you wait longer, Portainer shuts down its initial setup handler for security. If this occurs, restart the container to reset the timer:
   ```bash
   docker compose restart portainer
   ```
6. Set the password, select **Get Started** with the local environment, and start managing containers.

## Backup Procedure

### Method 1: Web GUI Backup (Recommended)
1. Open the Portainer web UI.
2. Go to **Settings** (bottom-left navigation pane).
3. Locate the **Backup Portainer** card.
4. (Optional) Provide a password to encrypt backup credentials.
5. Click **Download Backup** to save the configuration archive locally.

### Method 2: Host CLI Snapshot (Offline)
1. Stop the Portainer container to prevent database writes:
   ```bash
   docker compose down
   ```
2. Create an archive of the `./data` directory:
   ```bash
   tar -czf ./backup/portainer-backup-$(date +%F).tar.gz ./data
   ```
3. Bring the container back online:
   ```bash
   docker compose up -d
   ```

## Restore Procedure

### Method 1: Clean Install GUI Restore
1. Spin up a fresh Portainer instance using this compose file.
2. On the initial setup screen, choose **Restore Portainer from backup**.
3. Select your downloaded backup archive, type the encryption password if used, and click **Restore**.

### Method 2: Host CLI Restore (Offline)
1. Stop the active container:
   ```bash
   docker compose down
   ```
2. Move or delete the old data folder:
   ```bash
   rm -rf ./data
   ```
3. Extract the backup archive:
   ```bash
   tar -xzf ./backup/portainer-backup-YYYY-MM-DD.tar.gz
   ```
4. Start Portainer:
   ```bash
   docker compose up -d
   ```

## Upgrade Procedure

Upgrades are straightforward because all data lives in `./data`.
1. Pull the latest Portainer CE container image:
   ```bash
   docker compose pull
   ```
2. Re-create and restart the service containers:
   ```bash
   docker compose up -d --remove-orphans
   ```
