# Homepage Dashboard Service

This module houses the Homepage dashboard (gethomepage.dev), serving as the initial dynamic navigation panel for the HomeLab.

## Technical Specifications

- **Default Internal Port**: `3000` (mapped to host via `HOMEPAGE_PORT` in `.env`)
- **Volume Mounts**:
  - `./config` - Holds yaml layout, theme settings, and assets.
  - `./data` - Application runtime directory.
  - `/var/run/docker.sock:ro` - Read-only Docker socket mount enabling container auto-discovery.

## Environment Variables

See [.env.example](file:///D:/My_Projects/HomeLab/services/homepage/.env.example):
- `HOMEPAGE_PORT`: External host port mapping (default: `3000`).
- `TZ`: System timezone (e.g. `UTC`, `America/New_York`).

## Service Discovery via Docker Labels

Homepage connects to the Docker socket of the host and parses container labels dynamically. To register a container on the dashboard automatically, add the following labels to its `docker-compose.yml`:

```yaml
services:
  my-app:
    image: my-app:latest
    labels:
      - "homepage.group=Automation"                  # Must match a group defined in settings.yaml layout
      - "homepage.name=Service Name"                # Title displayed on the card
      - "homepage.icon=app-icon.png"                 # Icon filename (supported from dashboard-icons pack)
      - "homepage.href=https://app.yourdomain.com"   # Redirection link when clicked
      - "homepage.description=Short description"     # Subtitle text below the title
```

### Pre-configured Dashboard Categories

Containers must define their `homepage.group` using one of these values (defined in settings layout):
- `Infrastructure`
- `Management`
- `Automation`
- `AI`
- `Databases`
- `Monitoring`
- `Storage`
- `Development`
- `Networking`
- `Security`
- `Utilities`

## How to Add New Services

1. **Docker Container Services (Recommended):** Add the corresponding labels inside the container's `docker-compose.yml` file and restart/spin it up. Homepage will automatically display it in the selected group.
2. **External / Non-Docker Services:** Open [config/services.yaml](file:///D:/My_Projects/HomeLab/services/homepage/config/services.yaml) and add the service manually under the desired category.

## Backup & Restore Strategy

Homepage is stateless; all visual configurations reside in the configuration text files.
- **Backup:** Copy the `services/homepage/config` directory using your backup utility.
- **Restore:** Recreate the folder, paste the config backup, duplicate `.env.example` to `.env` and fill variables, and start the container with `docker compose up -d`.
