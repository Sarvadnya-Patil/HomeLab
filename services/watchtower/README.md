# Watchtower Container Update Daemon

Watchtower is a utility that automates the process of updating running Docker containers. It monitors your image repositories (like Docker Hub or GitHub Container Registry) for new versions of the images you are running. When a new image is detected, it pulls the image, gracefully shuts down the container, and restarts it with the original run parameters.

## Technical Specifications

- **Exposed Host Ports**: None (runs as a background daemon process).
- **Volume Mounts**:
  - `/var/run/docker.sock` - Read-write socket access to pull new images, stop, and recreate containers.

## Environment Variables

See [.env.example](file:///D:/My_Projects/HomeLab/services/watchtower/.env.example):
- `WATCHTOWER_LABEL_ENABLE`: Set to `true` to require containers to explicitly opt-in for updates (recommended).
- `WATCHTOWER_CLEANUP`: Set to `true` to remove the old image after the container starts running the new version. Prevents disk space exhaustion.
- `WATCHTOWER_SCHEDULE`: A 6-field cron expression for when updates should run (default: `0 0 4 * * *` which is 4:00:00 AM daily).
- `TZ`: System timezone (controls scheduling execution times).

## How to Enable Container Updates (Opt-In Mode)

Because `WATCHTOWER_LABEL_ENABLE` is set to `true`, Watchtower will **ignore** all containers by default. To allow Watchtower to update a container, you must add the following label to its `docker-compose.yml`:

```yaml
services:
  my-app:
    image: my-app:latest
    labels:
      - "com.centurylinklabs.watchtower.enable=true" # Opt-in to Watchtower updates
```

> [!WARNING]
> Do NOT add this label to database containers (e.g. Postgres, MongoDB) or other stateful services. Major version updates can lead to database format differences and corrupted database folders. Update these containers manually after verifying backups.

## Initial Setup Steps

1. Copy this folder to the Ubuntu server.
2. Initialize your env file:
   ```bash
   cp .env.example .env
   ```
3. Run the container:
   ```bash
   docker compose up -d
   ```

## Backup & Restore Procedure

Watchtower is fully stateless and has no database or storage data. Re-creating the container via this compose file is sufficient to recover the service. No backups are required.

## Upgrade Procedure

1. Navigate to the `services/watchtower` directory.
2. Pull the latest image:
   ```bash
   docker compose pull
   ```
3. Restart the service container:
   ```bash
   docker compose up -d --remove-orphans
   ```
