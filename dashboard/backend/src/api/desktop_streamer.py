import sys
import os
import json
import asyncio
import threading
import time
import subprocess
import io
import base64
import shutil
import warnings

warnings.filterwarnings("ignore")

try:
    import websockets
except ImportError:
    websockets = None

from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, RTCConfiguration, RTCIceServer
from aiortc.codecs.h264 import H264Encoder
from av import VideoFrame
from PIL import Image, ImageDraw, ImageStat

# aiortc's H.264 encoder defaults to a bitrate ceiling tuned for webcam-style video,
# far too low for a full desktop capture: dense UI text and sharp gradients get
# crushed into blocky macroblocks at that rate. Raise the ceiling so quality can climb
# on networks that can sustain it. MIN_BITRATE must stay low, though: the encoder's
# target_bitrate is driven live by REMB feedback from the browser's own congestion
# control (see RTCRtpSender._handle_rtcp_packet), and every assignment gets clamped to
# max(MIN_BITRATE, min(bitrate, MAX_BITRATE)). A high floor here would override the
# browser telling the encoder to send less on a constrained link, forcing it to keep
# overshooting the network's real capacity -- the encoder can't back off, packets get
# lost, and the browser's decoder paints the undecodable macroblocks as a flat fill
# color instead of real pixels. Keeping MIN_BITRATE at aiortc's own conservative
# default preserves that adaptive behavior for exactly the restricted-network case the
# JPEG/WebSocket fallback below already exists to handle.
import aiortc.codecs.h264
aiortc.codecs.h264.DEFAULT_BITRATE = 2_000_000
aiortc.codecs.h264.MIN_BITRATE = 500_000
aiortc.codecs.h264.MAX_BITRATE = 20_000_000

try:
    from evdev import UInput, AbsInfo, ecodes as e
except ImportError:
    UInput = None
    AbsInfo = None
    e = None

try:
    import pyautogui
    pyautogui.FAILSAFE = False
    screen_width, screen_height = pyautogui.size()
except Exception:
    pyautogui = None
    screen_width, screen_height = 1920, 1080


class TelemetryCollector:
    def __init__(self):
        self.capture_state = "INITIALIZING"
        self.capture_engine = "ROOT_KERNEL_KMS"
        self.resolution = "0x0"
        self.capture_fps = 0.0
        self.mean_brightness = 0.0
        self.consecutive_black_frames = 0
        self.frames_captured = 0
        self.error_detail = ""

        self.encoder_codec = "H264"
        self.encoder_hardware = "PROBING"
        self.encoder_fps = 0.0
        self.frames_encoded = 0
        self.bytes_encoded = 0

        self.peer_state = "new"
        self.ice_state = "new"

        self.last_report_time = time.time()
        self.capture_count_window = 0
        self.encode_count_window = 0

    def tick_capture(self, width, height, brightness, is_black, error=None):
        self.frames_captured += 1
        self.capture_count_window += 1
        self.resolution = f"{width}x{height}"
        self.mean_brightness = round(brightness, 1)

        if error:
            self.capture_state = "CAPTURE_UNAVAILABLE"
            self.error_detail = str(error)
        elif is_black:
            self.consecutive_black_frames += 1
            if self.consecutive_black_frames >= 5:
                self.capture_state = "CAPTURE_BLACK_FRAMES"
                self.error_detail = "Direct GPU scanout returned black buffer"
            else:
                self.capture_state = "CAPTURE_OK"
                self.error_detail = ""
        else:
            self.consecutive_black_frames = 0
            self.capture_state = "CAPTURE_OK"
            self.error_detail = ""

    def tick_encode(self, byte_count):
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
                "engine": getattr(display_grabber, "active_engine", "SAFE_SHM") if 'display_grabber' in globals() else "SAFE_SHM",
                "resolution": self.resolution,
                "fps": self.capture_fps,
                "mean_brightness": self.mean_brightness,
                "consecutive_black_frames": self.consecutive_black_frames,
                "frames_captured": self.frames_captured,
                "error_detail": self.error_detail
            },
            "encoder": {
                "codec": self.encoder_codec,
                "hardware": self.encoder_hardware,
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


def get_ffmpeg_bin():
    for p in ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/bin/ffmpeg", "/snap/bin/ffmpeg"]:
        if os.path.exists(p) and os.access(p, os.X_OK):
            return p
    return shutil.which("ffmpeg") or "ffmpeg"


# ---------------------------------------------------------------------------
# Optional hardware-accelerated H.264 encoding (Intel/AMD VAAPI)
# ---------------------------------------------------------------------------
# aiortc's built-in encoder always runs software libx264, which is heavy on
# modest hosts: screen capture, the JPEG fallback, and real-time software H.264
# encoding running concurrently can pin a low-power CPU at sustained high
# usage. Where the host has a VAAPI-capable GPU (most Intel iGPUs, and AMD via
# Mesa radeonsi), this offloads the actual compression work onto that
# fixed-function hardware block instead.
#
# This is entirely opportunistic and additive: a real end-to-end hardware
# encode is probed once at startup, and the stock software path runs
# completely unchanged if that probe fails for ANY reason (no VAAPI device,
# driver lacks encode support, ffmpeg wasn't built with --enable-vaapi, etc).
# Hosts without this hardware -- AMD without Mesa, Nvidia, ARM, VMs, anything
# -- see zero behavior change; this project needs to run on all of them.
VAAPI_DEVICE_CANDIDATES = ["/dev/dri/renderD128", "/dev/dri/renderD129"]

_active_vaapi_processes = []


def _cleanup_vaapi_processes():
    while _active_vaapi_processes:
        proc = _active_vaapi_processes.pop()
        try:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=2)
        except Exception:
            pass


def _vaapi_ffmpeg_cmd(vaapi_device, width, height, bitrate):
    return [
        get_ffmpeg_bin(), "-hide_banner", "-loglevel", "error",
        "-vaapi_device", vaapi_device,
        # Captured frames are already PIL "RGB" -> av "rgb24" (every capture
        # tier in SafeDisplayGrabber produces Image.frombytes("RGB", ...) or
        # Image.new("RGB", ...)); matching that here instead of converting to
        # bgr24 skips a full-frame colorspace reshuffle on every single frame.
        "-f", "rawvideo", "-pixel_format", "rgb24",
        "-video_size", f"{width}x{height}", "-framerate", "30",
        "-i", "pipe:0",
        "-vf", "format=nv12,hwupload",
        "-c:v", "h264_vaapi",
        "-b:v", str(bitrate),
        "-bf", "0",
        # ffmpeg's output AVIOContext buffers writes (~32KB) before actually
        # flushing to the pipe by default -- fine for a file, but it queues
        # multiple frames of encoded data before our reader thread ever sees
        # them when piping in real time. -avioflags direct forces every
        # write straight through immediately.
        "-avioflags", "direct",
        # Closed, fixed-interval GOP: a keyframe every ~1s regardless of
        # requests. There is no live way to signal an immediate forced
        # keyframe into an already-running raw-pipe ffmpeg process, so this
        # is the recovery mechanism for loss/PLI instead of restarting the
        # process (see _encode_frame -- restarting on every keyframe request
        # would mean a real stall plus a fresh-IDR burst landing right when
        # the link may already be dropping packets, worsening loss-driven
        # corruption rather than fixing it).
        "-g", "30",
        "-f", "h264", "pipe:1"
    ]


def probe_vaapi_h264_encode():
    """Run a tiny real end-to-end hardware encode to confirm the whole chain
    (device node, kernel driver, ffmpeg's own VAAPI build) actually works,
    rather than just checking that files exist. Returns the working device
    path, or None if nothing usable was found."""
    for device in VAAPI_DEVICE_CANDIDATES:
        if not os.path.exists(device):
            continue
        try:
            width, height = 64, 64
            cmd = _vaapi_ffmpeg_cmd(device, width, height, 500_000)
            proc = subprocess.Popen(
                cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            blank_frame = b"\x00" * (width * height * 3)
            out, err = proc.communicate(input=blank_frame, timeout=5)
            if proc.returncode == 0 and len(out) > 0:
                sys.stderr.write(f"[VAAPI] Hardware H.264 encode confirmed on {device}.\n")
                sys.stderr.flush()
                return device
            sys.stderr.write(
                f"[VAAPI] Probe on {device} failed (rc={proc.returncode}): "
                f"{err.decode(errors='replace')[:200]}\n"
            )
            sys.stderr.flush()
        except Exception as err:
            sys.stderr.write(f"[VAAPI] Probe on {device} raised: {err}\n")
            sys.stderr.flush()
    return None


def _frame_to_packed_rgb24(rgb_frame):
    # planes[0].line_size can include row-alignment padding added by
    # swscale during reformat(); a naive bytes(plane) would hand ffmpeg's
    # rawvideo demuxer a stride it doesn't know about, producing exactly the
    # kind of sheared/torn image this hardware path exists to avoid.
    plane = rgb_frame.planes[0]
    width_bytes = rgb_frame.width * 3
    raw = bytes(plane)
    if plane.line_size == width_bytes:
        return raw
    return b"".join(
        raw[y * plane.line_size: y * plane.line_size + width_bytes]
        for y in range(rgb_frame.height)
    )


class VAAPIH264Encoder(H264Encoder):
    """
    Hardware-accelerated H264Encoder subclass. Overrides ONLY _encode_frame --
    the raw-bitstream production step -- and inherits H264Encoder's NAL
    splitting and RTP packetization (_split_bitstream, _packetize, encode)
    completely unchanged. That's deliberate: those are the parts that, if
    subtly wrong, produce a bitstream that LOOKS valid but decodes as
    corrupted macroblocks. Keeping them untouched means a hardware/driver
    hiccup can only ever fall back to the proven software path, never
    corrupt framing.
    """

    def __init__(self, vaapi_device):
        super().__init__()
        self.vaapi_device = vaapi_device
        self._proc = None
        self._proc_size = None
        self._proc_bitrate = None
        self._last_restart = 0.0
        self._pending = bytearray()
        self._stdout_buf = bytearray()
        self._stdout_lock = threading.Lock()
        self._hw_failed = False

    def _drain_stdout(self, proc):
        try:
            while True:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    return
                with self._stdout_lock:
                    self._stdout_buf.extend(chunk)
        except Exception:
            return

    def _start_proc(self, width, height):
        self._teardown_proc()
        cmd = _vaapi_ffmpeg_cmd(self.vaapi_device, width, height, self.target_bitrate)
        self._proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        _active_vaapi_processes.append(self._proc)
        self._proc_size = (width, height)
        self._proc_bitrate = self.target_bitrate
        self._pending = bytearray()
        with self._stdout_lock:
            self._stdout_buf.clear()
        threading.Thread(target=self._drain_stdout, args=(self._proc,), daemon=True).start()

    def _teardown_proc(self):
        if self._proc:
            try:
                _active_vaapi_processes.remove(self._proc)
            except ValueError:
                pass
            try:
                self._proc.kill()
                self._proc.wait(timeout=2)
            except Exception:
                pass
            self._proc = None

    def _extract_complete_nals(self):
        # Only release NAL units for which we've already seen the START of
        # the NEXT one. ffmpeg's stdout can be drained mid-NAL, and treating
        # a chunk's tail as complete would corrupt whichever NAL was still
        # in flight at that moment.
        with self._stdout_lock:
            if self._stdout_buf:
                self._pending.extend(self._stdout_buf)
                self._stdout_buf.clear()
        buf = bytes(self._pending)
        starts = []
        i = 0
        while True:
            i = buf.find(b"\x00\x00\x01", i)
            if i == -1:
                break
            starts.append(i)
            i += 3
        if len(starts) < 2:
            return b""
        complete_end = starts[-1]
        complete = buf[:complete_end]
        self._pending = bytearray(buf[complete_end:])
        return complete

    def _encode_frame(self, frame, force_keyframe):
        if self._hw_failed:
            yield from super()._encode_frame(frame, force_keyframe)
            return

        try:
            size = (frame.width, frame.height)
            now = time.time()
            # force_keyframe does NOT restart the process. A restart is a real
            # stall (ffmpeg re-initializing the VAAPI device) followed by a
            # full-size IDR burst sent all at once -- landing that right when
            # the link may already be dropping packets worsens loss-driven
            # corruption rather than fixing it, and the stall itself breaks
            # playback continuity. Recovery from loss/PLI comes from the
            # fixed 1s GOP in _vaapi_ffmpeg_cmd instead, which needs no live
            # signal into the running process.
            #
            # Only a genuine resolution change forces a restart here. A large,
            # SUSTAINED bitrate shift (REMB reporting real, lasting congestion
            # or headroom) still eventually gets one too, but on a long
            # cooldown -- frequent enough to honor real congestion signals
            # over time, far too infrequent to thrash the pipeline the way
            # force_keyframe was.
            bitrate_shifted = (
                self._proc_bitrate is not None
                and abs(self.target_bitrate - self._proc_bitrate) / self._proc_bitrate > 0.4
                and (now - self._last_restart) > 20.0
            )
            if self._proc is None or size != self._proc_size or bitrate_shifted:
                self._start_proc(*size)
                self._last_restart = now

            rgb = frame.reformat(width=frame.width, height=frame.height, format="rgb24")
            self._proc.stdin.write(_frame_to_packed_rgb24(rgb))
            self._proc.stdin.flush()

            complete = self._extract_complete_nals()
            if complete:
                yield from self._split_bitstream(complete)
        except Exception as err:
            sys.stderr.write(f"[VAAPI] Hardware encode failed, falling back to software: {err}\n")
            sys.stderr.flush()
            self._hw_failed = True
            telemetry.encoder_hardware = "SOFTWARE (hardware failed mid-stream)"
            self._teardown_proc()
            yield from super()._encode_frame(frame, force_keyframe)


def enable_vaapi_encoder_if_available():
    device = probe_vaapi_h264_encode()
    if not device:
        sys.stderr.write("[VAAPI] No working hardware H.264 encoder found; using software libx264.\n")
        sys.stderr.flush()
        telemetry.encoder_hardware = "SOFTWARE"
        return

    import aiortc.rtcrtpsender
    original_get_encoder = aiortc.rtcrtpsender.get_encoder

    def patched_get_encoder(codec):
        if codec.mimeType.lower() == "video/h264":
            return VAAPIH264Encoder(device)
        return original_get_encoder(codec)

    aiortc.rtcrtpsender.get_encoder = patched_get_encoder
    telemetry.encoder_hardware = f"VAAPI ({device})"
    sys.stderr.write(f"[VAAPI] Hardware H.264 encoding enabled via {device}.\n")
    sys.stderr.flush()


try:
    import mss
except ImportError:
    mss = None

import glob
import ctypes
import struct


def compute_image_brightness(img):
    if img is None:
        return 0.0
    try:
        # This runs on every single captured frame purely to decide "is this
        # black/unusable", so full-resolution accuracy is wasted work --
        # ImageStat.Stat's cost scales with pixel count, and a black frame
        # looks black at 160x90 too. Downsampling first cuts this from a
        # ~2M-pixel scan to a ~14K-pixel one.
        thumb = img.resize((160, 90), Image.Resampling.NEAREST) if img.size[0] > 160 else img
        stats = ImageStat.Stat(thumb)
        return sum(stats.mean) / max(len(stats.mean), 1)
    except Exception:
        return 0.0


def setup_display_env():
    # 1. Inspect live compositor / desktop process environment from /proc
    try:
        for proc_name in ["gnome-shell", "gdm-wayland-session", "gnome-session", "Xorg", "plasma-desktop", "sway", "wayfire"]:
            pids = subprocess.run(["pgrep", proc_name], capture_output=True, text=True)
            if pids.returncode == 0:
                for pid in pids.stdout.strip().split():
                    env_path = f"/proc/{pid}/environ"
                    if os.path.exists(env_path):
                        with open(env_path, "rb") as f:
                            for item in f.read().split(b"\x00"):
                                if item.startswith(b"XDG_RUNTIME_DIR="):
                                    os.environ["XDG_RUNTIME_DIR"] = item.split(b"=", 1)[1].decode("utf-8")
                                elif item.startswith(b"WAYLAND_DISPLAY="):
                                    os.environ["WAYLAND_DISPLAY"] = item.split(b"=", 1)[1].decode("utf-8")
                                elif item.startswith(b"DISPLAY="):
                                    os.environ["DISPLAY"] = item.split(b"=", 1)[1].decode("utf-8")
                                elif item.startswith(b"XAUTHORITY="):
                                    os.environ["XAUTHORITY"] = item.split(b"=", 1)[1].decode("utf-8")
                        if "WAYLAND_DISPLAY" in os.environ or "DISPLAY" in os.environ:
                            break
    except Exception:
        pass

    # 2. Fallback search /run/user/* and /tmp/.X11-unix
    if "XDG_RUNTIME_DIR" not in os.environ:
        for uid_dir in sorted(glob.glob("/run/user/*"), key=lambda p: 0 if p.endswith("1000") else 1):
            if os.path.isdir(uid_dir):
                for wl in ["wayland-0", "wayland-1"]:
                    if os.path.exists(os.path.join(uid_dir, wl)):
                        os.environ["XDG_RUNTIME_DIR"] = uid_dir
                        os.environ["WAYLAND_DISPLAY"] = wl
                        break
            if "XDG_RUNTIME_DIR" in os.environ:
                break

    if "DISPLAY" not in os.environ:
        for sock in ["/tmp/.X11-unix/X0", "/tmp/.X11-unix/X1"]:
            if os.path.exists(sock):
                os.environ["DISPLAY"] = ":0" if sock.endswith("X0") else ":1"
                break
        if "DISPLAY" not in os.environ:
            os.environ["DISPLAY"] = ":0"

    # 3. If XAUTHORITY is still missing, search standard auth directories
    if "XAUTHORITY" not in os.environ:
        for auth_pattern in [
            "/home/*/.Xauthority",
            "/run/user/*/gdm/Xauthority",
            "/run/user/*/xauth_*",
            "/var/run/gdm3/auth-for-gdm-*/database"
        ]:
            matches = glob.glob(auth_pattern)
            if matches:
                os.environ["XAUTHORITY"] = matches[0]
                break


try:
    import pwd
except ImportError:
    pwd = None


def get_session_user(uid):
    if pwd:
        try:
            return pwd.getpwuid(int(uid)).pw_name
        except Exception:
            pass
    return None


class SafeDisplayGrabber:
    def __init__(self):
        self.sct = None
        self.error_detail = ""
        self.active_engine = "NONE"
        self._drmtap_lib = None
        self._init_drmtap()
        setup_display_env()
        self._init_mss()

class DrmtapFrameInfo(ctypes.Structure):
    _fields_ = [
        ("data", ctypes.c_void_p),
        ("dma_buf_fd", ctypes.c_int),
        ("width", ctypes.c_uint32),
        ("height", ctypes.c_uint32),
        ("stride", ctypes.c_uint32),
        ("format", ctypes.c_uint32),
        ("modifier", ctypes.c_uint64),
        ("fb_id", ctypes.c_uint32),
        ("_priv", ctypes.c_void_p),
    ]


class SafeDisplayGrabber:
    def __init__(self):
        self.sct = None
        self._drmtap_lib = None
        self._drmtap_ctx = None
        self.active_engine = "NONE"
        self.error_detail = ""
        self._init_drmtap()

    def _init_mss(self):
        setup_display_env()
        if mss:
            try:
                self.sct = mss.mss()
            except Exception:
                self.sct = None

    def _init_drmtap(self):
        for lib_path in [
            "/opt/homelab/libdrmtap.so",
            "/usr/local/lib/libdrmtap.so",
            "/usr/lib/libdrmtap.so",
            "/usr/lib/x86_64-linux-gnu/libdrmtap.so",
            "/usr/lib64/libdrmtap.so"
        ]:
            if os.path.exists(lib_path):
                try:
                    self._drmtap_lib = ctypes.CDLL(lib_path)
                    self._drmtap_lib.drmtap_open.restype = ctypes.c_void_p
                    self._drmtap_lib.drmtap_open.argtypes = [ctypes.c_void_p]
                    self._drmtap_lib.drmtap_grab_mapped.restype = ctypes.c_int
                    self._drmtap_lib.drmtap_grab_mapped.argtypes = [ctypes.c_void_p, ctypes.POINTER(DrmtapFrameInfo)]
                    if hasattr(self._drmtap_lib, "drmtap_grab_mapped_fast"):
                        self._drmtap_lib.drmtap_grab_mapped_fast.restype = ctypes.c_int
                        self._drmtap_lib.drmtap_grab_mapped_fast.argtypes = [ctypes.c_void_p, ctypes.POINTER(DrmtapFrameInfo)]
                    self._drmtap_lib.drmtap_frame_release.restype = None
                    self._drmtap_lib.drmtap_frame_release.argtypes = [ctypes.c_void_p, ctypes.POINTER(DrmtapFrameInfo)]
                    self._drmtap_lib.drmtap_close.restype = None
                    self._drmtap_lib.drmtap_close.argtypes = [ctypes.c_void_p]

                    self._drmtap_ctx = self._drmtap_lib.drmtap_open(None)
                    sys.stderr.write(f"[SafeDisplayGrabber] libdrmtap native context initialized from {lib_path}\n")
                    sys.stderr.flush()
                    break
                except Exception as err:
                    sys.stderr.write(f"[SafeDisplayGrabber] libdrmtap load error: {err}\n")
                    sys.stderr.flush()

    def _try_drm_scanout(self):
        # 1. Native libdrmtap hardware capture
        if self._drmtap_lib and self._drmtap_ctx:
            try:
                frame = DrmtapFrameInfo()
                ret = self._drmtap_lib.drmtap_grab_mapped(self._drmtap_ctx, ctypes.byref(frame))
                if ret == 0 and frame.data and frame.width > 0 and frame.height > 0 and frame.stride >= frame.width * 4:
                    byte_len = int(frame.height * frame.stride)
                    if 0 < byte_len < 64 * 1024 * 1024:
                        raw_bytes = ctypes.string_at(frame.data, byte_len)
                        # XRGB8888/ARGB8888 ('XR24'/'AR24') store bytes as B,G,R,X in little-endian
                        # memory order, so they decode as PIL's "BGRX". ABGR8888 ('AB24') is NOT the
                        # same layout despite the similar name -- its component order is A,B,G,R
                        # (MSB to LSB), which is R,G,B,A in memory, i.e. "RGBX". libdrmtap's own
                        # drmtap_convert_format() draws this same distinction (see
                        # convert_abgr_to_argb in pixel_convert.c); grouping AB24 with XR24/AR24
                        # here swapped the red and blue channels on any GPU/compositor whose primary
                        # plane scans out in ABGR8888.
                        if frame.format in (0x34325258, 0x34325241, 0):
                            img = Image.frombytes("RGB", (frame.width, frame.height), raw_bytes, "raw", "BGRX", frame.stride)
                        else:
                            img = Image.frombytes("RGB", (frame.width, frame.height), raw_bytes, "raw", "RGBX", frame.stride)
                        self._drmtap_lib.drmtap_frame_release(self._drmtap_ctx, ctypes.byref(frame))
                        return img, "LIBDRMTAP"
                if frame.data:
                    self._drmtap_lib.drmtap_frame_release(self._drmtap_ctx, ctypes.byref(frame))
            except Exception as e:
                self.error_detail = f"libdrmtap: {e}"

        return None, None

    def read_frame(self):
        setup_display_env()

        fallback_black_frame = None
        fallback_black_engine = "NONE"

        # 1. Priority 1: Direct Hardware DRM/KMS scanout via libdrmtap (Zero user-space flashing)
        drm_img, drm_engine = self._try_drm_scanout()
        if drm_img is not None:
            self.active_engine = drm_engine
            self.error_detail = ""
            return drm_img, None

        # 2. Priority 2: Wayland User Session capture (grim - silent CLI)
        for uid_dir in sorted(glob.glob("/run/user/*"), key=lambda p: 0 if p.endswith("1000") else 1):
            if os.path.isdir(uid_dir):
                uid_str = os.path.basename(uid_dir)
                if uid_str.isdigit():
                    uid_int = int(uid_str)
                    uname = get_session_user(uid_int)
                    if uname:
                        target_file = f"/dev/shm/homelab_frame_{uid_int}.png"
                        wl_sock = os.path.join(uid_dir, "wayland-0")
                        if os.path.exists(wl_sock):
                            try:
                                if os.path.exists(target_file):
                                    os.remove(target_file)
                            except Exception:
                                pass
                            cmd = [
                                "runuser", "-u", uname, "--",
                                "env", f"XDG_RUNTIME_DIR={uid_dir}", "WAYLAND_DISPLAY=wayland-0",
                                "grim", target_file
                            ]
                            try:
                                proc = subprocess.run(cmd, capture_output=True, timeout=0.3)
                                if os.path.exists(target_file) and os.path.getsize(target_file) > 500:
                                    with open(target_file, "rb") as rf:
                                        raw_bytes = rf.read()
                                    try:
                                        os.remove(target_file)
                                    except Exception:
                                        pass
                                    img = Image.open(io.BytesIO(raw_bytes))
                                    img.load()
                                    b = compute_image_brightness(img)
                                    if b >= 1.0:
                                        self.active_engine = f"WAYLAND_GRIM_{uname}"
                                        self.error_detail = ""
                                        return img, None
                                    elif fallback_black_frame is None:
                                        fallback_black_frame = img
                                        fallback_black_engine = f"WAYLAND_GRIM_{uname}"
                            except Exception as e:
                                self.error_detail = str(e)

        # 3. Priority 3: Shared Memory MSS for active X11 / Xwayland desktop
        if not self.sct and mss:
            self._init_mss()

        if self.sct:
            try:
                mon = self.sct.monitors[1] if len(self.sct.monitors) > 1 else self.sct.monitors[0]
                sct_img = self.sct.grab(mon)
                img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
                b = compute_image_brightness(img)
                if b >= 1.0:
                    self.active_engine = "SAFE_SHM"
                    self.error_detail = ""
                    return img, None
                elif fallback_black_frame is None:
                    fallback_black_frame = img
                    fallback_black_engine = "SAFE_SHM"
            except Exception as e:
                self.error_detail = str(e)
                self.sct = None

        # 4. Priority 4: Linux kernel linear framebuffer (/dev/fb0, /dev/fb1)
        for fb in ["/dev/fb0", "/dev/fb1"]:
            if os.path.exists(fb):
                try:
                    w, h = 1920, 1080
                    res_path = f"/sys/class/graphics/{os.path.basename(fb)}/virtual_size"
                    if os.path.exists(res_path):
                        with open(res_path, "r") as rf:
                            parts = rf.read().strip().split(",")
                            if len(parts) == 2:
                                w, h = int(parts[0]), int(parts[1])

                    with open(fb, "rb") as f:
                        raw = f.read(w * h * 4)
                        if len(raw) >= w * h * 4:
                            img = Image.frombytes("RGB", (w, h), raw, "raw", "BGRX")
                            if img:
                                b = compute_image_brightness(img)
                                if b >= 1.0:
                                    self.active_engine = f"FBDEV_{os.path.basename(fb)}"
                                    self.error_detail = ""
                                    return img, None
                                elif fallback_black_frame is None:
                                    fallback_black_frame = img
                                    fallback_black_engine = f"FBDEV_{os.path.basename(fb)}"
                except Exception as e:
                    self.error_detail = str(e)

        # 5. Priority 5: Local libdrmtap & direct DRM KMS scanout
        drm_img, drm_engine = self._try_drm_scanout()
        if drm_img:
            b = compute_image_brightness(drm_img)
            if b >= 1.0:
                self.active_engine = drm_engine or "LIBDRMTAP"
                self.error_detail = ""
                return drm_img, None
            elif fallback_black_frame is None:
                fallback_black_frame = drm_img
                fallback_black_engine = drm_engine or "LIBDRMTAP"

        # 6. Priority 6: PyAutoGUI / PIL Grab fallback
        if pyautogui:
            try:
                img = pyautogui.screenshot()
                if img:
                    b = compute_image_brightness(img)
                    if b >= 1.0:
                        self.active_engine = "PYAUTOGUI"
                        self.error_detail = ""
                        return img, None
                    elif fallback_black_frame is None:
                        fallback_black_frame = img
                        fallback_black_engine = "PYAUTOGUI"
            except Exception as e:
                self.error_detail = str(e)

        # If any candidate frame was found (even if black), gracefully return it with telemetry status
        if fallback_black_frame is not None:
            self.active_engine = fallback_black_engine
            self.error_detail = "Direct GPU scanout returned black buffer"
            return fallback_black_frame, None

        return None, Exception(self.error_detail or "Display buffer currently unavailable")


display_grabber = SafeDisplayGrabber()

# Matches the encoder's own output rate (aiortc's H264Encoder targets 30fps,
# and _vaapi_ffmpeg_cmd is configured for 30fps too) -- capturing faster than
# either consumer can use is pure wasted CPU.
CAPTURE_TARGET_FPS = 30


class ScreenCaptureTrack(VideoStreamTrack):
    def __init__(self):
        super().__init__()
        self.latest_frame = None
        self.running = True
        self.captured_count = 0

        self.capture_thread = threading.Thread(target=self._capture_worker, daemon=True)
        self.capture_thread.start()

    def _capture_worker(self):
        target_interval = 1.0 / CAPTURE_TARGET_FPS
        while self.running:
            loop_start = time.time()
            self.captured_count += 1
            raw_img, capture_err = display_grabber.read_frame()

            mean_val = 0.0
            if raw_img is not None:
                mean_val = compute_image_brightness(raw_img)
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
                d.text((80, 80), f"Safe Remote Display Streamer Active ({telemetry.capture_state})", fill=(239, 68, 68))
                d.text((80, 140), f"Status: {telemetry.error_detail}", fill=(156, 163, 175))
                self.latest_frame = diag_img

            webrtc_confirmed_playing = (
                client_confirmed_playing
                and (time.time() - client_confirmed_playing_at) < PLAYBACK_CONFIRMATION_TIMEOUT
            )
            if not webrtc_confirmed_playing and self.latest_frame is not None and active_ws and main_loop:
                try:
                    buf = io.BytesIO()
                    thumb = self.latest_frame
                    if thumb.size[0] > 1280 or thumb.size[1] > 720:
                        thumb = thumb.resize((1280, 720), Image.Resampling.BILINEAR)
                    thumb.save(buf, format="JPEG", quality=60)
                    b64_frame = base64.b64encode(buf.getvalue()).decode("utf-8")

                    frame_pkt = json.dumps({
                        "type": "frame",
                        "data": b64_frame,
                        "w": thumb.size[0],
                        "h": thumb.size[1],
                        "seq": self.captured_count
                    })
                    asyncio.run_coroutine_threadsafe(active_ws.send(frame_pkt), main_loop)
                except Exception:
                    pass

            elapsed = time.time() - loop_start
            time.sleep(max(0.001, target_interval - elapsed))

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
        abs_x = AbsInfo(value=0, min=0, max=65535, fuzz=0, flat=0, resolution=0) if AbsInfo else (0, 65535, 0, 0)
        abs_y = AbsInfo(value=0, min=0, max=65535, fuzz=0, flat=0, resolution=0) if AbsInfo else (0, 65535, 0, 0)
        cap_mouse = {
            e.EV_KEY: [
                e.BTN_LEFT, e.BTN_RIGHT, e.BTN_MIDDLE,
                e.BTN_SIDE, e.BTN_EXTRA, e.BTN_FORWARD, e.BTN_BACK, e.BTN_TASK,
                e.BTN_TOUCH
            ],
            e.EV_ABS: [
                (e.ABS_X, abs_x),
                (e.ABS_Y, abs_y)
            ],
            e.EV_REL: [
                e.REL_WHEEL,
                e.REL_HWHEEL,
                e.REL_X,
                e.REL_Y
            ]
        }
        cap_keyboard = {
            e.EV_KEY: list(range(1, 512))
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
    # Letters
    "KeyA": 30, "KeyB": 48, "KeyC": 46, "KeyD": 32, "KeyE": 18, "KeyF": 33, "KeyG": 34, "KeyH": 35,
    "KeyI": 23, "KeyJ": 36, "KeyK": 37, "KeyL": 38, "KeyM": 50, "KeyN": 49, "KeyO": 24, "KeyP": 25,
    "KeyQ": 16, "KeyR": 19, "KeyS": 31, "KeyT": 20, "KeyU": 22, "KeyV": 47, "KeyW": 17, "KeyX": 45,
    "KeyY": 21, "KeyZ": 44,
    "a": 30, "b": 48, "c": 46, "d": 32, "e": 18, "f": 33, "g": 34, "h": 35, "i": 23, "j": 36,
    "k": 37, "l": 38, "m": 50, "n": 49, "o": 24, "p": 25, "q": 16, "r": 19, "s": 31, "t": 20,
    "u": 22, "v": 47, "w": 17, "x": 45, "y": 21, "z": 44,
    "A": 30, "B": 48, "C": 46, "D": 32, "E": 18, "F": 33, "G": 34, "H": 35, "I": 23, "J": 36,
    "K": 37, "L": 38, "M": 50, "N": 49, "O": 24, "P": 25, "Q": 16, "R": 19, "S": 31, "T": 20,
    "U": 22, "V": 47, "W": 17, "X": 45, "Y": 21, "Z": 44,
    # Digits (Top row)
    "Digit1": 2, "Digit2": 3, "Digit3": 4, "Digit4": 5, "Digit5": 6, "Digit6": 7, "Digit7": 8, "Digit8": 9, "Digit9": 10, "Digit0": 11,
    "1": 2, "2": 3, "3": 4, "4": 5, "5": 6, "6": 7, "7": 8, "8": 9, "9": 10, "0": 11,
    # Numpad
    "Numpad0": 82, "Numpad1": 79, "Numpad2": 80, "Numpad3": 81, "Numpad4": 75,
    "Numpad5": 76, "Numpad6": 77, "Numpad7": 71, "Numpad8": 72, "Numpad9": 73,
    "NumpadEnter": 96, "NumpadAdd": 78, "NumpadSubtract": 74, "NumpadMultiply": 55, "NumpadDivide": 98, "NumpadDecimal": 83,
    "NumLock": 69, "ScrollLock": 70,
    # Controls & Navigation
    "Enter": 28, "enter": 28, "Return": 28, "Escape": 1, "escape": 1, "esc": 1, "Backspace": 14, "backspace": 14,
    "Tab": 15, "tab": 15, "Space": 57, "space": 57, " ": 57,
    "CapsLock": 58, "capslock": 58,
    "ShiftLeft": 42, "ShiftRight": 54, "shift": 42,
    "ControlLeft": 29, "ControlRight": 97, "control": 29, "ctrl": 29,
    "AltLeft": 56, "AltRight": 100, "alt": 56, "AltGraph": 100,
    "MetaLeft": 125, "MetaRight": 126, "meta": 125, "super": 125, "OSLeft": 125, "OSRight": 126,
    "ContextMenu": 127,
    "ArrowRight": 106, "ArrowLeft": 105, "ArrowDown": 108, "ArrowUp": 103,
    "right": 106, "left": 105, "down": 108, "up": 103,
    "Insert": 110, "insert": 110, "Home": 102, "home": 102, "PageUp": 104, "pageup": 104,
    "Delete": 111, "delete": 111, "End": 107, "end": 107, "PageDown": 109, "pagedown": 109,
    "PrintScreen": 99, "Pause": 119,
    # Symbols & Punctuation
    "Minus": 12, "minus": 12, "-": 12, "_": 12,
    "Equal": 13, "equal": 13, "=": 13, "+": 13,
    "BracketLeft": 26, "[": 26, "{": 26,
    "BracketRight": 27, "]": 27, "}": 27,
    "Backslash": 43, "\\": 43, "|": 43,
    "Semicolon": 39, ";": 39, ":": 39,
    "Quote": 40, "'": 40, '"': 40,
    "Backquote": 41, "`": 41, "~": 41,
    "Comma": 51, ",": 51, "<": 51,
    "Period": 52, ".": 52, ">": 52,
    "Slash": 53, "/": 53, "?": 53,
    "!": 2, "@": 3, "#": 4, "$": 5, "%": 6, "^": 7, "&": 8, "*": 9, "(": 10, ")": 11,
    # Function Keys
    "F1": 59, "F2": 60, "F3": 61, "F4": 62, "F5": 63, "F6": 64, "F7": 65, "F8": 66, "F9": 67, "F10": 68, "F11": 87, "F12": 88,
    "F13": 183, "F14": 184, "F15": 185, "F16": 186, "F17": 187, "F18": 188, "F19": 189, "F20": 190, "F21": 191, "F22": 192, "F23": 193, "F24": 194,
    # Media & Audio Keys
    "AudioVolumeMute": 113, "AudioVolumeDown": 114, "AudioVolumeUp": 115
}


def reset_all_inputs():
    global ui_mouse, ui_keyboard
    if ui_mouse:
        try:
            for btn in [e.BTN_LEFT, e.BTN_RIGHT, e.BTN_MIDDLE, e.BTN_SIDE, e.BTN_EXTRA, e.BTN_TOUCH]:
                ui_mouse.write(e.EV_KEY, btn, 0)
            ui_mouse.syn()
        except Exception:
            pass
    if ui_keyboard:
        try:
            for k in [29, 97, 56, 100, 42, 54, 125, 126, 58, 1, 15, 28, 57]:
                ui_keyboard.write(e.EV_KEY, k, 0)
            ui_keyboard.syn()
        except Exception:
            pass


def handle_input_message(msg_str):
    global ui_mouse, ui_keyboard
    try:
        data = json.loads(msg_str)
        action = data.get("type")

        if action == "reset_inputs":
            reset_all_inputs()
            return

        if not ui_mouse or not ui_keyboard:
            if pyautogui:
                if action == "mousemove":
                    pyautogui.moveTo(int(float(data.get("x", 0)) * screen_width), int(float(data.get("y", 0)) * screen_height))
                elif action in ["mousedown", "mouseup", "click"]:
                    btn_name = str(data.get("button", "left")).lower()
                    btn = "left"
                    if btn_name in ["right", "2"]:
                        btn = "right"
                    elif btn_name in ["middle", "1"]:
                        btn = "middle"
                    if action == "mousedown":
                        pyautogui.mouseDown(button=btn)
                    elif action == "mouseup":
                        pyautogui.mouseUp(button=btn)
                    elif action == "click":
                        pyautogui.click(button=btn)
                elif action == "wheel":
                    dy = int(float(data.get("dy", 0)))
                    if dy != 0:
                        pyautogui.scroll(-1 if dy > 0 else 1)
                elif action == "keydown" and data.get("key"):
                    pyautogui.keyDown(data.get("key"))
                elif action == "keyup" and data.get("key"):
                    pyautogui.keyUp(data.get("key"))
            return

        if action == "mousemove":
            abs_x = int(max(0.0, min(1.0, float(data.get("x", 0)))) * 65535)
            abs_y = int(max(0.0, min(1.0, float(data.get("y", 0)))) * 65535)
            ui_mouse.write(e.EV_ABS, e.ABS_X, abs_x)
            ui_mouse.write(e.EV_ABS, e.ABS_Y, abs_y)
            ui_mouse.syn()
        elif action in ["mousedown", "mouseup", "click"]:
            btn_name = str(data.get("button", "left")).lower()
            btn_code = e.BTN_LEFT
            if btn_name in ["right", "2"]:
                btn_code = e.BTN_RIGHT
            elif btn_name in ["middle", "1"]:
                btn_code = e.BTN_MIDDLE
            elif btn_name in ["back", "side", "3"]:
                btn_code = e.BTN_SIDE
            elif btn_name in ["forward", "extra", "4"]:
                btn_code = e.BTN_EXTRA

            if action == "mousedown":
                ui_mouse.write(e.EV_KEY, btn_code, 1)
                ui_mouse.syn()
            elif action == "mouseup":
                ui_mouse.write(e.EV_KEY, btn_code, 0)
                ui_mouse.syn()
            elif action == "click":
                ui_mouse.write(e.EV_KEY, btn_code, 1)
                ui_mouse.syn()
                time.sleep(0.01)
                ui_mouse.write(e.EV_KEY, btn_code, 0)
                ui_mouse.syn()
        elif action == "wheel":
            dx = float(data.get("dx", 0))
            dy = float(data.get("dy", 0))
            if dy != 0:
                steps = -1 if dy > 0 else 1
                ui_mouse.write(e.EV_REL, e.REL_WHEEL, steps)
            if dx != 0:
                steps = -1 if dx > 0 else 1
                ui_mouse.write(e.EV_REL, e.REL_HWHEEL, steps)
            ui_mouse.syn()
        elif action in ["keydown", "keyup"]:
            raw_code = data.get("code") or data.get("key")
            code = KEY_MAP.get(raw_code)
            if not code and isinstance(raw_code, str):
                if len(raw_code) == 1:
                    code = KEY_MAP.get(f"Key{raw_code.upper()}") or KEY_MAP.get(f"Digit{raw_code}") or KEY_MAP.get(raw_code.lower()) or KEY_MAP.get(raw_code)
            if not code and isinstance(data.get("key"), str):
                code = KEY_MAP.get(data.get("key"))
            if code:
                val = 1 if action == "keydown" else 0
                ui_keyboard.write(e.EV_KEY, code, val)
                ui_keyboard.syn()
    except Exception as err:
        sys.stderr.write(f"[Input] Error: {str(err)}\n")
        sys.stderr.flush()


pc = None
video_track = None
data_channel_holder = {"channel": None}
active_ws = None
main_loop = None

# Client-reported confirmation that it is actually decoding and rendering
# WebRTC video frames (as opposed to merely having negotiated an ICE
# connection, which says nothing about whether media is flowing). The
# JPEG-over-WebSocket fallback stays live until this is confirmed, and
# resumes automatically if the confirmation goes stale, so a client that
# never receives real frames is never left staring at a frozen frame.
client_confirmed_playing = False
client_confirmed_playing_at = 0.0
PLAYBACK_CONFIRMATION_TIMEOUT = 2.0


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


def handle_playback_status(payload):
    global client_confirmed_playing, client_confirmed_playing_at
    client_confirmed_playing = bool(payload.get("playing"))
    client_confirmed_playing_at = time.time()


def recreate_peer_connection():
    global pc, video_track, client_confirmed_playing, client_confirmed_playing_at
    client_confirmed_playing = False
    client_confirmed_playing_at = 0.0
    # aiortc gives encoders no close()/teardown hook -- the previous
    # connection's RTCRtpSender and its encoder are simply dropped and left
    # for GC. That's harmless for the stock software encoder, but a
    # VAAPIH264Encoder's ffmpeg subprocess would otherwise leak across
    # repeated reconnects, which this daemon sees a lot of.
    _cleanup_vaapi_processes()
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
                        elif payload.get("type") == "playback_status":
                            handle_playback_status(payload)
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

    enable_vaapi_encoder_if_available()

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
                elif payload.get("type") == "playback_status":
                    handle_playback_status(payload)
                else:
                    handle_input_message(line)
            except Exception as e:
                sys.stderr.write(f"[DesktopStreamer] Error: {str(e)}\n")
                sys.stderr.flush()


if __name__ == "__main__":
    init_uinput()
    asyncio.run(main())