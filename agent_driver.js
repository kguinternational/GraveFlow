'use strict';
require('dotenv').config();

// Generate a solid gray 200x200 JPEG as base64
// Minimal valid JPEG: gray fill via raw JPEG bytes
function generateGrayJpeg() {
    // This is a valid minimal 1x1 gray JPEG expanded conceptually to represent a gray image
    // We'll generate a simple base64 representation of a gray placeholder
    // Using a known-good minimal gray JPEG (8x8 pixels, gray)
    const GRAY_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    return GRAY_JPEG_BASE64;
}

const AGENT_ID = 'AGENT_DRIVER_001';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8002';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const LLM_MODEL = process.env.LLM_MODEL || 'llama3.2';

let socket;
let reconnectDelay = 2000;
const MAX_RECONNECT_DELAY = 30000;

async function ollamaChat(prompt) {
    try {
        const { default: fetch } = await import('node-fetch');
        const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: LLM_MODEL, prompt, stream: false, options: { num_predict: 60 } })
        });
        if (!res.ok) throw new Error(`Ollama ${res.status}`);
        const data = await res.json();
        return data.response.trim();
    } catch (e) {
        return `[LLM unavailable: ${e.message}]`;
    }
}

async function submitProof(gig) {
    const { default: fetch } = await import('node-fetch');
    const imageBase64 = generateGrayJpeg();
    const body = JSON.stringify({
        jobId: gig.id,
        gps: gig.gps,
        driverId: AGENT_ID,
        imageBase64
    });

    try {
        const res = await fetch(`${BACKEND_URL}/verify-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        const data = await res.json();
        if (data.status === 'verified') {
            console.log(`✅ [${AGENT_ID}] Proof VERIFIED by The Love Effect OS for job ${gig.id}`);
            // Ask Ollama for narration
            const narration = await ollamaChat(
                `In one sentence, narrate completing a cemetery care job at ${gig.cemetery || 'the cemetery'} for service: ${gig.service || 'grave care'}.`
            );
            console.log(`📖 [${AGENT_ID}] Narration: ${narration}`);
            
            // Broadcast to Hive Mind
            if (socket) {
                socket.emit('buzz_message', {
                    source: 'DRIVER',
                    role: 'Driver',
                    name: AGENT_ID,
                    topic: `Job Completed: ${gig.id}`,
                    reply: narration,
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            console.log(`⚠️  [${AGENT_ID}] Proof result for ${gig.id}: ${JSON.stringify(data)}`);
        }
    } catch (err) {
        console.error(`❌ [${AGENT_ID}] Submit proof error for ${gig.id}:`, err.message);
    }
}

function connectAgent() {
    const { io } = require('socket.io-client');
    console.log(`🤖 [${AGENT_ID}] Connecting to ${BACKEND_URL}...`);

    socket = io(BACKEND_URL, {
        reconnection: false,
        transports: ['websocket']
    });

    socket.on('connect', () => {
        reconnectDelay = 2000; // reset on success
        console.log(`✅ [${AGENT_ID}] Connected to GraveFlow running on The Love Effect OS (socket: ${socket.id})`);
    });

    socket.on('gig_available', async (gig) => {
        console.log(`\n🚗 [${AGENT_ID}] Gig received: ${gig.id} — ${gig.service} at ${gig.cemetery || 'cemetery'}`);
        // Simulate travel delay: 3-5 seconds
        const delay = 3000 + Math.floor(Math.random() * 2000);
        console.log(`⏱️  [${AGENT_ID}] Simulating travel (${(delay/1000).toFixed(1)}s)...`);
        await new Promise(r => setTimeout(r, delay));
        await submitProof(gig);
    });

    socket.on('proof_verified', (data) => {
        if (data.driverId === AGENT_ID) {
            console.log(`💰 [${AGENT_ID}] Payout received: $${data.payoutAmount} for job ${data.jobId}`);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`🔌 [${AGENT_ID}] Disconnected: ${reason}. Reconnecting in ${reconnectDelay/1000}s...`);
        setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
            connectAgent();
        }, reconnectDelay);
    });

    socket.on('connect_error', (err) => {
        console.error(`❌ [${AGENT_ID}] Connection error: ${err.message}. Retrying in ${reconnectDelay/1000}s...`);
        socket.close();
        setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
            connectAgent();
        }, reconnectDelay);
    });
}

console.log(`🤖 GraveFlow Autonomous Driver Agent — ${AGENT_ID}`);
console.log(`   Backend: ${BACKEND_URL}`);
console.log(`   AI: Ollama ${LLM_MODEL} @ ${OLLAMA_HOST}`);
console.log(`   Waiting for gigs...\n`);
connectAgent();
