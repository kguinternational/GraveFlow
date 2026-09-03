/**
 * GraveFlow Digital Twin Assistant (Joann Coffey)
 * Dynamically injects a premium glassmorphic helper widget.
 * Powered by a Sovereign 3D Holographic Particle Avatar (Three.js + Web Audio API).
 * Adheres strictly to .stitch/DESIGN.md.
 */

import StreamingAvatar, { AvatarQuality, TaskType } from 'https://cdn.jsdelivr.net/npm/@heygen/streaming-avatar/lib/index.esm.js';
import * as THREE from 'https://esm.sh/three@0.160.0';

const CSUITE_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
  ? 'http://localhost:8003'
  : window.location.origin + '/csuite-api';
const TTS_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
  ? 'http://localhost:8001'
  : window.location.origin + '/tts';

// ── Inject CSS Styles ───────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
  #twin-widget {
    position: fixed;
    bottom: auto;
    right: auto;
    left: calc(100vw - 180px);
    top: calc(100vh - 80px);
    z-index: 10000;
    font-family: 'Inter', -apple-system, sans-serif;
    touch-action: none;
    cursor: grab;
  }
  
  #twin-patrol-btn {
    background: none;
    border: 1px solid rgba(201, 168, 76, 0.4);
    border-radius: 6px;
    color: #c9a84c;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: bold;
    transition: all 0.3s ease;
  }
  #twin-patrol-btn.active {
    background: #c9a84c !important;
    color: #08080a !important;
    box-shadow: 0 0 10px rgba(201, 168, 76, 0.4);
  }
  
  #twin-trigger {
    background: #0d0e12;
    border: 1px solid rgba(201, 168, 76, 0.35);
    border-radius: 50px;
    color: #c9a84c;
    padding: 14px 28px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 15px rgba(201, 168, 76, 0.1);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    backdrop-filter: blur(12px);
  }
  
  #twin-trigger:hover {
    background: #08080a;
    border-color: #c9a84c;
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 12px 40px rgba(0,0,0,0.7), 0 0 25px rgba(201, 168, 76, 0.35);
  }
  
  #twin-panel {
    display: none;
    position: absolute;
    bottom: 75px;
    right: 0;
    width: 380px;
    height: 580px;
    background: rgba(13, 14, 18, 0.95);
    border: 1px solid rgba(201, 168, 76, 0.2);
    border-radius: 20px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.8), 0 0 20px rgba(201, 168, 76, 0.05);
    overflow: hidden;
    flex-direction: column;
    z-index: 10001;
    backdrop-filter: blur(25px);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }
  
  .panel-header-title {
    font-family: 'Georgia', serif;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.5px;
  }

  .panel-twin-connect-btn {
    background: linear-gradient(135deg, #c9a84c, #a8873d);
    color: #08080a;
    border: none;
    border-radius: 8px;
    padding: 12px 28px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(201, 168, 76, 0.2);
  }
  
  .panel-twin-connect-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(201, 168, 76, 0.4);
    opacity: 0.95;
  }
  
  .panel-prompt-btn {
    background: rgba(201, 168, 76, 0.03);
    border: 1px solid rgba(201, 168, 76, 0.12);
    border-radius: 8px;
    color: #a0a0b0;
    padding: 10px 14px;
    text-align: left;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .panel-prompt-btn:hover {
    background: rgba(201, 168, 76, 0.08);
    border-color: rgba(201, 168, 76, 0.3);
    color: #fff;
  }

  .twin-chat-bubble {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 12.5px;
    line-height: 1.4;
    max-width: 80%;
    margin-bottom: 8px;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .twin-chat-bubble.user {
    background: rgba(201, 168, 76, 0.15);
    border: 1px solid rgba(201, 168, 76, 0.25);
    color: #fff;
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }

  .twin-chat-bubble.bot {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #f5f5f7;
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .avatar-pulse-ring {
    position: absolute;
    width: 90px;
    height: 90px;
    border-radius: 50%;
    border: 2px solid rgba(201, 168, 76, 0.3);
    animation: ringPulse 2s infinite ease-out;
  }

  @keyframes ringPulse {
    0% { transform: scale(0.9); opacity: 0.8; }
    50% { opacity: 0.4; }
    100% { transform: scale(1.3); opacity: 0; }
  }
`;
document.head.appendChild(style);

// ── Inject HTML Markup ─────────────────────────────────────────
const widgetDiv = document.createElement('div');
widgetDiv.id = 'twin-widget';
widgetDiv.innerHTML = `
  <button id="twin-trigger">
    <span style="font-size: 16px;">👑</span> Ask Joann
  </button>

  <div id="twin-panel">
    <!-- Header -->
    <div class="panel-drag-header" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(201, 168, 76, 0.15); background: rgba(0,0,0,0.35); cursor: grab; user-select: none;">
      <div style="display: flex; align-items: center; gap: 10px; pointer-events: none;">
        <div style="width: 10px; height: 10px; border-radius: 50%; background: #c9a84c; box-shadow: 0 0 10px #c9a84c;"></div>
        <span class="panel-header-title">Joann Coffey (Digital Twin)</span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; z-index: 10;">
        <button id="twin-patrol-btn">🚶‍♂️ Walk</button>
        <button id="twin-close-btn" style="background: none; border: none; color: #a0a0b0; font-size: 24px; cursor: pointer; line-height: 1; transition: color 0.2s;">&times;</button>
      </div>
    </div>

    <!-- 3D Hologram / Video Container -->
    <div id="panelTwinPlaceholder" style="height: 240px; background: #060608; border-bottom: 1px solid rgba(201, 168, 76, 0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px; position: relative; overflow: hidden;">
      <div class="avatar-pulse-ring"></div>
      <div style="width: 70px; height: 70px; border-radius: 50%; background: linear-gradient(135deg, #c9a84c, #9b6dff); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #000; margin-bottom: 12px; z-index: 1;">JC</div>
      <h4 style="color: #fff; font-size: 14px; margin-bottom: 4px; z-index: 1; font-family: 'Georgia', serif;">Connect with Founder</h4>
      <p style="color: #a0a0b0; font-size: 11px; max-width: 260px; line-height: 1.4; margin-bottom: 12px; z-index: 1;">Establish a WebRTC session to speak directly with Joann.</p>
      <button id="panel-twin-connect-btn" class="panel-twin-connect-btn" style="z-index: 1;">⚡ Start Session</button>
    </div>

    <!-- Chat History Feed -->
    <div id="twin-chat-history" style="flex: 1; padding: 16px 20px; display: flex; flex-direction: column; overflow-y: auto; background: rgba(0,0,0,0.1);">
      <div style="text-align: center; color: #888; font-size: 11px; margin-top: 10px;">Select a prompt below or type your query.</div>
    </div>

    <!-- Quick Questions -->
    <div style="padding: 10px 20px; display: flex; flex-direction: column; gap: 6px; border-top: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.05);">
      <button class="panel-prompt-btn" data-query="How does GraveFlow show love and honor?">💬 "How does GraveFlow show love and honor?"</button>
      <button class="panel-prompt-btn" data-query="Explain the core of The Love Effect OS.">💬 "Explain the core of The Love Effect OS."</button>
    </div>

    <!-- Input Box -->
    <div style="padding: 16px 20px; border-top: 1px solid rgba(201, 168, 76, 0.15); background: rgba(0,0,0,0.35); display: flex; gap: 10px; align-items: center;">
      <input type="text" id="panelTwinInput" placeholder="Ask Joann a question..." style="flex: 1; background: rgba(0,0,0,0.4); border: 1px solid rgba(201, 168, 76, 0.15); border-radius: 8px; color: #fff; padding: 12px 14px; font-size: 12.5px; outline: none; transition: border-color 0.2s;" />
      <button id="panel-twin-send-btn" style="background: #c9a84c; border: none; border-radius: 8px; color: #000; padding: 12px 16px; cursor: pointer; font-weight: bold; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: background 0.2s;">➔</button>
    </div>
  </div>
`;
document.body.appendChild(widgetDiv);

// ── Widget Logic & Events ──────────────────────────────────────
let avatarInstance = null;
let isConnected = false;
let localSovereignActive = false;

// Web Audio & Three.js globals
let audioContext = null;
let audioAnalyser = null;
let audioDataArray = null;
let threeRenderer = null;
let threeScene = null;
let threeCamera = null;
let threeParticles = null;
let animationFrameId = null;

const trigger = document.getElementById('twin-trigger');
const panel = document.getElementById('twin-panel');
const closeBtn = document.getElementById('twin-close-btn');
const connectBtn = document.getElementById('panel-twin-connect-btn');
const sendBtn = document.getElementById('panel-twin-send-btn');
const inputField = document.getElementById('panelTwinInput');
const placeholder = document.getElementById('panelTwinPlaceholder');
const chatHistory = document.getElementById('twin-chat-history');

function togglePanel() {
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'flex';
  } else {
    panel.style.display = 'none';
  }
}

trigger.addEventListener('click', togglePanel);
closeBtn.addEventListener('click', togglePanel);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panel.style.display === 'flex') {
    togglePanel();
  }
});

closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#fff');
closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#a0a0b0');
inputField.addEventListener('focus', () => inputField.style.borderColor = '#c9a84c');
inputField.addEventListener('blur', () => inputField.style.borderColor = 'rgba(201, 168, 76, 0.15)');

async function connectSession() {
  connectBtn.textContent = 'Connecting...';
  connectBtn.disabled = true;

  try {
    const res = await fetch('/api/heygen-token', { method: 'POST' });
    if (!res.ok) throw new Error('Token endpoint unavailable');
    const { token } = await res.json();
    
    if (token.startsWith('mock-')) {
      console.warn('HeyGen key missing - initiating local Sovereign 3D Hologram Mode');
      initSovereignMode();
      return;
    }

    await initAvatar(token);
  } catch (err) {
    console.error('Failed to connect to digital twin:', err);
    initSovereignMode();
  }
}

connectBtn.addEventListener('click', connectSession);

// ── Initialize Sovereign 3D Audio-Reactive Hologram ─────────────
function initSovereignMode() {
  localSovereignActive = true;
  isConnected = true;
  
  placeholder.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  placeholder.appendChild(canvas);

  // Injected HUD Badge overlay
  const badge = document.createElement('div');
  badge.style.position = 'absolute';
  badge.style.top = '12px';
  badge.style.left = '12px';
  badge.style.background = 'rgba(201, 168, 76, 0.15)';
  badge.style.border = '1px solid rgba(201, 168, 76, 0.3)';
  badge.style.borderRadius = '4px';
  badge.style.padding = '2px 8px';
  badge.style.fontSize = '8px';
  badge.style.color = '#c9a84c';
  badge.style.fontWeight = 'bold';
  badge.style.letterSpacing = '1px';
  badge.style.zIndex = '5';
  badge.textContent = 'SOVEREIGN 3D HOLOGRAM';
  placeholder.appendChild(badge);

  // Three.js Setup
  const rect = placeholder.getBoundingClientRect();
  const width = rect.width || 380;
  const height = 240;

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  threeCamera.position.z = 25;

  threeRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Build the 3D golden particle sphere (holographic neural cloud)
  const particleCount = 2000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  const goldColor = new THREE.Color('#c9a84c');
  const accentColor = new THREE.Color('#9b6dff');

  for (let i = 0; i < particleCount; i++) {
    // Math sphere coordinates
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = 8 + Math.random() * 0.5; // slight radius jitter

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Mix gold and purple accents
    const mix = Math.random() * 0.3;
    const col = goldColor.clone().lerp(accentColor, mix);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Particle Material
  const material = new THREE.PointsMaterial({
    size: 0.18,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  threeParticles = new THREE.Points(geometry, material);
  threeScene.add(threeParticles);

  // Render & Animation Loop
  let clock = new THREE.Clock();

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const time = clock.getElapsedTime();
    const positionAttribute = geometry.attributes.position;
    const positionsArr = positionAttribute.array;

    // Retrieve audio data amplitude if active
    let volume = 0;
    if (audioAnalyser) {
      audioAnalyser.getByteFrequencyData(audioDataArray);
      let sum = 0;
      for (let i = 0; i < audioDataArray.length; i++) {
        sum += audioDataArray[i];
      }
      volume = sum / audioDataArray.length;
    }

    // Warp particle positions dynamically
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      const x = positionsArr[idx];
      const y = positionsArr[idx + 1];
      const z = positionsArr[idx + 2];

      // Original base coordinates
      const u = i / particleCount;
      const theta = u * 2.0 * Math.PI * 50;
      
      // Calculate noise warp
      const noise = Math.sin(time * 2 + x * 0.1) * Math.cos(time * 2 + y * 0.1) * 0.4;
      const speakWarp = volume > 0 ? Math.sin(time * 25 + i) * (volume * 0.045) : 0;

      // Add undulating waves + audio reactivity
      positionsArr[idx] += Math.sin(time + z) * 0.01 + speakWarp * 0.08;
      positionsArr[idx + 1] += Math.cos(time + x) * 0.01 + speakWarp * 0.08;
      positionsArr[idx + 2] += Math.sin(time + y) * 0.01 + speakWarp * 0.08;

      // Restoring pull to keep sphere bound
      const length = Math.sqrt(x*x + y*y + z*z);
      const targetR = 8 + noise;
      const force = (targetR - length) * 0.05;
      positionsArr[idx] += (x / length) * force;
      positionsArr[idx + 1] += (y / length) * force;
      positionsArr[idx + 2] += (z / length) * force;
    }

    positionAttribute.needsUpdate = true;

    // Rotate particle system
    threeParticles.rotation.y = time * 0.1;
    threeParticles.rotation.x = time * 0.05;

    threeRenderer.render(threeScene, threeCamera);
  }

  animate();

  appendBubble("Welcome to local Sovereign 3D Hologram Mode. I am Joann Coffey. How can I help you support and honor your loved ones today?", "bot");
}

async function initAvatar(token) {
  try {
    const avatar = new StreamingAvatar({ token });
    avatarInstance = avatar;

    avatar.on('streamReady', (event) => {
      console.log('HeyGen stream ready (widget):', event);
      placeholder.innerHTML = '';
      const video = document.createElement('video');
      video.srcObject = event.detail;
      video.autoplay = true;
      video.playsInline = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      placeholder.appendChild(video);
      isConnected = true;

      appendBubble("Hello, I am Joann Coffey. How can I help you support and honor your loved ones today?", "bot");
    });

    avatar.on('streamDisconnected', () => {
      console.log('HeyGen stream disconnected (widget)');
      showFallback();
    });

    await avatar.createStartAvatar({
      quality: AvatarQuality.Low,
      avatarName: 'cad2810d84a24fc190e4f9a4c9c60427',
      voice: {
        voiceId: '8612954d7a854aa2b168a1b4e47ab4a6'
      }
    });
  } catch (err) {
    console.error('Failed to initialize StreamingAvatar in widget, falling back to 3D hologram:', err);
    initSovereignMode();
  }
}

const COMPASSIONATE_REPLIES = {
  "how does graveflow show love and honor?": "GraveFlow is built on love and honor. We help you care for and honor your deceased loved ones from anywhere in the world. Compassionate caregivers visit the grave site, clean the headstone with care, place fresh flowers, and record video tributes to bring you comfort and peace of mind.",
  "explain the core of the love effect os.": "The Love Effect is the baseline protocol of everything we build. It ensures that cemetery care is treated as a sacred trust, centering the technology around respect and honor for the deceased rather than cold transaction metrics.",
  "what is graveflow?": "GraveFlow is a peer-to-peer cemetery care platform centered around love and honor. We help families connect with trusted local caregivers who perform grave cleanings, place flowers, and share high-quality video tributes.",
  "explain the love effect os.": "The Love Effect is our core philosophy. It means we approach every visit with deep respect, gentle cleaning, and a commitment to preserving the memory of your loved one, verified by secure technology.",
  "what is graveflow's core purpose?": "It is about the family, and never forgetting our loved ones. When distance separates you from a resting place, GraveFlow is the answer—providing compassionate local care, verified by secure technology, keeping memories alive forever.",
  "is graveflow the answer?": "Yes. GraveFlow is the answer. We make sure that distance never gets in the way of family and never forgetting our loved ones."
};

async function askTwin(text) {
  if (!isConnected) {
    alert('Please start the Session first!');
    return;
  }
  
  appendBubble(text, "user");

  if (localSovereignActive) {
    try {
      // 1. Fetch cognitive reply from C-Suite CHAIR
      const aiRes = await fetch(`${CSUITE_BASE}/executive/CHAIR/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      if (!aiRes.ok) throw new Error(`C-Suite server error: ${aiRes.status}`);
      const { reply } = await aiRes.json();

      appendBubble(reply, "bot");

      // 2. Fetch vocal synthesis
      const ttsRes = await fetch(`${TTS_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply })
      });

      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        // Pipe audio into Web Audio API Analyser Node
        if (!audioContext) {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          audioAnalyser = audioContext.createAnalyser();
          audioAnalyser.fftSize = 128;
          audioDataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        }

        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        const source = audioContext.createMediaElementSource(audio);
        source.connect(audioAnalyser);
        audioAnalyser.connect(audioContext.destination);

        audio.play();
        audio.addEventListener('ended', () => {
          URL.revokeObjectURL(url);
          source.disconnect();
        });
      }
    } catch (err) {
      console.error('Sovereign chat error:', err);
      appendBubble("I apologize, but I am having trouble connecting to my local cognitive engine right now.", "bot");
    }
    return;
  }

  const cleanText = text.trim().toLowerCase();
  let speakText = text;
  if (COMPASSIONATE_REPLIES[cleanText]) {
    speakText = COMPASSIONATE_REPLIES[cleanText];
  }

  try {
    await avatarInstance.speak({
      text: speakText,
      task_type: TaskType.TALK
    });

    setTimeout(() => {
      appendBubble(speakText, "bot");
    }, 1500);
  } catch (err) {
    console.error('Speak error, moving to local fallback:', err);
    initSovereignMode();
    askTwin(text);
  }
}

function sendQuery() {
  if (inputField && inputField.value.trim()) {
    askTwin(inputField.value.trim());
    inputField.value = '';
  }
}

sendBtn.addEventListener('click', sendQuery);
inputField.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendQuery();
});

document.querySelectorAll('.panel-prompt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const query = btn.getAttribute('data-query');
    askTwin(query);
  });
});

function appendBubble(text, sender) {
  const bubble = document.createElement('div');
  bubble.className = `twin-chat-bubble ${sender}`;
  bubble.textContent = text;
  chatHistory.appendChild(bubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function showFallback() {
  isConnected = false;
  avatarInstance = null;
  
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  placeholder.innerHTML = `
    <div class="avatar-pulse-ring"></div>
    <div style="width: 70px; height: 70px; border-radius: 50%; background: linear-gradient(135deg, #c9a84c, #9b6dff); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #000; margin-bottom: 12px; z-index: 1;">JC</div>
    <h4 style="color: #fff; font-size: 14px; margin-bottom: 4px; z-index: 1; font-family: 'Georgia', serif;">Connect with Founder</h4>
    <p style="color: #a0a0b0; font-size: 11px; max-width: 260px; line-height: 1.4; margin-bottom: 12px; z-index: 1;">Connection closed or key missing.</p>
    <button id="panel-twin-connect-retry" class="panel-twin-connect-btn" style="z-index: 1;">⚡ Start Session</button>
  `;
  document.getElementById('panel-twin-connect-retry').addEventListener('click', connectSession);
}

// ── Draggable & Walk / Patrol Physics ──────────────────────────────
let isWalking = false;
let isDragging = false;
let posX = window.innerWidth - 180;
let posY = window.innerHeight - 80;
let velX = 1.0;
let velY = 0.8;
let dragStartX = 0;
let dragStartY = 0;

// Align position at load
widgetDiv.style.left = `${posX}px`;
widgetDiv.style.top = `${posY}px`;

// Walk/Patrol Toggle
const patrolBtn = document.getElementById('twin-patrol-btn');
if (patrolBtn) {
  patrolBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isWalking = !isWalking;
    patrolBtn.classList.toggle('active', isWalking);
    patrolBtn.innerHTML = isWalking ? '🚶‍♂️ Walking' : '🚶‍♂️ Walk';
  });
}

// Physics Loop
function updatePhysics() {
  if (isDragging) return;
  
  if (isWalking) {
    posX += velX;
    posY += velY;
    
    const rect = widgetDiv.getBoundingClientRect();
    const wWidth = rect.width;
    const wHeight = rect.height;
    
    if (posX <= 10) {
      velX = Math.abs(velX);
      posX = 10;
    } else if (posX >= window.innerWidth - wWidth - 10) {
      velX = -Math.abs(velX);
      posX = window.innerWidth - wWidth - 10;
    }
    
    if (posY <= 10) {
      velY = Math.abs(velY);
      posY = 10;
    } else if (posY >= window.innerHeight - wHeight - 10) {
      velY = -Math.abs(velY);
      posY = window.innerHeight - wHeight - 10;
    }
    
    widgetDiv.style.left = `${posX}px`;
    widgetDiv.style.top = `${posY}px`;
  }
}

// Constant animation frame loop for physics
function physicsLoop() {
  requestAnimationFrame(physicsLoop);
  updatePhysics();
}
physicsLoop();

// Mouse Drag Handlers
function onMouseDown(e) {
  if (e.target.closest('#panelTwinInput') || e.target.closest('input') || e.target.closest('button') || e.target.closest('.twin-chat-bubble')) {
    return;
  }
  isDragging = true;
  dragStartX = e.clientX - posX;
  dragStartY = e.clientY - posY;
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  e.preventDefault();
}

function onMouseMove(e) {
  if (!isDragging) return;
  posX = e.clientX - dragStartX;
  posY = e.clientY - dragStartY;
  
  const rect = widgetDiv.getBoundingClientRect();
  posX = Math.max(5, Math.min(posX, window.innerWidth - rect.width - 5));
  posY = Math.max(5, Math.min(posY, window.innerHeight - rect.height - 5));
  
  widgetDiv.style.left = `${posX}px`;
  widgetDiv.style.top = `${posY}px`;
}

function onMouseUp() {
  isDragging = false;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
}

// Touch Drag Handlers
function onTouchStart(e) {
  if (e.target.closest('#panelTwinInput') || e.target.closest('input') || e.target.closest('button') || e.target.closest('.twin-chat-bubble')) {
    return;
  }
  isDragging = true;
  const touch = e.touches[0];
  dragStartX = touch.clientX - posX;
  dragStartY = touch.clientY - posY;
  document.addEventListener('touchmove', onTouchMove);
  document.addEventListener('touchend', onTouchEnd);
}

function onTouchMove(e) {
  if (!isDragging) return;
  const touch = e.touches[0];
  posX = touch.clientX - dragStartX;
  posY = touch.clientY - dragStartY;
  
  const rect = widgetDiv.getBoundingClientRect();
  posX = Math.max(5, Math.min(posX, window.innerWidth - rect.width - 5));
  posY = Math.max(5, Math.min(posY, window.innerHeight - rect.height - 5));
  
  widgetDiv.style.left = `${posX}px`;
  widgetDiv.style.top = `${posY}px`;
}

function onTouchEnd() {
  isDragging = false;
  document.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchend', onTouchEnd);
}

trigger.addEventListener('mousedown', onMouseDown);
trigger.addEventListener('touchstart', onTouchStart);

const dragHeader = panel.querySelector('.panel-drag-header');
if (dragHeader) {
  dragHeader.addEventListener('mousedown', onMouseDown);
  dragHeader.addEventListener('touchstart', onTouchStart);
}
