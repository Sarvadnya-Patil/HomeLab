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
        ENC[aiortc / PyAV H.264 Encoder]
    end

    subgraph Linux Kernel
        UINPUT[/dev/uinput Kernel Module]
        EVDEV[Virtual Tablet & Keyboard Devices]
        DRM[/dev/dri/card0 & /dev/fb0]
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

1. **GNOME Shell D-Bus Screencast (`org.gnome.Shell.Screenshot`)**:
   - For GNOME Wayland sessions (GNOME 42+).
   - Resolves the active user session UID and session D-Bus socket from `/run/user/<UID>/bus`.
   - Executes via `runuser` under the target session identity to capture hardware-accelerated compositor buffers.
2. **Wayland Native Screencopy (`grim`)**:
   - For wlroots-compatible Wayland compositors (Sway, Wayfire, River).
   - Utilizes `XDG_RUNTIME_DIR` and `WAYLAND_DISPLAY` environment descriptors.
3. **Shared Memory Scanout (`mss` / X11 / Xwayland)**:
   - Connects to the primary X11 root window via MIT-SHM shared memory extensions (`/tmp/.X11-unix/X0`).
   - Analyzes frame brightness (`ImageStat.Stat`) to ensure Xwayland scanout is not emitting pure black frames.
4. **Linux Linear Kernel Framebuffer (`/dev/fb0`, `/dev/fb1`)**:
   - Direct memory-mapped linear framebuffer capture from `/dev/fb0`.
   - Automatically parses `/sys/class/graphics/fb0/virtual_size` to determine runtime display dimensions (e.g. 1920x1080).
5. **PyAutoGUI Fallback Engine**:
   - Platform-agnostic fallback for desktop environments with accessible display handles.

---

## 3. Real-Time WebRTC Streaming & Telemetry

### 3.1 Video Track Pipeline
The video stream is encapsulated in a custom `VideoStreamTrack` derived from `aiortc`:
- **Worker Thread**: A dedicated capture worker continuously pulls frames at 30 frames per second.
- **Cropping & Normalization**: Frame dimensions are automatically cropped to even integers (`w - (w % 2)`) to satisfy H.264 macroblock alignment rules.
- **Timestamp Synchronization**: Generates presentation timestamps (`pts`) and time bases for synchronized real-time RTP packetization.
- **WebSocket JPEG Stream Fallback**: In restricted networking environments where WebRTC UDP traffic is blocked, the daemon downscales frames to 720p at 65% quality JPEG and multiplexes base64-encoded frame packets over WebSocket.

### 3.2 Live Telemetry Metrics
Every second, the daemon broadcasts operational metrics over the `RTCDataChannel` and WebSocket bridge:
- `capture.state`: Operational state (`CAPTURING`, `CAPTURE_BLACK_FRAMES`, `ERROR`, `INITIALIZING`).
- `capture.engine`: Active grabber engine (e.g., `WAYLAND_GRIM_sarvdev`, `SAFE_SHM`, `FBDEV_fb0`).
- `capture.resolution`: Source resolution string (e.g., `1920x1080`).
- `capture.fps`: Measured capture frame rate.
- `capture.mean_brightness`: Average luminance per frame (0.0 to 255.0).
- `encoder.codec`: Active encoder codec (e.g., `H264`).
- `encoder.fps`: Actual encoded frame rate.
- `webrtc.peer_state` and `webrtc.ice_state`: Connection status of the WebRTC peer.

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
