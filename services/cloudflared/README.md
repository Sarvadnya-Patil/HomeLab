# Cloudflared Tunnel Service

Cloudflared runs the client daemon for Cloudflare Tunnels (formerly Argo Tunnels). It creates a secure, outbound-only connection from your local Homelab Docker network to the Cloudflare network, allowing you to expose your web interfaces (Homepage, Portainer, etc.) to the internet securely without opening inbound ports on your router or setting up dynamic DNS.

## Technical Specifications

- **Exposed Host Ports**: None (runs as a secure outbound-only daemon client).
- **Volume Mounts**:
  - `./config` - Holds the ingress routing definitions (`config.yml`) and your secret private keys (`credentials.json`).
- **Network Dependency**:
  - Connected to the shared external bridge network `homelab-network`.

## Environment Variables

See [.env.example](file:///D:/My_Projects/HomeLab/services/cloudflared/.env.example):
- `TZ`: System timezone (e.g. `UTC`).

## Setup Instructions

### Step 1: Create the Shared Docker Network
For Cloudflared to communicate with your other containers using their compose service names (e.g., `http://homepage:3000`), you must create a shared network on your Ubuntu server:
```bash
docker network create homelab-network
```
*Note: Make sure all other services are attached to this network (see their compose configuration files).*

### Step 2: Authenticate and Create the Tunnel
You can create your tunnel using the Cloudflare Dashboard (Zero Trust Portal -> Networks -> Tunnels) or via the Cloudflared CLI. If using CLI:
1. Log into your Cloudflare account from your server or dev environment:
   ```bash
   cloudflared tunnel login
   ```
   This generates a certificate file (`cert.pem`).
2. Create the tunnel:
   ```bash
   cloudflared tunnel create homelab-tunnel
   ```
   This outputs a Tunnel ID (UUID) and creates a credentials JSON file.

### Step 3: Configure Credentials & Routing
1. Copy the outputted JSON credentials file (usually named `<TUNNEL_UUID>.json`) from your host configuration directory (`~/.cloudflared/`) and place it inside `services/cloudflared/config/credentials.json` on the server.
2. Edit [config/config.yml](file:///D:/My_Projects/HomeLab/services/cloudflared/config/config.yml):
   * Replace `YOUR_TUNNEL_UUID_HERE` with your actual Tunnel UUID.
   * Edit the domain hosts (`homepage.example.com`, etc.) to match your registered domains.
3. Configure CNAME records in your Cloudflare DNS dashboard pointing your subdomains (e.g., `homepage.example.com`) to `<TUNNEL_UUID>.cfargotunnel.com`.

### Step 4: Run the Service
Start the container:
```bash
docker compose up -d
```

## Backup & Restore Procedure

### Backup
- Save the `services/cloudflared/config/config.yml` (routing rules).
- **CRITICAL:** Securely back up the `services/cloudflared/config/credentials.json` file. This file contains the private keys to connect your server to Cloudflare. **Do NOT commit it to Git.**

### Restore
1. Set up the directory structure.
2. Place your backed-up `config.yml` and `credentials.json` inside the `./config` folder.
3. Start the container with `docker compose up -d`.

## Upgrade Procedure

1. Navigate to the `services/cloudflared` folder.
2. Pull the latest Cloudflared image:
   ```bash
   docker compose pull
   ```
3. Recreate the container:
   ```bash
   docker compose up -d --remove-orphans
   ```
