# HomeLab Services Catalog

This document lists all running services inside the HomeLab environment, including repository paths, host ports, endpoints, and category groupings.

## Active Services Index

| ID | Name | Repo Path | Host Port | Target Access URL | Category | Description |
|---|---|---|---|---|---|---|
| `homepage` | Homepage | `services/homepage` | `3000` | `http://homepage.local` | Infrastructure | Central navigation landing page dashboard. |
| `portainer` | Portainer | `services/portainer` | `9443` | `https://portainer.local` | Management | GUI for managing Docker containers and images. |
| `uptime-kuma` | Uptime Kuma | `services/uptime-kuma` | `3001` | `http://uptime.local` | Monitoring | Uptime and status page monitoring suite. |
| `dozzle` | Dozzle | `services/dozzle` | `9999` | `http://dozzle.local` | Monitoring | Light real-time container log viewer. |
| `watchtower` | Watchtower | `services/watchtower` | N/A | N/A | Management | Automatically updates Docker images and containers. |
| `node-exporter` | Node Exporter | `services/node-exporter` | `9100` | `http://node-exporter.local:9100` | Monitoring | Host OS hardware stats agent. |
| `cadvisor` | cAdvisor | `services/cadvisor` | `8082` | `http://cadvisor.local:8082` | Monitoring | Container resource statistics agent. |
| `prometheus` | Prometheus DB | `services/prometheus` | `9090` | `http://prometheus.local:9090` | Monitoring | Scrape engine & time-series database. |
| `grafana` | Grafana | `services/grafana` | `3003` | `http://grafana.local:3003` | Monitoring | Metric query dashboards web UI. |

---

> [!NOTE]
> Services operate inside isolated Docker bridge networks. Public domains are routed via Cloudflare Tunnels to internal Docker bridge endpoints.
