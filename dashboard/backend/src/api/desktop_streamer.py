import sys
import os
import json
import asyncio
import threading
import time
import fractions
import subprocess
import warnings

warnings.filterwarnings("ignore")
 
try:
    import websockets
except ImportError:
    websockets = None

from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, RTCConfiguration, RTCIceServer
from av import VideoFrame
from PIL import Image, ImageDraw, ImageFont, ImageGrab, ImageStat

try:
    from evdev import UInput, ecodes as e
except ImportError:
    UInput = None
    e = None

try:
    import pyautogui
    pyautogui.FAILSAFE = False
    screen_width, screen_height = pyautogui.size()
except Exception:
    pyautogui = None
    screen_width, screen_height = 1920, 1080

try:
    import mss
    has_mss = True
except Exception:
    has_mss = False

def find_xauthority():
    import glob
    candidates = [
        "/run/user/*/gdm/Xauthority",
        "/run/user/*/.mutter-Xwaylandauth*",
        "/run/user/*/xauth_*",
        "/run/user/*/.Xauthority",
        "/home/*/.Xauthority",
        "/root/.Xauthority"
    ]
    for pattern in candidates:
        try:
            matches = glob.glob(pattern)
            if matches:
                matches.sort(key=lambda x: os.path.getmtime(x), reverse=True)
                return matches[0]
        except Exception:
            pass
    return None

def wake_display_dpms():
    if sys.platform.startswith("linux"):
        try:
            subprocess.run(["xset", "dpms", "force", "on"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=0.2)
        except Exception:
            pass

def discover_host_display():
    if not sys.platform.startswith("linux"):
        return ":0", None, None, None, None
    proc_dir = "/proc" if os.path.exists("/proc") else "/host/proc"
    
    display = None
    xauth = None
    wayland_display = None
    xdg_runtime_dir = None
    user_name = None

    if os.path.exists(proc_dir):
        for name in sorted(os.listdir(proc_dir)):
            if not name.isdigit():
                continue
            try:
                cmd_path = f"{proc_dir}/{name}/cmdline"
                if not os.path.exists(cmd_path):
                    continue
                with open(cmd_path, "r", errors="ignore") as f:
                    cmd = f.read().lower()
                
                if any(k in cmd for k in ["gnome-shell", "xorg", "xwayland", "kwin", "gnome-session", "lightdm", "plasma", "wayland", "gdm", "gdm3", "gdm-x-session", "gdm-wayland-session", "sddm"]):
                    env_path = f"{proc_dir}/{name}/environ"
                    if not os.path.exists(env_path):
                        continue
                    with open(env_path, "rb") as env_f:
                        data = env_f.read().split(b"\x00")
                    
                    for item in data:
                        if item.startswith(b"DISPLAY="):
                            display = item.split(b"=", 1)[1].decode("utf-8", errors="ignore")
                        elif item.startswith(b"XAUTHORITY="):
                            xauth = item.split(b"=", 1)[1].decode("utf-8", errors="ignore")
                        elif item.startswith(b"WAYLAND_DISPLAY="):
                            wayland_display = item.split(b"=", 1)[1].decode("utf-8", errors="ignore")
                        elif item.startswith(b"XDG_RUNTIME_DIR="):
                            xdg_runtime_dir = item.split(b"=", 1)[1].decode("utf-8", errors="ignore")
                        elif item.startswith(b"USER="):
                            user_name = item.split(b"=", 1)[1].decode("utf-8", errors="ignore")
                    
                    if display or wayland_display:
                        break
            except Exception:
                continue
    if not display:
        display = ":0"
    if not xauth or not os.path.exists(xauth):
        xauth = find_xauthority()
    return display, xauth, wayland_display, xdg_runtime_dir, user_name

def get_host_ip():
    try:
        res = subprocess.check_output(
            ["nsenter", "-t", "1", "-m", "-u", "-i", "-n", "--", "hostname", "-I"],
            stderr=subprocess.DEVNULL
        )
        ips = res.decode("utf-8").strip().split()
        for ip in ips:
            if not ip.startswith("127.") and not ip.startswith("172.17.") and not ip.startswith("172.18."):
                return ip
        if ips:
            return ips[0]
    except Exception:
        pass

    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        parts = ip.split(".")
        parts[3] = "1"
        return ".".join(parts)
    except Exception:
        return "172.17.0.1"

def initialize_linux_display():
    if sys.platform.startswith("linux"):
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--rdp-user", default=None)
        parser.add_argument("--rdp-pass", default=None)
        args, _ = parser.parse_known_args()

        is_working = False

        if args.rdp_user and args.rdp_pass:
            sys.stderr.write("[DisplayInit] RDP credentials provided. Initializing FreeRDP bridge...\n")
            sys.stderr.flush()
            try:
                subprocess.Popen(
                    ["Xvfb", ":99", "-screen", "0", "1280x720x24", "-ac", "-nolisten", "tcp", "+extension", "GLX", "+render", "-noreset"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                time.sleep(1.0)
                os.environ["DISPLAY"] = ":99"

                host_ip = get_host_ip()
                rdp_cmd = [
                    "xfreerdp",
                    f"/v:{host_ip}",
                    f"/u:{args.rdp_user}",
                    f"/p:{args.rdp_pass}",
                    "/size:1280x720",
                    "+fonts",
                    "+dynamic-resolution",
                    "/cert:ignore",
                    "/audio-mode:2",
                    "/network:lan",
                    "+glyph-cache",
                    "+bitmap-cache"
                ]
                proc = subprocess.Popen(rdp_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                time.sleep(2.5)

                if proc.poll() is None:
                    is_working = True
                    sys.stderr.write(f"[DisplayInit] Successfully bridged RDP session to {host_ip}:3389 on display :99\n")
                    sys.stderr.flush()
                else:
                    stdout_data = proc.stdout.read().decode("utf-8", errors="ignore").strip()
                    stderr_data = proc.stderr.read().decode("utf-8", errors="ignore").strip()
                    sys.stderr.write(f"[DisplayInit] FreeRDP terminated. stdout: {stdout_data} | stderr: {stderr_data}\n")
                    sys.stderr.flush()
            except Exception as e:
                sys.stderr.write(f"[DisplayInit] RDP bridge launch failed: {str(e)}\n")
                sys.stderr.flush()

        if not is_working:
            disp, auth, w_disp, xdg_dir, u_name = discover_host_display()
            if disp:
                os.environ["DISPLAY"] = disp
                if auth:
                    os.environ["XAUTHORITY"] = auth
                if w_disp:
                    os.environ["WAYLAND_DISPLAY"] = w_disp
                if xdg_dir:
                    os.environ["XDG_RUNTIME_DIR"] = xdg_dir
                sys.stderr.write(f"[DisplayInit] Auto-discovered host display config: DISPLAY={disp}, XAUTHORITY={auth}, WAYLAND={w_disp}\n")
                sys.stderr.flush()
                
            display = os.environ.get("DISPLAY")
            has_existing = False
            
            if display and display != ":99":
                try:
                    from PIL import ImageGrab
                    test_img = ImageGrab.grab()
                    if test_img:
                        stats = ImageStat.Stat(test_img)
                        mean_val = sum(stats.mean) / max(len(stats.mean), 1)
                        if mean_val >= 1.0:
                            has_existing = True
                            is_working = True
                            sys.stderr.write(f"[DisplayInit] Successfully connected to host display: {display} (Mean Brightness: {mean_val:.1f})\n")
                            sys.stderr.flush()
                        else:
                            sys.stderr.write(f"[DisplayInit] Host display {display} returned black frame (Wayland isolated). Initializing virtual desktop session on :99...\n")
                            sys.stderr.flush()
                except Exception as e:
                    sys.stderr.write(f"[DisplayInit] Host display probe failed: {str(e)}. Initializing virtual desktop session on :99...\n")
                    sys.stderr.flush()
                    
            if not is_working:
                sys.stderr.write("[DisplayInit] Starting container-local virtual display session on :99\n")
                sys.stderr.flush()
                try:
                    if not os.path.exists("/tmp/.X11-unix/X99"):
                        subprocess.Popen(
                            ["Xvfb", ":99", "-screen", "0", "1920x1080x24", "-ac", "-nolisten", "tcp", "+extension", "GLX", "+render", "-noreset"],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL
                        )
                        time.sleep(1.0)
                    os.environ["DISPLAY"] = ":99"
                    
                    subprocess.Popen(["openbox"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    time.sleep(0.5)
                    subprocess.Popen(["xterm", "-geometry", "140x45+80+80", "-fa", "Monospace", "-fs", "12", "-bg", "black", "-fg", "white"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception as e:
                    sys.stderr.write(f"[DisplayInit] Fallback virtual display startup notice: {str(e)}\n")
                    sys.stderr.flush()

initialize_linux_display()

class TelemetryCollector:
    def __init__(self):
        self.capture_state = "INITIALIZING"
        self.capture_engine = "NONE"
        self.resolution = "0x0"
        self.capture_fps = 0.0
        self.mean_brightness = 0.0
        self.consecutive_black_frames = 0
        self.error_detail = ""
        self.frames_captured = 0
        
        self.encoder_codec = "H264"
        self.encoder_fps = 0.0
        self.frames_encoded = 0
        self.bytes_encoded = 0
        
        self.peer_state = "new"
        self.ice_state = "new"
        self.frames_sent = 0
        self.last_report_time = time.time()
        self.capture_count_window = 0
        self.encode_count_window = 0

    def tick_capture(self, width, height, brightness, engine, is_black, error=None):
        self.frames_captured += 1
        self.capture_count_window += 1
        self.resolution = f"{width}x{height}"
        self.capture_engine = engine
        self.mean_brightness = round(brightness, 2)
        
        if error:
            self.error_detail = str(error)
            self.capture_state = "CAPTURE_UNAVAILABLE"
        elif is_black:
            self.consecutive_black_frames += 1
            if self.consecutive_black_frames > 25:
                self.capture_state = "CAPTURE_BLACK_FRAMES"
                self.error_detail = "Display buffer has zero brightness. Display may be unrendered or empty."
            else:
                self.capture_state = "CAPTURE_OK"
                self.error_detail = ""
        else:
            self.consecutive_black_frames = 0
            self.capture_state = "CAPTURE_OK"
            self.error_detail = ""

    def tick_encode(self, byte_count=0):
        self.frames_encoded += 1
        self.encode_count_window += 1
        self.bytes_encoded += byte_count

    def compute_rates(self):
        now = time.time()
        dt = now - self.last_report_time
        if dt >= 1.0:
            self.capture_fps = round(self.capture_count_window / dt, 1)
            self.encoder_fps = round(self.encode_count_window / dt, 1)
            self.capture_count_window = 0
            self.encode_count_window = 0
            self.last_report_time = now

    def to_dict(self):
        self.compute_rates()
        return {
            "type": "telemetry",
            "capture": {
                "state": self.capture_state,
                "engine": self.capture_engine,
                "resolution": self.resolution,
                "fps": self.capture_fps,
                "mean_brightness": self.mean_brightness,
                "consecutive_black_frames": self.consecutive_black_frames,
                "frames_captured": self.frames_captured,
                "error_detail": self.error_detail
            },
            "encoder": {
                "codec": self.encoder_codec,
                "fps": self.encoder_fps,
                "frames_encoded": self.frames_encoded,
                "bytes_encoded": self.bytes_encoded
            },
            "webrtc": {
                "peer_state": self.peer_state,
                "ice_state": self.ice_state,
                "frames_sent": self.frames_encoded
            }
        }

telemetry = TelemetryCollector()

def run_user_session_capture_process(pipe_conn, target_uid, target_user, disp, xauth, w_disp, xdg_dir):
    try:
        import pwd
        pw = pwd.getpwuid(target_uid) if target_uid else (pwd.getpwnam(target_user) if target_user else None)
        if pw:
            uid = pw.pw_uid
            gid = pw.pw_gid
            os.environ["HOME"] = pw.pw_dir
            os.environ["USER"] = pw.pw_name
            os.environ["LOGNAME"] = pw.pw_name
            if disp: os.environ["DISPLAY"] = disp
            if xauth: os.environ["XAUTHORITY"] = xauth
            if w_disp: os.environ["WAYLAND_DISPLAY"] = w_disp
            if xdg_dir: os.environ["XDG_RUNTIME_DIR"] = xdg_dir
            else: os.environ["XDG_RUNTIME_DIR"] = f"/run/user/{uid}"
            os.environ["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path=/run/user/{uid}/bus"
            
            # Drop root privileges cleanly to the logged-in desktop user
            try:
                os.initgroups(pw.pw_name, gid)
                os.setgid(gid)
                os.setuid(uid)
            except Exception:
                pass

        # Authorize X11 locally
        try:
            subprocess.run(["xhost", "+local:"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=0.5)
        except Exception:
            pass

        import mss, io
        sct = None
        try:
            sct = mss.mss()
        except Exception:
            pass

        while True:
            frame_bytes = None
            if sct:
                try:
                    mon = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
                    shot = sct.grab(mon)
                    img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
                    buf = io.BytesIO()
                    if img.size[0] > 1280 or img.size[1] > 720:
                        img = img.resize((1280, 720), Image.Resampling.BILINEAR)
                    img.save(buf, format="JPEG", quality=65)
                    frame_bytes = buf.getvalue()
                except Exception:
                    sct = None
            if not frame_bytes:
                try:
                    img = ImageGrab.grab()
                    buf = io.BytesIO()
                    if img.size[0] > 1280 or img.size[1] > 720:
                        img = img.resize((1280, 720), Image.Resampling.BILINEAR)
                    img.save(buf, format="JPEG", quality=65)
                    frame_bytes = buf.getvalue()
                except Exception:
                    pass
            
            if frame_bytes:
                pipe_conn.send_bytes(frame_bytes)
            time.sleep(0.033)
    except Exception:
        sys.exit(1)

class ScreenCaptureTrack(VideoStreamTrack):
    def __init__(self):
        super().__init__()
        self.latest_frame = None
        self.running = True
        self.mss_instance = None
        self.captured_count = 0
        self.worker_pid = None
        self.parent_pipe = None
        
        self.capture_thread = threading.Thread(target=self._capture_worker, daemon=True)
        self.capture_thread.start()

    def _capture_worker(self):
        import multiprocessing, io
        use_mss = False
        reconnect_timer = 0

        while self.running:
            self.captured_count += 1
            raw_img = None
            capture_err = None
            
            disp, auth, w_disp, xdg_dir, u_name = discover_host_display()
            if disp: os.environ["DISPLAY"] = disp
            if auth: os.environ["XAUTHORITY"] = auth
            if w_disp: os.environ["WAYLAND_DISPLAY"] = w_disp
            if xdg_dir: os.environ["XDG_RUNTIME_DIR"] = xdg_dir

            # Launch RustDesk-style user-session capture worker process if on Linux as root
            if sys.platform.startswith("linux") and os.getuid() == 0 and self.worker_pid is None:
                try:
                    import pwd
                    pw = pwd.getpwnam(u_name) if u_name else (pwd.getpwuid(1000) if os.path.exists("/run/user/1000") else None)
                    if pw:
                        p_pipe, c_pipe = multiprocessing.Pipe()
                        pid = os.fork()
                        if pid == 0:
                            p_pipe.close()
                            run_user_session_capture_process(c_pipe, pw.pw_uid, pw.pw_name, disp, auth, w_disp, xdg_dir)
                            sys.exit(0)
                        else:
                            c_pipe.close()
                            self.parent_pipe = p_pipe
                            self.worker_pid = pid
                except Exception as ex:
                    sys.stderr.write(f"[DesktopStreamer] User worker fork notice: {str(ex)}\n")

            # Receive frame from RustDesk user-session worker pipe
            if self.parent_pipe and self.parent_pipe.poll(0.05):
                try:
                    data = self.parent_pipe.recv_bytes()
                    if data:
                        raw_img = Image.open(io.BytesIO(data))
                        engine_name = "USER_SESSION_WORKER"
                except Exception as e:
                    capture_err = e
                    self.parent_pipe = None
                    self.worker_pid = None

            # Fallback to local root capture or virtual display
            if not raw_img:
                if has_mss and self.mss_instance is None and telemetry.consecutive_black_frames < 3:
                    try:
                        self.mss_instance = mss.mss()
                        use_mss = True
                    except Exception as e:
                        capture_err = e
                        use_mss = False
                
                engine_name = "MSS" if use_mss else "PIL"
                if use_mss and self.mss_instance and telemetry.consecutive_black_frames < 3:
                    try:
                        monitors = self.mss_instance.monitors
                        target_mon = monitors[1] if len(monitors) > 1 else monitors[0]
                        shot = self.mss_instance.grab(target_mon)
                        raw_img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
                    except Exception as e:
                        capture_err = e
                        self.mss_instance = None
                        try:
                            raw_img = ImageGrab.grab()
                            engine_name = "PIL"
                            capture_err = None
                        except Exception as pe:
                            capture_err = pe
                elif not raw_img:
                    try:
                        raw_img = ImageGrab.grab()
                        engine_name = "PIL"
                    except Exception as e:
                        capture_err = e

            # Calculate image statistics
            mean_val = 0.0
            if raw_img is not None:
                try:
                    stats = ImageStat.Stat(raw_img)
                    mean_val = sum(stats.mean) / max(len(stats.mean), 1)
                except Exception:
                    mean_val = 0.0

            # If black frames detected or capture failed on physical display, fallback to virtual display :99
            if raw_img is None or mean_val < 1.0:
                if os.environ.get("DISPLAY") != ":99" and os.path.exists("/tmp/.X11-unix/X99"):
                    os.environ["DISPLAY"] = ":99"
                    self.mss_instance = None
                    use_mss = False
                    try:
                        raw_img = ImageGrab.grab()
                        engine_name = "VIRTUAL_DISPLAY"
                        stats = ImageStat.Stat(raw_img)
                        mean_val = sum(stats.mean) / max(len(stats.mean), 1)
                    except Exception:
                        pass

            if raw_img is not None:
                w, h = raw_img.size
                is_black = (mean_val < 1.0)
                telemetry.tick_capture(w, h, mean_val, engine_name, is_black)

                crop_w = w - (w % 2)
                crop_h = h - (h % 2)
                if crop_w != w or crop_h != h:
                    raw_img = raw_img.crop((0, 0, crop_w, crop_h))

                self.latest_frame = raw_img
            else:
                telemetry.tick_capture(0, 0, 0.0, engine_name, True, error=capture_err)
                
                # Generic non-mock error display card
                diag_img = Image.new("RGB", (1280, 720), color=(15, 17, 26))
                d = ImageDraw.Draw(diag_img)
                d.rectangle([(40, 40), (1240, 680)], outline=(220, 38, 38), width=2)
                d.text((80, 80), f"Display Stream Unavailable ({telemetry.capture_state})", fill=(239, 68, 68))
                d.text((80, 140), f"Error: {telemetry.error_detail}", fill=(156, 163, 175))
                self.latest_frame = diag_img

            if self.latest_frame is not None:
                try:
                    import io, base64
                    buf = io.BytesIO()
                    thumb = self.latest_frame
                    if thumb.size[0] > 1280 or thumb.size[1] > 720:
                        thumb = thumb.resize((1280, 720), Image.Resampling.BILINEAR)
                    thumb.save(buf, format="JPEG", quality=65)
                    b64_frame = base64.b64encode(buf.getvalue()).decode("utf-8")
                    
                    frame_pkt = json.dumps({
                        "type": "frame",
                        "data": b64_frame,
                        "w": thumb.size[0],
                        "h": thumb.size[1],
                        "seq": self.captured_count
                    })
                    if active_ws and main_loop:
                        asyncio.run_coroutine_threadsafe(active_ws.send(frame_pkt), main_loop)
                except Exception:
                    pass

            time.sleep(0.033)

    async def recv(self):
        pts, time_base = await self.next_timestamp()
        img = self.latest_frame
        if img is None:
            img = Image.new("RGB", (1280, 720), (0, 0, 0))
            
        frame = VideoFrame.from_image(img)
        frame.pts = pts
        frame.time_base = time_base
        telemetry.tick_encode(byte_count=img.size[0] * img.size[1] * 3)
        return frame

ui_mouse = None
ui_keyboard = None

def init_uinput():
   global ui_mouse, ui_keyboard
   if not UInput or not e:
       sys.stderr.write("[UInput] evdev library not available. Using pyautogui fallback.\n")
       sys.stderr.flush()
       return
   try:
       # Create virtual tablet absolute pointer device
       cap_mouse = {
           e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT, e.BTN_MIDDLE, e.BTN_TOUCH],
           e.EV_ABS: [
               (e.ABS_X, (0, 1920, 0, 0)),
               (e.ABS_Y, (0, 1080, 0, 0))
           ]
       }
       # Create virtual keyboard
       cap_keyboard = {
           e.EV_KEY: list(range(1, 255))
       }
       ui_mouse = UInput(cap_mouse, name="HomeLab-Virtual-Tablet")
       ui_keyboard = UInput(cap_keyboard, name="HomeLab-Virtual-Keyboard")
       sys.stderr.write("[UInput] Kernel virtual input devices registered successfully.\n")
       sys.stderr.flush()
   except Exception as err:
       sys.stderr.write(f"[UInput] Failed to register devices: {str(err)}. Using pyautogui fallback.\n")
       sys.stderr.flush()
       ui_mouse = None
       ui_keyboard = None

# Browser key code mapping to Linux input event key codes
KEY_MAP = {
   "KeyA": 30, "KeyB": 48, "KeyC": 46, "KeyD": 32, "KeyE": 18, "KeyF": 33, "KeyG": 34, "KeyH": 35,
   "KeyI": 23, "KeyJ": 36, "KeyK": 37, "KeyL": 38, "KeyM": 50, "KeyN": 49, "KeyO": 24, "KeyP": 25,
   "KeyQ": 16, "KeyR": 19, "KeyS": 31, "KeyT": 20, "KeyU": 22, "KeyV": 47, "KeyW": 17, "KeyX": 45,
   "KeyY": 21, "KeyZ": 44,
   "Digit1": 2, "Digit2": 3, "Digit3": 4, "Digit4": 5, "Digit5": 6, "Digit6": 7, "Digit7": 8, "Digit9": 10, "Digit0": 11,
   "Enter": 28, "Escape": 1, "Backspace": 14, "Tab": 15, "Space": 57,
   "Minus": 12, "Equal": 13, "BracketLeft": 26, "BracketRight": 27, "Backslash": 43,
   "Semicolon": 39, "Quote": 40, "Backquote": 41, "Comma": 51, "Period": 52, "Slash": 53,
   "CapsLock": 58,
   "F1": 59, "F2": 60, "F3": 61, "F4": 62, "F5": 63, "F6": 64, "F7": 65, "F8": 66, "F9": 67, "F10": 68,
   "F11": 87, "F12": 88,
   "ArrowRight": 106, "ArrowLeft": 105, "ArrowDown": 108, "ArrowUp": 103,
   "Insert": 110, "Home": 102, "PageUp": 104, "Delete": 111, "End": 107, "PageDown": 109,
   "ControlLeft": 29, "ShiftLeft": 42, "AltLeft": 56, "MetaLeft": 125,
   "ControlRight": 97, "ShiftRight": 54, "AltRight": 100, "MetaRight": 126
}

def handle_input_pyautogui(action, data):
   if not pyautogui:
       return
   try:
       if action == "mousemove":
           x = data.get("x", 0)
           y = data.get("y", 0)
           pyautogui.moveTo(int(x * screen_width), int(y * screen_height))
       elif action == "mousedown":
           btn = data.get("button", "left")
           pyautogui.mouseDown(button=btn)
       elif action == "mouseup":
           btn = data.get("button", "left")
           pyautogui.mouseUp(button=btn)
       elif action == "click":
           btn = data.get("button", "left")
           pyautogui.click(button=btn)
       elif action == "keydown":
           key = data.get("key")
           if key: pyautogui.keyDown(key)
       elif action == "keyup":
           key = data.get("key")
           if key: pyautogui.keyUp(key)
   except Exception as e:
       sys.stderr.write(f"PyAutoGUI Input Error: {str(e)}\n")
       sys.stderr.flush()

def handle_input_message(msg_str):
   global ui_mouse, ui_keyboard
   try:
       data = json.loads(msg_str)
       action = data.get("type")
       
       if not ui_mouse or not ui_keyboard:
           handle_input_pyautogui(action, data)
           return
           
       if action == "mousemove":
           x = data.get("x", 0)
           y = data.get("y", 0)
           abs_x = int(x * 1920)
           abs_y = int(y * 1080)
           ui_mouse.write(e.EV_ABS, e.ABS_X, abs_x)
           ui_mouse.write(e.EV_ABS, e.ABS_Y, abs_y)
           ui_mouse.write(e.EV_SYN, e.SYN_REPORT, 0)
           ui_mouse.flush()
       elif action == "mousedown":
           btn_name = data.get("button", "left")
           btn_code = e.BTN_LEFT if btn_name == "left" else (e.BTN_RIGHT if btn_name == "right" else e.BTN_MIDDLE)
           ui_mouse.write(e.EV_KEY, btn_code, 1)
           ui_mouse.write(e.EV_SYN, e.SYN_REPORT, 0)
           ui_mouse.flush()
       elif action == "mouseup":
           btn_name = data.get("button", "left")
           btn_code = e.BTN_LEFT if btn_name == "left" else (e.BTN_RIGHT if btn_name == "right" else e.BTN_MIDDLE)
           ui_mouse.write(e.EV_KEY, btn_code, 0)
           ui_mouse.write(e.EV_SYN, e.SYN_REPORT, 0)
           ui_mouse.flush()
       elif action == "click":
           btn_name = data.get("button", "left")
           btn_code = e.BTN_LEFT if btn_name == "left" else (e.BTN_RIGHT if btn_name == "right" else e.BTN_MIDDLE)
           ui_mouse.write(e.EV_KEY, btn_code, 1)
           ui_mouse.write(e.EV_SYN, e.SYN_REPORT, 0)
           ui_mouse.write(e.EV_KEY, btn_code, 0)
           ui_mouse.write(e.EV_SYN, e.SYN_REPORT, 0)
           ui_mouse.flush()
       elif action == "keydown":
           key = data.get("key")
           code = KEY_MAP.get(key)
           if code:
               ui_keyboard.write(e.EV_KEY, code, 1)
               ui_keyboard.write(e.EV_SYN, e.SYN_REPORT, 0)
               ui_keyboard.flush()
       elif action == "keyup":
           key = data.get("key")
           code = KEY_MAP.get(key)
           if code:
               ui_keyboard.write(e.EV_KEY, code, 0)
               ui_keyboard.write(e.EV_SYN, e.SYN_REPORT, 0)
               ui_keyboard.flush()
   except Exception as err:
       sys.stderr.write(f"UInput Input Error: {str(err)}\n")
       sys.stderr.flush()

# Global variables for WebRTC peer connections and active WS tunnel
pc = None
video_track = None
data_channel_holder = {"channel": None}
active_ws = None
main_loop = None

async def telemetry_broadcaster(data_channel_holder):
    while True:
        await asyncio.sleep(1.0)
        report = telemetry.to_dict()
        msg_str = json.dumps(report)
        
        if active_ws:
            try:
                await active_ws.send(msg_str)
            except Exception:
                pass

        channel = data_channel_holder.get("channel")
        if channel and channel.readyState == "open":
            try:
                channel.send(msg_str)
            except Exception:
                pass

def recreate_peer_connection():
    global pc, video_track
    if pc:
        try:
            asyncio.get_event_loop().create_task(pc.close())
        except Exception:
            pass
            
    rtc_config = RTCConfiguration(iceServers=[
        RTCIceServer(urls="stun:stun.l.google.com:19302"),
        RTCIceServer(urls="stun:stun1.l.google.com:19302"),
        RTCIceServer(urls="stun:stun2.l.google.com:19302")
    ])
    pc = RTCPeerConnection(configuration=rtc_config)
    
    video_track = ScreenCaptureTrack()
    pc.addTrack(video_track)
    
    @pc.on("connectionstatechange")
    def on_connectionstatechange():
        telemetry.peer_state = pc.connectionState
        sys.stderr.write(f"[DesktopStreamer] Peer Connection State: {pc.connectionState}\n")
        sys.stderr.flush()
        
    @pc.on("iceconnectionstatechange")
    def on_iceconnectionstatechange():
        telemetry.ice_state = pc.iceConnectionState
        sys.stderr.write(f"[DesktopStreamer] ICE Connection State: {pc.iceConnectionState}\n")
        sys.stderr.flush()
        
    @pc.on("datachannel")
    def on_datachannel(channel):
        if channel.label == "input":
            data_channel_holder["channel"] = channel
            sys.stderr.write("[DesktopStreamer] RTCDataChannel connected.\n")
            sys.stderr.flush()
            
            @channel.on("message")
            def on_message(message):
                handle_input_message(message)

async def daemon_signaling_loop(daemon_token):
    global pc, active_ws, main_loop, video_track
    main_loop = asyncio.get_running_loop()
    if not websockets:
        sys.stderr.write("[DesktopStreamer] Error: websockets library not available. Cannot run in daemon-mode.\n")
        sys.stderr.flush()
        return
        
    uri = f"ws://127.0.0.1:8081/ws/desktop/daemon?token={daemon_token}"
    sys.stderr.write(f"[DesktopStreamer] Daemon mode active. Connecting to dashboard: {uri}\n")
    sys.stderr.flush()
    
    # Ensure capture track is running
    if not video_track:
        recreate_peer_connection()
    
    while True:
        try:
            async with websockets.connect(uri, ping_interval=10, ping_timeout=10) as ws:
                active_ws = ws
                wake_display_dpms()
                sys.stderr.write("[DesktopStreamer] Connected to signaling bridge WebSocket!\n")
                sys.stderr.flush()
                
                async for message in ws:
                    try:
                        payload = json.loads(message)
                        if payload.get("type") == "offer":
                            sys.stderr.write("[DesktopStreamer] Received WebRTC offer from bridge. Initializing connection...\n")
                            sys.stderr.flush()
                            
                            recreate_peer_connection()
                            
                            offer = RTCSessionDescription(sdp=payload["sdp"], type=payload["type"])
                            await pc.setRemoteDescription(offer)
                            
                            answer = await pc.createAnswer()
                            await pc.setLocalDescription(answer)
                            
                            if pc.iceGatheringState != "complete":
                                for _ in range(30):
                                    if pc.iceGatheringState == "complete":
                                        break
                                    await asyncio.sleep(0.05)
                                    
                            sys.stderr.write(f"[DesktopStreamer] Sending SDP answer to bridge...\n")
                            sys.stderr.flush()
                            await ws.send(json.dumps({
                                "type": pc.localDescription.type,
                                "sdp": pc.localDescription.sdp
                            }))
                        elif payload.get("type") == "close":
                            sys.stderr.write("[DesktopStreamer] Received close signaling from bridge.\n")
                            sys.stderr.flush()
                            if pc:
                                await pc.close()
                        else:
                            # Forward WebSocket-based mouse/keyboard events directly to uinput
                            handle_input_message(message)
                    except Exception as e:
                        sys.stderr.write(f"[DesktopStreamer] Error parsing WS payload: {str(e)}\n")
                        sys.stderr.flush()
        except Exception as err:
            active_ws = None
            sys.stderr.write(f"[DesktopStreamer] Connection lost or failed: {str(err)}. Reconnecting in 5 seconds...\n")
            sys.stderr.flush()
            await asyncio.sleep(5)

async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--daemon-mode", action="store_true")
    parser.add_argument("--daemon-token", type=str, default="daemon_default_secret")
    parser.add_argument("--rdp-user", type=str, default="")
    parser.add_argument("--rdp-pass", type=str, default="")
    parser.add_argument("--host-user", type=str, default="")
    args = parser.parse_args()
    
    sys.stderr.write("[DesktopStreamer] Daemon initialized with diagnostics collector active.\n")
    sys.stderr.flush()
    
    asyncio.create_task(telemetry_broadcaster(data_channel_holder))
    
    if args.daemon_mode:
        await daemon_signaling_loop(args.daemon_token)
    else:
        # Standard fallback interactive loop (stdin/stdout)
        recreate_peer_connection()
        loop = asyncio.get_event_loop()
        stdin_queue = asyncio.Queue()
        
        def stdin_thread():
            while True:
                line = sys.stdin.readline()
                if not line:
                    break
                loop.call_soon_threadsafe(stdin_queue.put_nowait, line)
                
        threading.Thread(target=stdin_thread, daemon=True).start()
        
        while True:
            line = await stdin_queue.get()
            try:
                payload = json.loads(line)
                if payload.get("type") == "offer":
                    sys.stderr.write("[DesktopStreamer] Received SDP offer. Setting remote description...\n")
                    sys.stderr.flush()
                    offer = RTCSessionDescription(sdp=payload["sdp"], type=payload["type"])
                    await pc.setRemoteDescription(offer)
                    
                    answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)
                    
                    # Await complete ICE candidate gathering for STUN discovery
                    if pc.iceGatheringState != "complete":
                        for _ in range(30):
                            if pc.iceGatheringState == "complete":
                                break
                            await asyncio.sleep(0.05)
                            
                    sys.stderr.write(f"[DesktopStreamer] Created SDP answer ({len(pc.localDescription.sdp)} bytes). Transmitting to client.\n")
                    sys.stderr.flush()
                    
                    sys.stdout.write(json.dumps({
                        "type": pc.localDescription.type,
                        "sdp": pc.localDescription.sdp
                    }) + "\n")
                    sys.stdout.flush()
                    
                elif payload.get("type") == "close":
                    break
                else:
                    handle_input_message(line)
            except Exception as e:
                sys.stderr.write(f"[DesktopStreamer] Signaling error: {str(e)}\n")
                sys.stderr.flush()

if __name__ == "__main__":
    init_uinput()
    asyncio.run(main())
 