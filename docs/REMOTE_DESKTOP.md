# HomeLab OS Remote Desktop and Streaming Engine Specification

This document details the architecture, frame capture pipeline, WebRTC streaming engine, and Linux `/dev/uinput` hardware kernel input synthesis implemented in the HomeLab OS control plane.

---

## 1. Architectural Overview

The HomeLab OS Remote Desktop subsystem provides a low-latency, browser-based graphical session stream directly from the host operating system. It operates via a host-side daemon (`desktop_streamer.py`) that captures screen buffers, encodes video frames, translates user interaction events into Linux kernel input device events, and communicates with browser clients through a WebSocket-assisted WebRTC peer connection.

```mermaid
graph TD
    subgraph Browser Client
        UI[Remote Desktop Web Component]
        RTC_C[WebRTC PeerConnection Video Track]
        DC_C[RTCDataChannel / WebSocket Input]
    end

    subgraph HomeLab Dashboard Control Plane
        WS_B[WebSocket Signaling Bridge /ws/desktop]
        WS_D[Daemon Gateway /ws/desktop/daemon]
        WS_B <--> WS_D
    end

    subgraph Host OS Daemon desktop_streamer.py
        DC_D[RTCDataChannel Receiver]
        INPUT_K[Kernel Input Dispatcher]
        CAP[Multi-Tier Safe Display Grabber]
        ENC[H.264 Encoder: VAAPI Hardware or Software Fallback]
    end

    subgraph Linux Kernel
        UINPUT[/dev/uinput Kernel Module]
        EVDEV[Virtual Tablet & Keyboard Devices]
        DRM[/dev/dri Kernel Mode Setting & Render Nodes]
    end

    UI --> RTC_C
    UI --> DC_C
    DC_C --> WS_B
    WS_B --> WS_D
    WS_D --> DC_D
    RTC_C <--> ENC

    DC_D --> INPUT_K
    INPUT_K --> UINPUT
    UINPUT --> EVDEV

    DRM --> CAP
    CAP --> ENC
```

---

## 2. Multi-Tier Display Capture Hierarchy

Host environments vary across display servers (Wayland, X11, headless KMS, and virtual framebuffers). The `SafeDisplayGrabber` implements an automated fallback hierarchy to acquire valid framebuffers without crashing or freezing the session:

1. **Direct DRM/KMS Scanout (`libdrmtap`)**:
   - Reads the active display plane directly from the kernel via `drmModeGetPlane`/`drmModeGetFB2`, bypassing the compositor entirely.
   - Handles GPU tiling-to-linear conversion and multiple pixel formats (XRGB8888, ARGB8888, ABGR8888) transparently.
   - The lowest-latency path and, unlike the compositor-driven tiers below it, independent of which desktop session or display server is active. Requires an active, powered display connector -- if the monitor is off or disconnected, the kernel has no scanout buffer to read and this tier reports no active plane.
2. **Wayland Native Screencopy (`grim`)**:
   - For wlroots-compatible Wayland compositors (Sway, Wayfire, River). GNOME/Mutter does not implement the protocol this depends on, so this tier is expected to fail on GNOME sessions and is not the primary path there.
   - Utilizes `XDG_RUNTIME_DIR` and `WAYLAND_DISPLAY` environment descriptors.
3. **Shared Memory Scanout (`mss` / X11 / Xwayland)**:
   - Connects to the primary X11 root window via MIT-SHM shared memory extensions (`/tmp/.X11-unix/X0`).
   - Analyzes frame brightness (`ImageStat.Stat`) to ensure Xwayland scanout is not emitting pure black frames.
4. **Linux Linear Kernel Framebuffer (`/dev/fb0`, `/dev/fb1`)**:
   - Direct memory-mapped linear framebuffer capture from `/dev/fb0`.
   - Automatically parses `/sys/class/graphics/fb0/virtual_size` to determine runtime display dimensions (e.g. 1920x1080).
5. **Direct DRM/KMS Scanout Retry (`libdrmtap`)**:
   - A second attempt at tier 1, in case an intermediate tier's failure was transient.
6. **PyAutoGUI Fallback Engine**:
   - Platform-agnostic fallback for desktop environments with accessible display handles.

Every tier requires an active, powered display output at the kernel level -- none of them can produce a picture when the monitor itself has no power, since there is no scanout content anywhere in the pipeline to read.

---

## 3. Real-Time WebRTC Streaming & Telemetry

### 3.1 Video Track Pipeline
The video stream is encapsulated in a custom `VideoStreamTrack` derived from `aiortc`:
- **Worker Thread**: A dedicated capture worker pulls frames on a fixed cadence matched to the encoder's actual consumption rate, rather than looping as fast as the capture engine allows -- capturing faster than any consumer can use is wasted CPU work, not extra quality.
- **Black-Frame Detection**: Per-frame brightness is sampled from a small downscaled thumbnail rather than the full-resolution image, since detecting "is this frame black" doesn't need full-resolution accuracy and the cost of `ImageStat.Stat` scales with pixel count.
- **Cropping & Normalization**: Frame dimensions are automatically cropped to even integers (`w - (w % 2)`) to satisfy H.264 macroblock alignment rules.
- **Timestamp Synchronization**: Generates presentation timestamps (`pts`) and time bases for synchronized real-time RTP packetization.
- **WebSocket JPEG Stream Fallback**: In restricted networking environments where WebRTC UDP media doesn't reach the browser, the daemon downscales frames to 720p JPEG and multiplexes base64-encoded frame packets over WebSocket. The client reports its actual playback status back to the daemon once per second (not merely whether ICE has connected, which proves connectivity negotiated but not that video frames are actually decoding); the daemon uses a short rolling window of that confirmation, rather than a one-time flag, so the fallback resumes automatically if playback stalls after initially succeeding, and doesn't stay active indefinitely once real playback has recovered from a transient hiccup.

### 3.2 H.264 Encoding
Two encoder backends are supported, selected automatically and transparently:
- **Hardware (VAAPI)**: Where the host has a VAAPI-capable GPU (Intel Quick Sync, or AMD via Mesa), encoding is offloaded to that fixed-function hardware via a dedicated `ffmpeg` subprocess, substantially reducing CPU load compared to software encoding. A real end-to-end hardware encode is probed once at daemon startup before this path is ever used; any failure at any point -- at startup or mid-stream -- falls back to the software path for the remainder of that connection. Hosts without compatible hardware see no behavior change. Recovery from packet loss uses a short fixed keyframe interval rather than an on-demand forced keyframe, since there's no live way to signal a forced keyframe into an already-running encoder process -- restarting it instead would mean a real stall plus a burst of fresh keyframe data right when the connection may already be dropping packets, which makes loss-driven corruption worse rather than better.
- **Software (libx264)**: The default path, and the universal fallback. Supports on-demand forced keyframes directly, with no process restart needed.

Bitrate is bounded by `DEFAULT_BITRATE`/`MIN_BITRATE`/`MAX_BITRATE`, raised above `aiortc`'s stock webcam-tuned defaults so full-resolution desktop content stays legible, while `MIN_BITRATE` is kept low enough that the browser's REMB congestion-control feedback can still throttle the encoder down on a constrained link -- a bitrate floor that can't be lowered defeats the browser's ability to ask the encoder to send less, which just causes sustained congestion and packet loss instead of preventing it.

### 3.3 Live Telemetry Metrics
Every second, the daemon broadcasts operational metrics over the `RTCDataChannel` and WebSocket bridge, and the browser client independently reports its own WebRTC receive-side stats:
- `capture.state`: Operational state (`CAPTURE_OK`, `CAPTURE_BLACK_FRAMES`, `CAPTURE_UNAVAILABLE`, `INITIALIZING`).
- `capture.engine`: Active grabber engine (e.g., `LIBDRMTAP`, `WAYLAND_GRIM_sarvdev`, `SAFE_SHM`, `FBDEV_fb0`).
- `capture.resolution`: Source resolution string (e.g., `1920x1080`).
- `capture.fps`: Measured capture frame rate.
- `capture.mean_brightness`: Average luminance per frame (0.0 to 255.0).
- `encoder.codec`: Active encoder codec (e.g., `H264`).
- `encoder.hardware`: Which encoder backend is actually active (`VAAPI (<device>)` or `SOFTWARE`), surfaced specifically so hardware-encoding failures are visible without needing daemon log access.
- `encoder.fps`: Actual encoded frame rate.
- `webrtc.peer_state` and `webrtc.ice_state`: Connection status of the WebRTC peer.
- Client-side: packets received/lost, PLI (keyframe recovery) request count, decode FPS, and jitter, from the browser's own `RTCPeerConnection.getStats()`. Packet loss and PLI counts are cumulative for the life of the connection, so the diagnostics view evaluates a recent window of them rather than the lifetime total -- a single early loss event (common during ICE negotiation) shouldn't permanently mark the pipeline as unhealthy once it has actually recovered.

---

## 4. Hardware Kernel Input Engine (`/dev/uinput`)

To ensure seamless mouse precision, absolute positioning, and full keyboard injection without reliance on X11 fake key libraries, HomeLab OS interfaces directly with the Linux kernel `/dev/uinput` subsystem via `python-evdev`.

### 4.1 Virtual Input Devices
On initialization, the daemon registers two virtual input devices with the kernel:

1. **Virtual Tablet / Touch Device (`HomeLab-Virtual-Tablet`)**:
   - Configured with `EV_ABS` capabilities for absolute X and Y coordinate mapping:
     - `ABS_X`: Absolute range `[0, 1920]`
     - `ABS_Y`: Absolute range `[0, 1080]`
   - Configured with `EV_KEY` buttons: `BTN_LEFT`, `BTN_RIGHT`, `BTN_MIDDLE`, `BTN_TOUCH`.
   - Configured with `EV_REL` axes for scroll wheel events: `REL_WHEEL` (vertical) and `REL_HWHEEL` (horizontal).
2. **Virtual Keyboard Device (`HomeLab-Virtual-Keyboard`)**:
   - Configured with `EV_KEY` support for all standard Linux scancodes (`range(1, 255)`).

### 4.2 Coordinate Normalization & Event Synthesis
Client input coordinates are transmitted as normalized floating-point numbers between `0.0` and `1.0`:
- **Absolute Coordinate Translation**:
  ```python
  abs_x = int(data["x"] * 1920)
  abs_y = int(data["y"] * 1080)
  ui_mouse.write(e.EV_ABS, e.ABS_X, abs_x)
  ui_mouse.write(e.EV_ABS, e.ABS_Y, abs_y)
  ui_mouse.syn()
  ```
- **Button Click Synthesis**:
  ```python
  btn_code = e.BTN_LEFT if btn_name == "left" else (e.BTN_RIGHT if btn_name == "right" else e.BTN_MIDDLE)
  ui_mouse.write(e.EV_KEY, btn_code, 1 if action in ["mousedown", "click"] else 0)
  ui_mouse.syn()
  if action == "click":
      ui_mouse.write(e.EV_KEY, btn_code, 0)
      ui_mouse.syn()
  ```
- **Wheel Scrolling**:
  ```python
  steps = -1 if dy > 0 else 1
  ui_mouse.write(e.EV_REL, e.REL_WHEEL, steps)
  ui_mouse.syn()
  ```

### 4.3 Keycode Mapping Table
Browser JavaScript `event.code` identifiers are mapped to Linux kernel `KEY_*` constants:

| Browser Code | Linux Scancode | Linux Constant | Description |
| :--- | :--- | :--- | :--- |
| `KeyA` - `KeyZ` | `30, 48, 46, ...` | `KEY_A` - `KEY_Z` | Alphabet keys |
| `Digit0` - `Digit9` | `11, 2, 3, ...` | `KEY_0` - `KEY_9` | Number row |
| `Enter` / `Return` | `28` | `KEY_ENTER` | Return key |
| `Escape` | `1` | `KEY_ESC` | Escape key |
| `Backspace` | `14` | `KEY_BACKSPACE` | Backspace key |
| `Tab` | `15` | `KEY_TAB` | Tab key |
| `Space` | `57` | `KEY_SPACE` | Spacebar |
| `ShiftLeft` / `ShiftRight` | `42 / 54` | `KEY_LEFTSHIFT` / `KEY_RIGHTSHIFT` | Shift modifiers |
| `ControlLeft` / `ControlRight` | `29 / 97` | `KEY_LEFTCTRL` / `KEY_RIGHTCTRL` | Control modifiers |
| `AltLeft` / `AltRight` | `56 / 100` | `KEY_LEFTALT` / `KEY_RIGHTALT` | Alt modifiers |
| `MetaLeft` / `MetaRight` | `125 / 126` | `KEY_LEFTMETA` / `KEY_RIGHTMETA` | Super/Windows key |
| `ArrowUp` / `Down` / `Left` / `Right` | `103, 108, 105, 106` | `KEY_UP`, `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT` | Navigation arrows |
| `F1` - `F12` | `59 - 68, 87, 88` | `KEY_F1` - `KEY_F12` | Function keys |

---

## 5. Host Daemon Deployment & Systemd Configuration

### 5.1 Prerequisites on Host Machine
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-evdev ffmpeg libavdevice-dev
pip3 install aiortc av websockets pillow mss pyautogui
```

Optionally, for hardware-accelerated H.264 encoding on Intel or AMD GPUs (the daemon probes for this automatically and falls back to software encoding if it isn't present or doesn't work):
```bash
sudo apt-get install -y intel-media-va-driver i965-va-driver mesa-va-drivers
```

### 5.2 Permissions
Grant the daemon access to `/dev/uinput` and kernel framebuffers:
```bash
sudo chmod 666 /dev/uinput
sudo usermod -a -G video,input $USER
```

### 5.3 Systemd Service Unit (`/etc/systemd/system/homelab-desktop-streamer.service`)
```ini
[Unit]
Description=HomeLab OS Remote Desktop Streamer Daemon
After=network.target display-manager.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/homelab/dashboard/backend/src/api
ExecStart=/usr/bin/python3 desktop_streamer.py --daemon-mode --daemon-token daemon_default_secret
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now homelab-desktop-streamer
```
