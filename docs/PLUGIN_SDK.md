# HomeLab OS Plugin SDK Specification

This document defines the architectural guidelines, schema models, and runtime hook conventions for creating and installing third-party plugins on the HomeLab OS platform.

---

## 1. Plugin Directory Structure

Each plugin resides in a dedicated folder under the `services/` directory. The plugin registry discovers and configures elements automatically by reading the metadata files.

```
services/
└── <plugin-id>/
    ├── service.yaml          # Mandatory manifest specification metadata
    ├── docker-compose.yml    # Mandatory Docker container setup instructions
    ├── .env.example          # Recommended environment defaults
    └── README.md             # Required documentation
```

---

## 2. Plugin Manifest Schema (`service.yaml`)

The plugin manifest specifies configurations, settings schemas, capabilities, UI widgets, and custom commands.

```yaml
# API spec versioning
apiVersion: homelab.khulnasoft.com/v1alpha1
kind: Service

# Metadata block
id: portainer                 # Unique plugin ID (lowercase, alphanumeric)
name: Portainer               # Human-readable title
category: Management          # Section grouping (Infrastructure | AI | Monitoring | Management)
description: Docker panel     # Short description

# Specification details
spec:
  version: latest             # Target software version
  icon: portainer.png         # Image file path relative to plugin directory
  enabled: true               # Default enabled state
  autostart: true             # Boot container on daemon startup
  compose: docker-compose.yml # Compose file filename target

  # Exposed ports
  ports:
    http: 9000
    https: 9443

  # Subsystem Capabilities
  capabilities:
    - start
    - stop
    - restart
    - logs
    - terminal
    - backup

  # Permissions settings (RBAC)
  permissions:
    - docker.control
    - logs.view

  # Dynamic Settings Form Schema
  settings:
    - key: host_domain
      label: Host Public Domain
      type: text
      required: true
      default: portainer.local
      description: Domain mapping for incoming traffic routes.
    - key: enable_ssl
      label: Enable SSL
      type: toggle
      default: false
      description: Terminate TLS encryption.
    - key: restart_policy
      label: Restart Policy
      type: select
      options:
        - always
        - unless-stopped
        - on-failure
      default: always
      description: Container daemon recovery scheme.

  # Commands palette shortcuts
  commands:
    - id: portainer.restart
      title: Restart Portainer Panel
      action: run-command:service:portainer:restart
    - id: portainer.logs
      title: View Portainer Output Logs
      action: run-command:service:portainer:logs

  # Backup & Restore specifications
  backup:
    enabled: true
    command: tar -czf backups/portainer.tar.gz -C services/portainer/data .
    exportPath: backups/portainer.tar.gz
    retentionDays: 7
```

---

## 3. Dynamic UI Widget API

Plugins can register dashboard widgets. Each widget module must implement the standard 7-method lifecycle interface:

```javascript
export default {
  id: 'widget-id',
  title: 'Widget Name',
  icon: 'cpu',
  supportedSizes: ['1x1', '2x1'],
  wsEvents: ['metrics'], // Subscribed websocket channel filters

  // 1. Instantiated when widget is created in memory
  initialize() {
    console.log('Widget initialized.');
  },

  // 2. Render HTML templates inside DOM wrapper
  async render(container) {
    container.innerHTML = `<div>Dynamic Widget UI</div>`;
  },

  // 3. Update UI states dynamically when event messages arrive
  update(container, eventData) {
    // Modify DOM nodes based on event payload
  },

  // 4. Executed when canvas element is resized
  resize(container, newSize) {
    // Recalculate sparklines or dimension adjustments
  },

  // 5. Triggered on widget removal from workspace
  destroy(container) {
    // Clear intervals or DOM listeners
  },

  // 6. Request event bus subscription
  subscribe() {
    // Bind notifications triggers
  },

  // 7. Remove event bus subscription
  unsubscribe() {
    // Unbind notifications triggers
  }
};
```

---

## 4. REST & WebSocket Gateway Interfaces

### REST Endpoints
* `GET /api/v1/plugins` — Returns list of parsed manifests specifications.
* `GET /api/v1/plugins/:id/settings` — Returns the manifest settings form schema alongside database preference values.
* `PUT /api/v1/plugins/:id/settings` — Persists customized preference values using the format `plugin.<id>.<key>`.
* `POST /api/v1/services/:id/action` — Triggers container action execution jobs.

### WebSocket Channels
Clients receive live updates by subscribing to event payloads:
* `system.metrics` — Aggregated host CPU/RAM allocations.
* `docker.logs.<id>` — Stdout streams for containers.
* `job.updated` — Real-time progress updates and log outputs from the Job Engine.
