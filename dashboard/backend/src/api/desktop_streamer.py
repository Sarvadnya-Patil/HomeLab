import sys
import os
import json
import asyncio
import threading
import time
import subprocess
import io
import base64
import warnings

warnings.filterwarnings("ignore")

try:
    import websockets
except ImportError:
    websockets = None

from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, RTCConfiguration, RTCIceServer
from av import VideoFrame
from PIL import Image, ImageDraw, ImageStat

try:
    from evdev import UInput, AbsInfo, ecodes as e
except ImportError:
    UInput = None
    AbsInfo = None
    e = None

import shutil

def get_ffmpeg_bin():
    for p in ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/bin/ffmpeg", "/snap/bin/ffmpeg"]:
        if os.path.exists(p) and os.access(p, os.X_OK):
            return p
    return shutil.which("ffmpeg") or "ffmpeg"

def grab_kernel_drm_frame():
    """Reads raw physical GPU display output directly from Linux Kernel DRM/KMS scanout."""
    ffmpeg_bin = get_ffmpeg_bin()
    candidates = ["/dev/dri/card0", "/dev/dri/card1", "/dev/dri/card2"]
    for card in candidates:
        if os.path.exists(card):
            try:
                proc = subprocess.run([
                    ffmpeg_bin, "-nostdin", "-loglevel", "quiet", "-device", card,
                    "-f", "kmsgrab", "-i", "-",
                    "-vf", "hwdownload,format=bgr0,scale=1280:720",
                    "-vframes", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"
                ], capture_output=True, timeout=0.2)
                if proc.returncode == 0 and len(proc.stdout) > 500:
                    return Image.open(io.BytesIO(proc.stdout)), None
            except Exception as e:
                return None, e
    return None, Exception("No active /dev/dri/card* found")


class ScreenCaptureTrack(VideoStreamTrack):
    def __init__(self):
        super().__init__()
        self.latest_frame = None
        self.running = True
        self.captured_count = 0

        self.capture_thread = threading.Thread(target=self._capture_worker, daemon=True)
        self.capture_thread.start()

    def _capture_worker(self):
        while self.running:
            self.captured_count += 1
            raw_img, capture_err = grab_kernel_drm_frame()

            mean_val = 0.0
            if raw_img is not None:
                try:
                    stats = ImageStat.Stat(raw_img)
                    mean_val = sum(stats.mean) / max(len(stats.mean), 1)
                except Exception:
                    mean_val = 0.0

                w, h = raw_img.size
                is_black = (mean_val < 1.0)
                telemetry.tick_capture(w, h, mean_val, is_black)

                crop_w = w - (w % 2)
                crop_h = h - (h % 2)
                if crop_w != w or crop_h != h:
                    raw_img = raw_img.crop((0, 0, crop_w, crop_h))

                self.latest_frame = raw_img
            else:
                telemetry.tick_capture(0, 0, 0.0, True, error=capture_err)
                diag_img = Image.new("RGB", (1280, 720), color=(15, 17, 26))
                d = ImageDraw.Draw(diag_img)
                d.rectangle([(40, 40), (1240, 680)], outline=(220, 38, 38), width=2)
                d.text((80, 80), f"Root Kernel GPU Grabber Active ({telemetry.capture_state})", fill=(239, 68, 68))
                d.text((80, 140), f"Status: {telemetry.error_detail}", fill=(156, 163, 175))
                self.latest_frame = diag_img

            if self.latest_frame is not None:
                try:
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
        sys.stderr.write("[UInput] evdev not available. Falling back to pyautogui.\n")
        sys.stderr.flush()
        return
    try:
        abs_x = AbsInfo(value=0, min=0, max=1920, fuzz=0, flat=0, resolution=0) if AbsInfo else (0, 1920, 0, 0)
        abs_y = AbsInfo(value=0, min=0, max=1080, fuzz=0, flat=0, resolution=0) if AbsInfo else (0, 1080, 0, 0)
        cap_mouse = {
            e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT, e.BTN_MIDDLE, e.BTN_TOUCH],
            e.EV_ABS: [
                (e.ABS_X, abs_x),
                (e.ABS_Y, abs_y)
            ]
        }
        cap_keyboard = {
            e.EV_KEY: list(range(1, 255))
        }
        ui_mouse = UInput(cap_mouse, name="HomeLab-Virtual-Tablet")
        ui_keyboard = UInput(cap_keyboard, name="HomeLab-Virtual-Keyboard")
        sys.stderr.write("[UInput] Kernel /dev/uinput devices initialized.\n")
        sys.stderr.flush()
    except Exception as err:
        sys.stderr.write(f"[UInput] Init error: {str(err)}\n")
        sys.stderr.flush()
        ui_mouse = None
        ui_keyboard = None


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


def handle_input_message(msg_str):
    global ui_mouse, ui_keyboard
    try:
        data = json.loads(msg_str)
        action = data.get("type")

        if not ui_mouse or not ui_keyboard:
            if pyautogui:
                if action == "mousemove":
                    pyautogui.moveTo(int(data.get("x", 0) * screen_width), int(data.get("y", 0) * screen_height))
                elif action == "mousedown":
                    pyautogui.mouseDown(button=data.get("button", "left"))
                elif action == "mouseup":
                    pyautogui.mouseUp(button=data.get("button", "left"))
                elif action == "click":
                    pyautogui.click(button=data.get("button", "left"))
                elif action == "keydown" and data.get("key"):
                    pyautogui.keyDown(data.get("key"))
                elif action == "keyup" and data.get("key"):
                    pyautogui.keyUp(data.get("key"))
            return

        if action == "mousemove":
            abs_x = int(data.get("x", 0) * 1920)
            abs_y = int(data.get("y", 0) * 1080)
            ui_mouse.write(e.EV_ABS, e.ABS_X, abs_x)
            ui_mouse.write(e.EV_ABS, e.ABS_Y, abs_y)
            ui_mouse.write(e.EV_SYN, e.SYN_REPORT, 0)
            ui_mouse.flush()
        elif action in ["mousedown", "mouseup", "click"]:
            btn_name = data.get("button", "left")
            btn_code = e.BTN_LEFT if btn_name == "left" else (e.BTN_RIGHT if btn_name == "right" else e.BTN_MIDDLE)
            val = 1 if action in ["mousedown", "click"] else 0
            ui_mouse.write(e.EV_KEY, btn_code, val)
            ui_mouse.write(e.EV_SYN, e.SYN_REPORT, 0)
            if action == "click":
                ui_mouse.write(e.EV_KEY, btn_code, 0)
                ui_mouse.write(e.EV_SYN, e.SYN_REPORT, 0)
            ui_mouse.flush()
        elif action in ["keydown", "keyup"]:
            code = KEY_MAP.get(data.get("key"))
            if code:
                val = 1 if action == "keydown" else 0
                ui_keyboard.write(e.EV_KEY, code, val)
                ui_keyboard.write(e.EV_SYN, e.SYN_REPORT, 0)
                ui_keyboard.flush()
    except Exception as err:
        sys.stderr.write(f"[Input] Error: {str(err)}\n")
        sys.stderr.flush()


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
        sys.stderr.write("[DesktopStreamer] Error: websockets library not installed.\n")
        sys.stderr.flush()
        return

    uri = f"ws://127.0.0.1:8081/ws/desktop/daemon?token={daemon_token}"
    sys.stderr.write(f"[DesktopStreamer] Daemon active. Connecting: {uri}\n")
    sys.stderr.flush()

    if not video_track:
        recreate_peer_connection()

    while True:
        try:
            async with websockets.connect(uri, ping_interval=10, ping_timeout=10) as ws:
                active_ws = ws
                sys.stderr.write("[DesktopStreamer] Connected to signaling bridge WebSocket!\n")
                sys.stderr.flush()

                async for message in ws:
                    try:
                        payload = json.loads(message)
                        if payload.get("type") == "offer":
                            sys.stderr.write("[DesktopStreamer] Received WebRTC offer. Re-initializing connection...\n")
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

                            sys.stderr.write("[DesktopStreamer] Sending SDP answer to bridge...\n")
                            sys.stderr.flush()
                            await ws.send(json.dumps({
                                "type": pc.localDescription.type,
                                "sdp": pc.localDescription.sdp
                            }))
                        elif payload.get("type") == "close":
                            if pc:
                                await pc.close()
                        else:
                            handle_input_message(message)
                    except Exception as e:
                        sys.stderr.write(f"[DesktopStreamer] WS payload error: {str(e)}\n")
                        sys.stderr.flush()
        except Exception as err:
            active_ws = None
            sys.stderr.write(f"[DesktopStreamer] Connection error: {str(err)}. Retrying in 5s...\n")
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

    sys.stderr.write("[DesktopStreamer] Root GPU Direct KMS Daemon Initialized.\n")
    sys.stderr.flush()

    asyncio.create_task(telemetry_broadcaster(data_channel_holder))

    if args.daemon_mode:
        await daemon_signaling_loop(args.daemon_token)
    else:
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
                    offer = RTCSessionDescription(sdp=payload["sdp"], type=payload["type"])
                    await pc.setRemoteDescription(offer)
                    answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)

                    if pc.iceGatheringState != "complete":
                        for _ in range(30):
                            if pc.iceGatheringState == "complete":
                                break
                            await asyncio.sleep(0.05)

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
                sys.stderr.write(f"[DesktopStreamer] Error: {str(e)}\n")
                sys.stderr.flush()


if __name__ == "__main__":
    init_uinput()
    asyncio.run(main())