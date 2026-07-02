# Dozzle Log Viewer Service

Dozzle is a simple, lightweight, real-time log viewer for Docker containers. It is entirely stateless and does not store log history on disk, querying the host's Docker socket on demand.

## Technical Specifications

- **Exposed Host Ports**:
  - `9999` (HTTP Web Interface)
- **Volume Mounts**:
  - `/var/run/docker.sock:ro` - Read-only socket mount to query container log streams.

## Environment Variables

See [.env.example](file:///D:/My_Projects/HomeLab/services/dozzle/.env.example):
- `DOZZLE_PORT`: Host port bound to HTTP web portal (default: `9999`).
- `TZ`: System timezone (e.g. `UTC`).

## Initial Setup Steps

1. Copy this folder to the Ubuntu host server.
2. Clone `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Start Dozzle:
   ```bash
   docker compose up -d
   ```
4. Open your browser and navigate to `http://<server-ip>:9999`.

## Backup & Restore Procedure

Because Dozzle is a stateless container, **no backup or restore procedure is necessary**. It reads active container logs directly from the Docker daemon memory buffers. If the container is destroyed or migrated, no data is lost. 

To restore the service on a new server, simply spin up the container using this compose directory.

## Upgrade Procedure

1. Navigate to the `services/dozzle` directory.
2. Pull the latest image:
   ```bash
   docker compose pull
   ```
3. Recreate the service container:
   ```bash
   docker compose up -d --remove-orphans
   ```
