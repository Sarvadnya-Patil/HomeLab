 // Remote Desktop Application Component with WebRTC & WebSocket Dual-Mode Transport
 import { api } from '../core/api.js';
 
 export const AppDesktop = {
   container: null,
   ws: null,
   pc: null,
   inputChannel: null,
   cleanupInputListeners: null,
   statsInterval: null,
   telemetry: {
     capture: { state: 'UNKNOWN', engine: 'NONE', resolution: '0x0', fps: 0, mean_brightness: 0, consecutive_black_frames: 0, error_detail: '' },
     encoder: { codec: 'H264', fps: 0, frames_encoded: 0, bytes_encoded: 0 },
     webrtc: { peer_state: 'new', ice_state: 'new', frames_sent: 0 }
   },
   clientStats: {
     packetsReceived: 0,
     bytesReceived: 0,
     framesDecoded: 0,
     framesDropped: 0,
     jitter: 0,
     decodeFps: 0,
     prevFramesDecoded: 0,
     prevTimestamp: 0,
     pipelineState: 'CONNECTING',
     pipelineDetail: 'Establishing remote desktop stream...'
   },
   showDiagnostics: true,
 
   init(containerEl) {
     this.container = containerEl;
     this.render();
     this.connect();
   },
 
   render() {
     if (!this.container) return;
 
     this.container.innerHTML = `
       <div id="desktop-setup-view" style="max-width: 620px; margin: 4rem auto; background: #000; border: 2px solid #fff; box-shadow: 6px 6px 0 #fff; padding: 2.5rem; font-family: var(--font-mono); border-radius: 0;">
         <h3 style="margin-top: 0; font-size: 0.9rem; font-weight: 900; text-transform: uppercase; color: #fff; border-bottom: 2px dashed #fff; padding-bottom: 0.75rem; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;">
           <span>Remote Display Stream</span>
           <span style="font-size: 0.65rem; color: #a1a1aa; text-transform: uppercase;">Control Console</span>
         </h3>
         
         <p style="font-size: 0.72rem; color: #a1a1aa; line-height: 1.5; margin-bottom: 1.5rem; background: #0e0e11; border: 1px dashed #33333e; padding: 0.75rem;">
           <b>Virtual Display Isolation</b>: Safe sandbox environment streaming desktop pixels directly to the web client using WebRTC and secure WebSocket tunnels.
         </p>
 
         <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 2rem;">
           <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222222; padding-bottom: 0.5rem; font-size: 0.7rem;">
             <span style="color: #888;">Desktop Status:</span>
             <span style="color: #eab308; font-weight: bold;" id="desktop-status-val">Connecting...</span>
           </div>
           <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222222; padding-bottom: 0.5rem; font-size: 0.7rem;">
             <span style="color: #888;">Protocol Engine:</span>
             <span style="color: #fff;">Dual Transport (WebRTC / WS)</span>
           </div>
         </div>
 
         <button class="btn btn-panel btn-open" id="btn-start-desktop" disabled style="width: 100%; background: #333; color: #888; font-weight: 900; text-transform: uppercase; padding: 0.85rem; border: 2px solid #333; font-size: 0.75rem; text-align: center;">
           Negotiating Stream Handshake...
         </button>
       </div>
 
       <!-- Live Stream View Container -->
       <div id="desktop-stream-view" style="display: none; width: 100%; height: 100vh; background: #000; position: relative; overflow: hidden; justify-content: center; align-items: center;">
         <video id="desktop-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; cursor: default; display: block;"></video>
         <canvas id="desktop-canvas" style="width: 100%; height: 100%; object-fit: contain; cursor: default; display: none;"></canvas>
         
         <!-- Live Developer Diagnostics HUD -->
         <div id="desktop-diag-hud" style="position: absolute; top: 1rem; left: 1rem; width: 380px; background: rgba(5, 7, 12, 0.92); border: 1px solid #38bdf8; box-shadow: 0 4px 20px rgba(0,0,0,0.8); padding: 0.85rem; z-index: 120; font-family: var(--font-mono); font-size: 0.65rem; color: #e2e8f0; pointer-events: auto;">
           <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 0.4rem; margin-bottom: 0.5rem;">
             <span style="color: #38bdf8; font-weight: 900; letter-spacing: 0.05em; display: flex; align-items: center; gap: 0.4rem;">
               <span style="display: inline-block; width: 8px; height: 8px; background: #38bdf8; border-radius: 50%;"></span>
               PIPELINE DIAGNOSTICS
             </span>
             <button id="btn-toggle-diag-hud" style="background: none; border: 1px solid #475569; color: #94a3b8; font-size: 0.6rem; cursor: pointer; padding: 0.1rem 0.4rem;">Minimize</button>
           </div>
 
           <div id="diag-hud-content">
             <!-- Verdict Badge -->
             <div id="diag-verdict-box" style="background: #1e1b4b; border: 1px solid #6366f1; padding: 0.4rem 0.6rem; margin-bottom: 0.6rem; border-radius: 2px;">
               <div style="font-weight: bold; color: #a5b4fc;" id="diag-verdict-state">STATE: EVALUATING...</div>
               <div style="font-size: 0.58rem; color: #c7d2fe; margin-top: 0.2rem;" id="diag-verdict-desc">Analyzing video pipeline telemetry...</div>
             </div>
 
             <!-- Diagnostics Metrics Table -->
             <table style="width: 100%; border-collapse: collapse; font-size: 0.62rem; line-height: 1.4;">
               <tr>
                 <td style="color: #94a3b8; padding: 2px 0;">1. Capture Status:</td>
                 <td style="text-align: right; font-weight: bold;" id="hud-cap-state">INITIALIZING</td>
               </tr>
               <tr>
                 <td style="color: #94a3b8; padding: 2px 0;">Capture FPS / Engine:</td>
                 <td style="text-align: right;" id="hud-cap-fps">0 FPS (NONE)</td>
               </tr>
               <tr>
                 <td style="color: #94a3b8; padding: 2px 0;">Resolution / Brightness:</td>
                 <td style="text-align: right;" id="hud-cap-res">0x0 (Avg: 0)</td>
               </tr>
               <tr>
                 <td style="color: #94a3b8; padding: 2px 0;">2. Encoder Status:</td>
                 <td style="text-align: right;" id="hud-enc-info">H.264 (0 FPS)</td>
               </tr>
               <tr>
                 <td style="color: #94a3b8; padding: 2px 0;">3. WebRTC Peer / ICE:</td>
                 <td style="text-align: right;" id="hud-rtc-state">new / new</td>
               </tr>
               <tr>
                 <td style="color: #94a3b8; padding: 2px 0;">Packets In / Decoded:</td>
                 <td style="text-align: right;" id="hud-rtc-pkts">0 pkts (0.00 MB)</td>
               </tr>
               <tr>
                 <td style="color: #94a3b8; padding: 2px 0;">Decode FPS / Dropped:</td>
                 <td style="text-align: right;" id="hud-rtc-decode">0 FPS (0 dropped / 0ms jit)</td>
               </tr>
               <tr>
                 <td style="color: #94a3b8; padding: 2px 0;">4. Video Element Size:</td>
                 <td style="text-align: right;" id="hud-video-dim">0x0 (Ready: 0, Paused)</td>
               </tr>
             </table>
           </div>
         </div>
 
         <!-- Global Action Dock -->
         <div id="desktop-action-dock" style="position: absolute; bottom: 2rem; left: 50%; transform: translateX(-50%); background: rgba(5, 7, 12, 0.95); border: 1.5px solid #27272a; padding: 0.55rem 1.25rem; display: flex; gap: 1.5rem; align-items: center; border-radius: 2px; z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
           <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.65rem; color: #10b981; font-weight: bold; text-transform: uppercase;">
             <span style="width: 7px; height: 7px; background: #10b981; border-radius: 50%; display: inline-block;"></span>
             Live
           </div>
           <div style="width: 1px; height: 12px; background: #27272a;"></div>
           <button id="btn-desktop-fit" style="background: none; border: none; color: #a1a1aa; font-family: var(--font-mono); font-size: 0.65rem; cursor: pointer; text-transform: uppercase; font-weight: bold;">Toggle Scale</button>
           <div style="width: 1px; height: 12px; background: #27272a;"></div>
           <button id="btn-desktop-diag" style="background: none; border: none; color: #38bdf8; font-family: var(--font-mono); font-size: 0.65rem; cursor: pointer; text-transform: uppercase; font-weight: bold;">Diagnostics</button>
           <div style="width: 1px; height: 12px; background: #27272a;"></div>
           <button id="btn-desktop-disconnect" style="background: none; border: none; color: #ef4444; font-family: var(--font-mono); font-size: 0.65rem; cursor: pointer; text-transform: uppercase; font-weight: bold;">Disconnect</button>
         </div>
       </div>
     `;
 
     const diagToggle = this.container.querySelector('#btn-toggle-diag-hud');
     const diagContent = this.container.querySelector('#diag-hud-content');
     if (diagToggle && diagContent) {
       diagToggle.addEventListener('click', () => {
         if (diagContent.style.display === 'none') {
           diagContent.style.display = 'block';
           diagToggle.textContent = 'Minimize';
         } else {
           diagContent.style.display = 'none';
           diagToggle.textContent = 'Expand';
         }
       });
     }
 
     const menuDiag = this.container.querySelector('#btn-desktop-diag');
     const diagHud = this.container.querySelector('#desktop-diag-hud');
     if (menuDiag && diagHud) {
       menuDiag.addEventListener('click', () => {
         this.showDiagnostics = !this.showDiagnostics;
         diagHud.style.display = this.showDiagnostics ? 'block' : 'none';
         menuDiag.style.color = this.showDiagnostics ? '#38bdf8' : '#71717a';
       });
     }
 
     const launchBtn = this.container.querySelector('#btn-start-desktop');
     if (launchBtn) {
       launchBtn.addEventListener('click', () => this.connect());
     }
   },
 
   async connect() {
     const video = this.container.querySelector('#desktop-video');
     const setupView = this.container.querySelector('#desktop-setup-view');
     const streamView = this.container.querySelector('#desktop-stream-view');
     const statusVal = this.container.querySelector('#desktop-status-val');
     const launchBtn = this.container.querySelector('#btn-start-desktop');
 
     if (launchBtn) {
       launchBtn.disabled = true;
       launchBtn.textContent = 'Negotiating Stream Handshake...';
       launchBtn.style.background = '#333';
       launchBtn.style.color = '#888';
       launchBtn.style.borderColor = '#333';
     }
     if (statusVal) {
       statusVal.textContent = 'Connecting...';
       statusVal.style.color = '#eab308';
     }
 
     try {
       const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
       const token = localStorage.getItem('homelab_token') || '';
       const wsUrl = `${wsProtocol}//${window.location.host}/ws/desktop?token=${encodeURIComponent(token)}`;
 
       this.ws = new WebSocket(wsUrl);
 
       this.ws.onopen = async () => {
         this.pc = new RTCPeerConnection({
           iceServers: [
             { urls: 'stun:stun.l.google.com:19302' },
             { urls: 'stun:stun1.l.google.com:19302' },
             { urls: 'stun:stun2.l.google.com:19302' }
           ]
         });
 
         this.pc.onconnectionstatechange = () => {
           this.telemetry.webrtc.peer_state = this.pc.connectionState;
           this.updateDiagnosticsUI();
         };
 
         this.pc.oniceconnectionstatechange = () => {
           this.telemetry.webrtc.ice_state = this.pc.iceConnectionState;
           this.updateDiagnosticsUI();
         };
 
         this.pc.ontrack = (event) => {
           const canvas = this.container?.querySelector('#desktop-canvas');
           if (video) {
             if (event.streams && event.streams[0]) {
               video.srcObject = event.streams[0];
             } else {
               video.srcObject = new MediaStream([event.track]);
             }
             
             video.style.display = 'block';
             if (canvas) canvas.style.display = 'none';
             video.play().catch((e) => console.warn('Video auto-play warning:', e));
             
             if (setupView) setupView.style.display = 'none';
             if (streamView) streamView.style.display = 'flex';
           }
         };
 
         this.inputChannel = this.pc.createDataChannel('input', { ordered: true });
         this.inputChannel.onopen = () => {
           console.log('WebRTC input channel active');
         };
 
         this.bindInputEvents(video);
 
         this.pc.addTransceiver('video', { direction: 'recvonly' });
         const offer = await this.pc.createOffer();
         await this.pc.setLocalDescription(offer);
 
         // Await local ICE gathering completion for STUN discovery candidate baking
         if (this.pc.iceGatheringState !== 'complete') {
           await new Promise((resolve) => {
             const checkState = () => {
               if (this.pc.iceGatheringState === 'complete') {
                 this.pc.removeEventListener('icegatheringstatechange', checkState);
                 resolve();
               }
             };
             this.pc.addEventListener('icegatheringstatechange', checkState);
             setTimeout(resolve, 1500);
           });
         }
 
         this.ws.send(JSON.stringify({
           type: 'offer',
           sdp: this.pc.localDescription.sdp
         }));
 
         setTimeout(() => {
           const setupView = this.container?.querySelector('#desktop-setup-view');
           const streamView = this.container?.querySelector('#desktop-stream-view');
           if (setupView && setupView.style.display !== 'none') {
             setupView.style.display = 'none';
             if (streamView) streamView.style.display = 'flex';
           }
         }, 800);
 
         this.startStatsPoller();
       };
 
       this.ws.onmessage = async (evt) => {
         try {
           const rawText = (typeof Blob !== 'undefined' && evt.data instanceof Blob) ? await evt.data.text() : evt.data;
           const payload = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
           if (payload.type === 'answer') {
             await this.pc.setRemoteDescription(new RTCSessionDescription(payload));
           } else if (payload.type === 'frame') {
             const canvas = this.container.querySelector('#desktop-canvas');
             const video = this.container.querySelector('#desktop-video');
             const setupView = this.container.querySelector('#desktop-setup-view');
             const streamView = this.container.querySelector('#desktop-stream-view');
             
             // Only draw to canvas if WebRTC video is NOT actively streaming
             const isWebRTCPlaying = video && video.srcObject && video.readyState >= 2 && !video.paused;
             if (!isWebRTCPlaying && canvas && payload.data) {
               const img = new Image();
               img.onload = () => {
                 canvas.width = img.width;
                 canvas.height = img.height;
                 const ctx = canvas.getContext('2d');
                 ctx.drawImage(img, 0, 0);
                 
                 if (canvas.style.display !== 'block') {
                   canvas.style.display = 'block';
                   if (video) video.style.display = 'none';
                 }
                 
                 if (setupView && setupView.style.display !== 'none') setupView.style.display = 'none';
                 if (streamView && streamView.style.display !== 'flex') streamView.style.display = 'flex';
                 
                 this.clientStats.packetsReceived += 1;
                 this.clientStats.framesDecoded += 1;
                 this.clientStats.bytesReceived += payload.data.length;
                 this.clientStats.pipelineState = 'STATE OK (STREAMING LIVE)';
                 this.clientStats.pipelineDetail = `Tunnel Stream Active (${img.width}x${img.height} @ 30 FPS)`;
                 this.updateDiagnosticsUI();
               };
               img.src = `data:image/jpeg;base64,${payload.data}`;
             }
           } else if (payload.type === 'telemetry') {
             this.telemetry = payload;
             this.updateDiagnosticsUI();
           } else if (payload.type === 'status') {
             if (payload.status === 'daemon_online') {
               console.log('[DesktopClient] Host daemon online. Initiating WebRTC offer...');
               const offer = await this.pc.createOffer();
               await this.pc.setLocalDescription(offer);
               this.ws.send(JSON.stringify({
                 type: 'offer',
                 sdp: this.pc.localDescription.sdp
               }));
             } else if (payload.status === 'daemon_offline') {
               this.clientStats.pipelineState = 'DAEMON OFFLINE';
               this.clientStats.pipelineDetail = 'Remote desktop capture service is currently offline on host OS.';
               this.updateDiagnosticsUI();
             }
           } else if (payload.type === 'error') {
             alert(`Stream error: ${payload.message}`);
             this.destroy();
           }
         } catch (err) {
           console.error('Failed to process message payload:', err);
         }
       };
 
       this.ws.onclose = () => this.destroy();
       this.ws.onerror = () => this.destroy();
 
       const fitBtn = this.container.querySelector('#btn-desktop-fit');
       if (fitBtn && video) {
         fitBtn.addEventListener('click', () => {
           video.style.objectFit = video.style.objectFit === 'contain' ? 'cover' : 'contain';
         });
       }
 
       const disconnectBtn = this.container.querySelector('#btn-desktop-disconnect');
       if (disconnectBtn) {
         disconnectBtn.addEventListener('click', () => this.destroy());
       }
 
     } catch (err) {
       alert(`Connection Negotiation Failed: ${err.message}`);
       this.destroy();
     }
   },
 
   startStatsPoller() {
     if (this.statsInterval) clearInterval(this.statsInterval);
 
     this.statsInterval = setInterval(async () => {
       if (!this.pc) return;
 
       try {
         const stats = await this.pc.getStats();
         let activeVideoReport = null;
 
         stats.forEach((report) => {
           if (report.type === 'inbound-rtp' && report.kind === 'video') {
             activeVideoReport = report;
           }
         });
 
         if (activeVideoReport) {
           const now = performance.now();
           const rtc = this.clientStats;
           
           rtc.packetsReceived = activeVideoReport.packetsReceived || 0;
           rtc.bytesReceived = activeVideoReport.bytesReceived || 0;
           rtc.framesDecoded = activeVideoReport.framesDecoded || 0;
           rtc.framesDropped = activeVideoReport.framesDropped || 0;
           rtc.jitter = Math.round((activeVideoReport.jitter || 0) * 1000);
 
           if (rtc.prevTimestamp > 0) {
             const dt = (now - rtc.prevTimestamp) / 1000;
             const df = rtc.framesDecoded - rtc.prevFramesDecoded;
             rtc.decodeFps = Math.max(0, Math.round(df / dt));
           }
 
           rtc.prevFramesDecoded = rtc.framesDecoded;
           rtc.prevTimestamp = now;
 
           this.classifyPipelineHealth(activeVideoReport);
           this.updateDiagnosticsUI();
         }
       } catch (err) {
         console.warn('Stats collector error:', err);
       }
     }, 1000);
   },
 
   classifyPipelineHealth(rtpReport) {
     const rtc = this.clientStats;
     const cap = this.telemetry.capture || {};
     const enc = this.telemetry.encoder || {};
     const video = this.container.querySelector('#desktop-video');
 
     if (cap.state === 'CAPTURE_UNAVAILABLE') {
       rtc.pipelineState = 'STATE A (CAPTURE FAILED)';
       rtc.pipelineDetail = `OS Capture API failed: ${cap.error_detail || 'No display connection detected.'}`;
       return;
     }
 
     if (cap.state === 'CAPTURE_BLACK_FRAMES') {
       rtc.pipelineState = 'STATE B (BLACK CAPTURE)';
       rtc.pipelineDetail = `Host display buffer has 0 brightness. Display is empty or unrendered.`;
       return;
     }
 
     if (enc.frames_encoded > 0 && rtc.packetsReceived === 0) {
       rtc.pipelineState = 'STATE C (NETWORK DROPPING)';
       rtc.pipelineDetail = `Daemon encoded ${enc.frames_encoded} frames, but browser received 0 packets. Check UDP routes.`;
       return;
     }
 
     if (rtc.packetsReceived > 0 && rtc.framesDecoded === 0) {
       rtc.pipelineState = 'STATE E (DECODER STALL)';
       rtc.pipelineDetail = `Browser received ${rtc.packetsReceived} packets, but hardware decoder decoded 0 frames.`;
       return;
     }
 
     if (rtc.framesDecoded > 0 && (!video || video.videoWidth === 0 || video.readyState < 2 || video.paused)) {
       rtc.pipelineState = 'STATE F (VIDEO ELEMENT STALLED)';
       rtc.pipelineDetail = `Browser decoded ${rtc.framesDecoded} frames, but <video> element readyState=${video?.readyState}, paused=${video?.paused}.`;
       return;
     }
 
     if (video && video.videoWidth > 0 && (video.clientWidth === 0 || video.clientHeight === 0)) {
       rtc.pipelineState = 'STATE G (LAYOUT / CSS HIDDEN)';
       rtc.pipelineDetail = `Video has valid dimensions (${video.videoWidth}x${video.videoHeight}), but clientWidth/clientHeight is 0px.`;
       return;
     }
 
     if (rtc.framesDecoded > 0 && video && video.videoWidth > 0) {
       rtc.pipelineState = 'STATE OK (STREAMING LIVE)';
       rtc.pipelineDetail = `Live pipeline operational. Hardware decoded at ${rtc.decodeFps} FPS (${video.videoWidth}x${video.videoHeight}).`;
     }
   },
 
   updateDiagnosticsUI() {
     if (!this.container) return;
 
     const cap = this.telemetry.capture || {};
     const enc = this.telemetry.encoder || {};
     const rtc = this.clientStats;
     const video = this.container.querySelector('#desktop-video');
 
     const capStateEl = this.container.querySelector('#hud-cap-state');
     if (capStateEl) {
       capStateEl.textContent = cap.state || 'INITIALIZING';
       capStateEl.style.color = cap.state === 'CAPTURE_OK' ? '#4ade80' : (cap.state === 'CAPTURE_BLACK_FRAMES' ? '#facc15' : '#f87171');
     }
 
     const capFpsEl = this.container.querySelector('#hud-cap-fps');
     if (capFpsEl) {
       capFpsEl.textContent = `${cap.fps || 0} FPS (${cap.engine || 'NONE'})`;
     }
 
     const capResEl = this.container.querySelector('#hud-cap-res');
     if (capResEl) {
       capResEl.textContent = `${cap.resolution || '0x0'} (Avg: ${cap.mean_brightness || 0})`;
     }
 
     const encInfoEl = this.container.querySelector('#hud-enc-info');
     if (encInfoEl) {
       encInfoEl.textContent = `${enc.codec || 'H264'} (${enc.fps || 0} FPS / ${enc.frames_encoded || 0} frames)`;
     }
 
     const rtcStateEl = this.container.querySelector('#hud-rtc-state');
     if (rtcStateEl) {
       rtcStateEl.textContent = `${this.telemetry.webrtc.peer_state || 'new'} / ${this.telemetry.webrtc.ice_state || 'new'}`;
       rtcStateEl.style.color = this.telemetry.webrtc.peer_state === 'connected' ? '#4ade80' : '#facc15';
     }
 
     const rtcPktsEl = this.container.querySelector('#hud-rtc-pkts');
     if (rtcPktsEl) {
       const mb = (rtc.bytesReceived / (1024 * 1024)).toFixed(2);
       rtcPktsEl.textContent = `${rtc.packetsReceived} pkts (${mb} MB)`;
     }
 
     const rtcDecodeEl = this.container.querySelector('#hud-rtc-decode');
     if (rtcDecodeEl) {
       rtcDecodeEl.textContent = `${rtc.decodeFps} FPS (${rtc.framesDropped} dropped / ${rtc.jitter}ms jit)`;
     }
 
     const vidDimEl = this.container.querySelector('#hud-video-dim');
     if (vidDimEl && video) {
       vidDimEl.textContent = `${video.videoWidth}x${video.videoHeight} (Ready: ${video.readyState}, ${video.paused ? 'Paused' : 'Playing'})`;
     }
 
     const verdictStateEl = this.container.querySelector('#diag-verdict-state');
     const verdictDescEl = this.container.querySelector('#diag-verdict-desc');
     const verdictBox = this.container.querySelector('#diag-verdict-box');
 
     if (verdictStateEl && verdictDescEl && verdictBox) {
       verdictStateEl.textContent = rtc.pipelineState;
       verdictDescEl.textContent = rtc.pipelineDetail;
 
       if (rtc.pipelineState.startsWith('STATE OK')) {
         verdictBox.style.background = '#052e16';
         verdictBox.style.borderColor = '#22c55e';
         verdictStateEl.style.color = '#86efac';
         verdictDescEl.style.color = '#bbf7d0';
       } else if (rtc.pipelineState.includes('BLACK') || rtc.pipelineState.includes('CONNECTING')) {
         verdictBox.style.background = '#422006';
         verdictBox.style.borderColor = '#eab308';
         verdictStateEl.style.color = '#fde047';
         verdictDescEl.style.color = '#fef08a';
       } else {
         verdictBox.style.background = '#450a0a';
         verdictBox.style.borderColor = '#ef4444';
         verdictStateEl.style.color = '#fca5a5';
         verdictDescEl.style.color = '#fecaca';
       }
     }
   },
 
    bindInputEvents(video) {
      const canvas = this.container?.querySelector('#desktop-canvas');
      const targetEl = canvas || video;
      if (!targetEl) return;

      const sendInput = (data) => {
        const msg = JSON.stringify(data);
        if (this.inputChannel && this.inputChannel.readyState === 'open') {
          this.inputChannel.send(msg);
        } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(msg);
        }
      };

      const getNormalizedCoordinates = (e, el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };

        const isCanvas = (canvas && canvas.style.display !== 'none');
        const contentWidth = isCanvas ? canvas.width : (video?.videoWidth || rect.width);
        const contentHeight = isCanvas ? canvas.height : (video?.videoHeight || rect.height);

        if (contentWidth > 0 && contentHeight > 0) {
          const videoRatio = contentWidth / contentHeight;
          const containerRatio = rect.width / rect.height;

          let renderedWidth = rect.width;
          let renderedHeight = rect.height;
          let offsetX = 0;
          let offsetY = 0;

          if (containerRatio > videoRatio) {
            renderedWidth = rect.height * videoRatio;
            offsetX = (rect.width - renderedWidth) / 2;
          } else {
            renderedHeight = rect.width / videoRatio;
            offsetY = (rect.height - renderedHeight) / 2;
          }

          const clientX = e.clientX - rect.left - offsetX;
          const clientY = e.clientY - rect.top - offsetY;

          return {
            x: Math.max(0, Math.min(1, clientX / renderedWidth)),
            y: Math.max(0, Math.min(1, clientY / renderedHeight))
          };
        }

        return {
          x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
          y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
        };
      };

      const onMouseMove = (e) => {
        const el = (canvas && canvas.style.display !== 'none') ? canvas : video;
        if (el) {
          const coords = getNormalizedCoordinates(e, el);
          sendInput({
            type: 'mousemove',
            x: coords.x,
            y: coords.y
          });
        }
      };

      const activePressedKeys = new Set();
      const activePressedButtons = new Set();

      const onMouseDown = (e) => {
        const btnMap = { 0: 'left', 1: 'middle', 2: 'right', 3: 'back', 4: 'forward' };
        const btn = btnMap[e.button] || 'left';
        activePressedButtons.add(btn);
        sendInput({
          type: 'mousedown',
          button: btn
        });
      };

      const onMouseUp = (e) => {
        const btnMap = { 0: 'left', 1: 'middle', 2: 'right', 3: 'back', 4: 'forward' };
        const btn = btnMap[e.button] || 'left';
        activePressedButtons.delete(btn);
        sendInput({
          type: 'mouseup',
          button: btn
        });
      };

      const releaseAllInputState = () => {
        if (activePressedButtons.size > 0) {
          activePressedButtons.forEach(btn => {
            sendInput({ type: 'mouseup', button: btn });
          });
          activePressedButtons.clear();
        }
        if (activePressedKeys.size > 0) {
          activePressedKeys.forEach(code => {
            sendInput({ type: 'keyup', code: code, key: code });
          });
          activePressedKeys.clear();
        }
        sendInput({ type: 'reset_inputs' });
      };

      const onKeyDown = (e) => {
        const streamView = this.container?.querySelector('#desktop-stream-view');
        if (streamView && streamView.style.display !== 'none') {
          if (['Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'F1', 'F3', 'F5', 'F6', 'F11', 'F12'].includes(e.key)) {
            e.preventDefault();
          }
          activePressedKeys.add(e.code || e.key);
          sendInput({
            type: 'keydown',
            key: e.key,
            code: e.code
          });
        }
      };

      const onKeyUp = (e) => {
        const streamView = this.container?.querySelector('#desktop-stream-view');
        if (streamView && streamView.style.display !== 'none') {
          activePressedKeys.delete(e.code || e.key);
          sendInput({
            type: 'keyup',
            key: e.key,
            code: e.code
          });
        }
      };

      const onWheel = (e) => {
        e.preventDefault();
        sendInput({
          type: 'wheel',
          dx: e.deltaX,
          dy: e.deltaY
        });
      };

      if (canvas) {
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      }
      if (video) {
        video.addEventListener('mousemove', onMouseMove);
        video.addEventListener('mousedown', onMouseDown);
        video.addEventListener('wheel', onWheel, { passive: false });
        video.addEventListener('contextmenu', (e) => e.preventDefault());
      }
      
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', releaseAllInputState);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          releaseAllInputState();
        }
      });

      this.cleanupInputListeners = () => {
        if (canvas) {
          canvas.removeEventListener('mousemove', onMouseMove);
          canvas.removeEventListener('mousedown', onMouseDown);
          canvas.removeEventListener('mouseup', onMouseUp);
          canvas.removeEventListener('wheel', onWheel);
        }
        if (video) {
          video.removeEventListener('mousemove', onMouseMove);
          video.removeEventListener('mousedown', onMouseDown);
          video.removeEventListener('mouseup', onMouseUp);
          video.removeEventListener('wheel', onWheel);
        }
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    },
 
   destroy() {
     if (this.statsInterval) {
       clearInterval(this.statsInterval);
       this.statsInterval = null;
     }
 
     if (this.cleanupInputListeners) {
       this.cleanupInputListeners();
       this.cleanupInputListeners = null;
     }
 
     if (this.ws) {
       this.ws.onclose = null;
       this.ws.onerror = null;
       this.ws.onmessage = null;
       try {
         this.ws.close();
       } catch {}
       this.ws = null;
     }
 
     if (this.pc) {
       try {
         this.pc.close();
       } catch {}
       this.pc = null;
     }
 
     this.inputChannel = null;
 
     const setupView = this.container?.querySelector('#desktop-setup-view');
     const streamView = this.container?.querySelector('#desktop-stream-view');
     const statusVal = this.container?.querySelector('#desktop-status-val');
     const launchBtn = this.container?.querySelector('#btn-start-desktop');
 
     if (setupView) setupView.style.display = 'block';
     if (streamView) streamView.style.display = 'none';
     if (statusVal) {
       statusVal.textContent = 'Offline';
       statusVal.style.color = '#ef4444';
     }
     if (launchBtn) {
       launchBtn.disabled = false;
       launchBtn.textContent = 'Connect Remote Desktop Stream';
       launchBtn.style.background = '#fff';
       launchBtn.style.color = '#000';
       launchBtn.style.borderColor = '#fff';
     }
   }
 };
 
 export default AppDesktop;
 