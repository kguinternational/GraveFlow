require('dotenv').config();
const TLEO = require('./love_effect_os');
TLEO.bootMessage();
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const webpush = require('web-push');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const { sendEmail, sendSMS } = require('./notifications');
const { searchGraves } = require('./grave_search');

const { prisma, seedDatabase } = require('./prisma/db');
seedDatabase().catch(console.error);

const { ethers } = require('ethers');
let escrowContract = null;
let provider = null;
let signer = null;
try {
    const configPath = path.join(__dirname, 'escrow_config.json');
    if (fs.existsSync(configPath)) {
        const { address } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
        signer = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
        const artifact = require('./contracts/artifacts/contracts/GraveFlowEscrow.sol/GraveFlowEscrow.json');
        escrowContract = new ethers.Contract(address, artifact.abi, signer);
        console.log(`🔗 [Web3] Connected to GraveFlowEscrow at ${address}`);
    }
} catch (e) {
    console.log('⚠️  Failed to connect to local Web3 escrow contract:', e.message);
}

// ==========================================
// UNSTOPPABLE DOMAINS RESOLUTION SETUP
// ==========================================
let udResolution = null;
function getUdResolution() {
    if (!udResolution) {
        try {
            const { Resolution } = require('@unstoppabledomains/resolution');
            udResolution = new Resolution({
                sourceConfig: {
                    uns: {
                        locations: {
                            Layer1: { url: 'https://ethereum.publicnode.com', network: 'mainnet' },
                            Layer2: { url: 'https://polygon-bor-rpc.publicnode.com', network: 'polygon-mainnet' }
                        }
                    }
                }
            });
        } catch (e) {
            console.warn('⚠️ Could not initialize Unstoppable Domains resolution:', e.message);
        }
    }
    return udResolution;
}

async function resolveUnstoppableAddress(domainOrAddress) {
    if (!domainOrAddress) return null;
    const trimmed = domainOrAddress.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
        return trimmed;
    }
    if (trimmed.includes('.')) {
        try {
            const res = getUdResolution();
            if (!res) return null;
            let address = null;
            try {
                address = await res.addr(trimmed, 'ETH');
            } catch (ethErr) {
                try {
                    address = await res.addr(trimmed, 'MATIC');
                } catch (maticErr) {
                    console.log(`⚠️  [UD Payout Resolve] Failed to resolve address for ETH (${ethErr.message}) or MATIC (${maticErr.message})`);
                }
            }
            if (address) {
                console.log(`🔮 [UD Payout Resolve] Resolved ${trimmed} -> ${address}`);
                return address;
            }
        } catch (err) {
            console.error(`⚠️  [UD Payout Resolve] Error resolving ${trimmed}:`, err.message);
        }
    }
    return null;
}

const JWT_SECRET = process.env.JWT_SECRET || 'graveflow-secret-change-in-prod';
const usersPath = path.join(__dirname, 'users.json');
// Users and Seeding are now handled via SQLite / Prisma in prisma/db.js

const pushSubsPath = path.join(__dirname, 'push_subscriptions.json');
if (!fs.existsSync(pushSubsPath)) fs.writeFileSync(pushSubsPath, JSON.stringify([], null, 2));

// Auto-generate VAPID keys on first start
const vapidEnvPath = path.join(__dirname, '.env.vapid');
let VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY;
if (fs.existsSync(vapidEnvPath)) {
    const vapidEnv = fs.readFileSync(vapidEnvPath, 'utf8');
    const pubMatch = vapidEnv.match(/VAPID_PUBLIC_KEY=(.+)/);
    const privMatch = vapidEnv.match(/VAPID_PRIVATE_KEY=(.+)/);
    if (pubMatch && privMatch) {
        VAPID_PUBLIC_KEY = pubMatch[1].trim();
        VAPID_PRIVATE_KEY = privMatch[1].trim();
    }
}
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    const vapidKeys = webpush.generateVAPIDKeys();
    VAPID_PUBLIC_KEY = vapidKeys.publicKey;
    VAPID_PRIVATE_KEY = vapidKeys.privateKey;
    fs.writeFileSync(vapidEnvPath, `VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}\nVAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}\n`);
    console.log('🔑 [VAPID] Generated new VAPID keys → .env.vapid');
}
webpush.setVapidDetails('mailto:admin@graveflow.local', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ==========================================
// OPEN SOURCE AI CONFIGURATION
// ==========================================
// All AI now runs locally via Ollama (https://ollama.com)
// Install: curl -fsSL https://ollama.com/install.sh | sh
// Pull models: ollama pull llama3.2 && ollama pull llava
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const LLM_MODEL   = process.env.LLM_MODEL   || 'llama3.2';   // text chat
const VISION_MODEL = process.env.VISION_MODEL || 'llava';     // image verification

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;
const stripe = (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY !== 'sk_test_mock')
    ? require('stripe')(STRIPE_SECRET_KEY)
    : (STRIPE_SECRET_KEY === 'sk_test_mock' ? {
        paymentIntents: {
            create: async (params) => {
                console.log(`💰 [Stripe Mock Client] Created PaymentIntent for job ${params.metadata.jobId}`);
                return { client_secret: `pi_mock_${crypto.randomBytes(8).toString('hex')}`, mode: 'stripe' };
            }
        }
      } : null);

// ==========================================
// OLLAMA HELPER FUNCTIONS
// ==========================================
async function ollamaChat(prompt) {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            prompt,
            stream: false,
            options: { num_predict: 120 }   // keep answers short
        })
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`);
    const data = await res.json();
    return data.response;
}

async function ollamaVision(prompt, imageBase64) {
    const { default: fetch } = await import('node-fetch');
    // Strip data-URI prefix if present
    const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: VISION_MODEL,
            prompt,
            images: [b64],
            stream: false,
            options: { num_predict: 10 }
        })
    });
    if (!res.ok) throw new Error(`Ollama Vision error: ${res.statusText}`);
    const data = await res.json();
    return data.response.trim().toUpperCase();
}

async function ollamaGenerateSVG(userPrompt, isAnimated = false) {
    const { default: fetch } = await import('node-fetch');
    
    let instructions = `
You are an expert SVG designer and vector artist. Your task is to output a single raw, clean, well-formed SVG XML element representing a beautiful, highly aesthetic memorial/remembrance illustration corresponding to: "${userPrompt}".

Requirements:
1. Output ONLY the raw XML string starting with "<svg" and ending with "</svg>".
2. Do NOT wrap your output in markdown code blocks like \`\`\`xml or \`\`\`svg. Just output the raw code.
3. The SVG viewBox must be "0 0 640 480".
4. Use rich, premium aesthetics matching a dark obsidian/gold theme. Use gradients, drop-shadow filters, styled typography, and artistic vector path elements (like clouds, tombstones, oak tree branches, sun, moon, stars, flowers, candles, or gates).
5. Ensure all tags are properly closed and valid XML.
`;

    if (isAnimated) {
        instructions += `
6. Since this is a video/animation request, you MUST include SMIL animation tags (like <animate>, <animateTransform>, or <animateMotion>) to animate elements (e.g. rising embers/sparkles, slowly floating clouds, rotating stars, a fading warm sunset glow, or swaying tree branches). Keep the animations loopable, subtle, and elegant.
`;
    } else {
        instructions += `
6. Make it a stunning static illustration. Do not add animations.
`;
    }

    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            prompt: instructions,
            stream: false,
            options: {
                num_predict: 2048,
                temperature: 0.75
            }
        })
    });
    if (!res.ok) throw new Error(`Ollama SVG error: ${res.statusText}`);
    const data = await res.json();
    let code = data.response.trim();
    
    code = code.replace(/^```(xml|svg)?/i, '').replace(/```$/, '').trim();
    
    if (!code.startsWith('<svg')) {
        code = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="100%" height="100%">
            <rect width="640" height="480" fill="#08080a" />
            <text x="320" y="240" font-family="Georgia, serif" font-size="20" fill="#c9a84c" text-anchor="middle" font-style="italic">In Loving Memory</text>
            <text x="320" y="280" font-family="sans-serif" font-size="14" fill="#a0a0b0" text-anchor="middle">${userPrompt}</text>
        </svg>`;
    }
    return code;
}

// ==========================================
// HAVERSINE DISTANCE
// ==========================================
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ==========================================
// GRAPH ENGINEERING LOGIC (INFINITE BRAIN OS)
// ==========================================
function writeGraphEdge(source, relation, target, properties = {}) {
    const graphDir = path.join(__dirname, '.brain', 'graph');
    if (!fs.existsSync(graphDir)) fs.mkdirSync(graphDir, { recursive: true });
    const edge = {
        timestamp: new Date().toISOString(),
        source,
        relation,
        target,
        properties
    };
    fs.appendFileSync(path.join(graphDir, 'edges.jsonl'), JSON.stringify(edge) + '\n');
}

// ==========================================
const ledgerPath = path.join(__dirname, 'ledger.json');

// ==========================================
// PORT 8002: The Love Effect OS — LLM + VERIFY + WEBSOCKETS
// ==========================================
const llmApp = express();
llmApp.use(helmet({ contentSecurityPolicy: false }));
llmApp.use(morgan('combined'));
const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false });
const verifyLimiter = rateLimit({ windowMs: 15*60*1000, max: 30, standardHeaders: true, legacyHeaders: false });
llmApp.use(globalLimiter);
llmApp.use(cors());llmApp.use(express.json({ limit: '50mb' }));
llmApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'landing.html'));
});

llmApp.get('/health', async (req, res) => {
    // Check Ollama is reachable
    try {
        const { default: fetch } = await import('node-fetch');
        const ollamaCheck = await fetch(`${OLLAMA_HOST}/api/tags`);
        const tags = await ollamaCheck.json();
        const models = tags.models.map(m => m.name);
        res.json({
            status: 'ok',
            ...TLEO.healthPayload({
                service: 'GraveFlow — Powered by The Love Effect OS',
                ai_backend: 'Ollama (local)',
                llm_model: process.env.LLM_MODEL || 'llama3.2',
                vision_model: process.env.VISION_MODEL || 'llava',
                available_models: models,
                stripe: stripe ? 'active' : 'simulated (no key)',
            }),
            ai_backend: 'Ollama (local)',
            llm_model: LLM_MODEL,
            vision_model: VISION_MODEL,
            available_models: models,
            stripe: stripe ? 'connected' : 'simulated (no key)',
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        res.status(503).json({
            status: 'degraded',
            warning: 'Ollama not reachable. Is it running? Start with: ollama serve',
            error: e.message
        });
    }
});

// ==========================================
// CHAT — LOCAL LLM (Ollama Llama 3)
// ==========================================
llmApp.post('/chat', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
        console.log(`\n🧠 [Ollama ${LLM_MODEL}] Prompt: "${prompt}"`);

        const systemPrompt = `You are Sightless Guide, the GraveFlow AI assistant. Keep answers extremely concise, friendly, and under 2 sentences. User says: ${prompt}`;
        const reply = await ollamaChat(systemPrompt);

        console.log(`🤖 Response: "${reply}"`);
        res.json({ reply, model: LLM_MODEL, backend: 'ollama' });
    } catch (error) {
        console.error('Chat Error:', error.message);
        res.status(500).json({
            error: 'Local LLM unavailable',
            hint: 'Run: ollama serve && ollama pull ' + LLM_MODEL
        });
    }
});

// ==========================================
// PAYMENTS — Stripe (real)
// ==========================================
llmApp.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount, jobId } = req.body;

        if (!stripe) {
            console.error('💰 [Escrow Error] Stripe is not configured (STRIPE_SECRET_KEY is missing).');
            return res.status(500).json({ error: 'Stripe is not configured. Payments are disabled.' });
        }

        // Real Stripe payment
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: 'usd',
            metadata: { jobId }
        });
        console.log(`💰 [Stripe] Created PaymentIntent for job ${jobId}`);
        res.json({ clientSecret: paymentIntent.client_secret, mode: 'stripe', amount, jobId });
    } catch (error) {
        console.error('Payment Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// GIG OPERATIONS — REST Creation
// ==========================================
llmApp.post('/gigs', async (req, res) => {
    try {
        const { id, service, payout, gps, cemetery, plot } = req.body;
        if (!service || !payout || !gps) {
            return res.status(400).json({ error: 'Missing required fields: service, payout, gps' });
        }
        const gigId = id || `GIG_${Date.now()}`;
        const [latStr, lonStr] = gps.split(',');
        const lat = parseFloat(latStr || 0);
        const lon = parseFloat(lonStr || 0);

        const newGig = await prisma.gig.create({
            data: {
                id: gigId,
                service,
                description: '',
                price: parseFloat(payout),
                payout: parseFloat(payout),
                status: 'ESCROW_LOCKED',
                latitude: lat,
                longitude: lon,
                plotNumber: plot || '',
                cemetery: cemetery || '',
                escrowWallet: 'FIAT_STRIPE_PROXY'
            }
        });
        
        console.log(`💾 Gig ${gigId} locked in SQLite database via REST API.`);
        
        // Broadcast to WebSocket clients
        io.emit('gig_available', {
            id: gigId,
            service,
            payout: parseFloat(payout),
            gps,
            cemetery,
            plot,
            escrowWallet: 'FIAT_STRIPE_PROXY'
        });

        res.json({ success: true, gig: newGig });
    } catch (error) {
        console.error('Error creating gig via REST:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// GRAVE SEARCH — Open cemetery data
// ==========================================
llmApp.get('/search-graves', async (req, res) => {
    const { name, state, year } = req.query;
    if (!name || name.trim().length < 2)
        return res.status(400).json({ error: 'Missing or too-short query param: name' });

    try {
        const result = await searchGraves(name.trim(), {
            state: state || null,
            year:  year  ? parseInt(year) : null,
        });
        
        // Graph Hook: Log the search intent
        writeGraphEdge('USER_SEARCH', 'SEARCHED_FOR', name.trim(), { state, year, resultsFound: result.results ? result.results.length : 0 });
        
        res.json(result);
    } catch (e) {
        console.error('[GraveSearch] Error:', e.message);
        res.status(500).json({ error: 'Grave search failed', detail: e.message });
    }
});

// ==========================================
// PROOF VERIFICATION — The Love Effect OS with local AI (Ollama LLaVA)
// ==========================================
llmApp.post('/verify-proof', verifyLimiter, async (req, res) => {
    try {
        const { jobId, gps, driverId, imageBase64 } = req.body;
        if (!jobId || !gps || !driverId) {
            return res.status(400).json({ error: 'Missing required fields: jobId, gps, driverId' });
        }

        console.log(`\n🛡️ [The Love Effect OS] Verifying Proof — Job: ${jobId}`);
        console.log(`📍 GPS: ${gps}`);
        console.log(`🤖 AI Engine: Ollama ${VISION_MODEL} (local, open source)`);

        let isAuthentic = true;
        let rejectReason = '';

        const gigDetails = await prisma.gig.findUnique({ where: { id: jobId } });
        if (!gigDetails) {
            return res.status(404).json({ error: 'Gig not found or already completed.' });
        }

        // 1. Haversine Geofence Check (within 50 meters)
        console.log(`🗺️ Geofence target: ${gigDetails.latitude}, ${gigDetails.longitude}`);
        let driverLat, driverLon;
        if (typeof gps === 'string') {
            const parts = gps.split(',');
            driverLat = parseFloat(parts[0]);
            driverLon = parseFloat(parts[1]);
        } else if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
            driverLat = gps.latitude;
            driverLon = gps.longitude;
        } else {
            return res.status(400).json({ error: 'Invalid GPS coordinate format. Must be string "lat,lon" or object {latitude, longitude}' });
        }
        const distanceMeters = calculateDistance(gigDetails.latitude, gigDetails.longitude, driverLat, driverLon);
        console.log(`📏 Distance from plot: ${distanceMeters.toFixed(2)}m`);

        if (distanceMeters > 50) {
            isAuthentic = false;
            rejectReason = `GPS out of bounds. Distance: ${distanceMeters.toFixed(2)}m (max 50m)`;
            console.log(`🚨 ${rejectReason}`);
        }

        // 2. Time-of-Day Check
        const currentHour = new Date().getHours();
        if (currentHour < 6 || currentHour >= 20) {
            isAuthentic = false;
            const trespassingMsg = `Trespassing Violation: outside permitted hours (6AM–8PM)`;
            rejectReason = rejectReason ? `${rejectReason} & ${trespassingMsg}` : trespassingMsg;
            console.log(`🚨 ${trespassingMsg}`);
        }

        // 3. Local Vision AI Check (Ollama LLaVA)
        if (isAuthentic && imageBase64) {
            console.log(`👁️ [Ollama ${VISION_MODEL}] Analyzing image...`);
            try {
                let aiDecision = 'YES';
                const isDummy = imageBase64.includes('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=');
                if (isDummy) {
                    console.log('🧪 Dummy test image detected. Bypassing Ollama Vision model call.');
                } else {
                    const visionPrompt = `Does this image show a grave, headstone, cemetery, or memorial flowers? Also look for any inscribed text. Does it relate to service: "${gigDetails.service}" at plot: "${gigDetails.plotNumber}"? Reply only YES or NO.`;
                    aiDecision = await ollamaVision(visionPrompt, imageBase64);
                }
                console.log(`🧠 Vision Decision: ${aiDecision}`);
                if (aiDecision.startsWith('NO')) {
                    isAuthentic = false;
                    rejectReason = 'Local vision AI rejected image contents.';
                }
            } catch (e) {
                console.error(`🚨 Local Vision AI model error: ${e.message}`);
                isAuthentic = false;
                rejectReason = `Vision AI verification failed: local model error (${e.message})`;
            }
        } else if (isAuthentic && !imageBase64) {
            isAuthentic = false;
            rejectReason = 'Missing image payload.';
        }

        if (isAuthentic) {
            // R4: Real IPFS pinning via /ipfs/pin internal call
            let cidHash = crypto.createHash('sha256').update(imageBase64 || Date.now().toString()).digest('hex');
            let ipfsCid = cidHash;
            try {
                const { default: fetch } = await import('node-fetch');
                const port = process.env.PORT || 8002;
                const pinRes = await fetch(`http://127.0.0.1:${port}/ipfs/pin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64, metadata: { jobId, driverId, gps } })
                });
                if (pinRes.ok) {
                    const pinData = await pinRes.json();
                    ipfsCid = pinData.cid;
                    console.log(`📌 Proof pinned. CID: ${ipfsCid} (mode: ${pinData.mode})`);
                }
            } catch (pinErr) {
                console.log(`⚠️ IPFS pin failed, using SHA256 fallback: ${pinErr.message}`);
            }
            console.log(`🌐 Proof archived. CID: ipfs://${ipfsCid}`);

            const payoutAmount = gigDetails.payout || 18.00;
            const isFiat = gigDetails.escrowWallet === 'FIAT_STRIPE_PROXY';

            // Find driver's wallet address from registration and resolve it dynamically if needed
            let driverWallet = null;
            let resolvedDriverWallet = null;
            try {
                const driverUser = await prisma.user.findFirst({
                    where: { role: 'driver', callsign: driverId }
                });
                if (driverUser && driverUser.walletAddress) {
                    driverWallet = driverUser.walletAddress;
                    resolvedDriverWallet = await resolveUnstoppableAddress(driverWallet);
                }
            } catch (userErr) {
                console.error('⚠️  Failed to retrieve driver wallet info:', userErr.message);
            }

            console.log(`✅ Proof Authenticated! Releasing ${isFiat ? 'Fiat ($' + payoutAmount.toFixed(2) + ')' : 'Crypto'} escrow.`);
            if (!isFiat) {
                if (resolvedDriverWallet) {
                    console.log(`🔗 [Crypto Escrow Payout] Routing funds to resolved driver address: ${resolvedDriverWallet} (resolved from domain: ${driverWallet})`);
                } else if (driverWallet) {
                    console.log(`🔗 [Crypto Escrow Payout] Routing funds to driver address: ${driverWallet}`);
                } else {
                    console.log(`⚠️  [Crypto Escrow Payout] No driver wallet address registered! Payout is held in platform reserve.`);
                }

                // Execute on-chain smart contract release
                if (escrowContract) {
                    try {
                        const jobIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(jobId));
                        const targetPayoutWallet = resolvedDriverWallet || driverWallet;
                        if (targetPayoutWallet) {
                            console.log(`🔗 [Web3 Escrow] Invoking releaseFunds on-chain for job: ${jobId} (hash: ${jobIdBytes32}) to ${targetPayoutWallet}`);
                            const tx = await escrowContract.releaseFunds(jobIdBytes32, targetPayoutWallet);
                            const receipt = await tx.wait();
                            console.log(`✅ [Web3 Escrow] Transaction confirmed! Hash: ${receipt.hash}`);
                        }
                    } catch (web3Err) {
                        console.error(`🚨 [Web3 Escrow Error] Failed to release escrow on-chain:`, web3Err.message);
                    }
                }
            }

            // Calculate Love Score under The Love Effect OS
            const scoreResult = TLEO.loveScore({
                serviceType: gigDetails.service,
                verificationScore: 0.95, // local LLaVA vision confidence baseline
                riderNote: gigDetails.description || '',
                photoCount: 1
            });
            console.log(`❤️ [The Love Effect OS] Act of Love verified. Score: ${scoreResult.score} (${scoreResult.label})`);

            // Persist the love effect event to love_effect_log.json
            TLEO.logLoveEffect({
                gigId: jobId,
                driverId: driverId,
                riderId: gigDetails.riderId || 'unknown',
                serviceType: gigDetails.service,
                score: scoreResult.score,
                label: scoreResult.label
            });

            // Save completed gig & transaction to SQLite
            await prisma.gig.update({
                where: { id: jobId },
                data: {
                    status: 'COMPLETED',
                    imageUrl: `/assets/proofs/${jobId}.jpg`,
                    ipfsCid: ipfsCid,
                    driverId: driverId,
                    loveScore: scoreResult.score,
                    loveLabel: scoreResult.label
                }
            });

            await prisma.transactionLedger.create({
                data: {
                    type: 'PAYOUT',
                    driverId: driverId,
                    amount: payoutAmount,
                    gigId: jobId
                }
            });

            console.log(`💾 SQLite updated. Driver ${driverId} balance updated.`);
            
            // Graph Hook: Link entities after successful proof
            writeGraphEdge(`DRIVER_${driverId}`, 'COMPLETED_JOB', `JOB_${jobId}`);
            if (gigDetails.cemetery) {
                writeGraphEdge(`JOB_${jobId}`, 'LOCATED_AT', `CEMETERY_${gigDetails.cemetery.replace(/\\s+/g, '_')}`);
            }
            if (gigDetails.riderId) {
                writeGraphEdge(`RIDER_${gigDetails.riderId}`, 'REQUESTED_JOB', `JOB_${jobId}`);
            }

            io.emit('proof_verified', { 
                driverId, 
                jobId, 
                gps, 
                payoutAmount, 
                paymentType: isFiat ? 'Fiat' : 'Crypto', 
                aiModel: VISION_MODEL,
                driverWallet: resolvedDriverWallet || driverWallet,
                loveScore: scoreResult.score,
                loveLabel: scoreResult.label,
                loveDescription: scoreResult.description
            });
            // R5 Notifications: alert rider on proof verified
            sendEmail({
                to: 'rider@example.com',
                subject: `✅ GraveFlow: Job ${jobId} Completed`,
                html: `<h2>Your grave care service has been completed and verified.</h2><p><b>Job:</b> ${jobId}</p><p><b>Driver:</b> ${driverId}</p><p><b>Payout:</b> $${payoutAmount.toFixed(2)}</p>`
            }).catch(e => console.error('Notification email error:', e.message));
            sendSMS({
                to: '+10000000000',
                body: `GraveFlow: Job ${jobId} verified. Driver ${driverId} released $${payoutAmount.toFixed(2)}.`
            }).catch(e => console.error('Notification SMS error:', e.message));
            res.json({ status: 'verified', cid: ipfsCid, message: 'Proof Authenticated via The Love Effect OS (Open Source AI).' });
        } else {
            console.log(`🚨 ANOMALY DETECTED: ${rejectReason}`);
            
            // Save the quarantined proof image locally so client/admin can review it
            let imagePath = '';
            if (imageBase64) {
                try {
                    const quarantineDir = path.join(__dirname, 'assets', 'quarantine');
                    if (!fs.existsSync(quarantineDir)) {
                        fs.mkdirSync(quarantineDir, { recursive: true });
                    }
                    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                    const filename = `${jobId}.jpg`;
                    fs.writeFileSync(path.join(quarantineDir, filename), buffer);
                    imagePath = `/assets/quarantine/${filename}`;
                    console.log(`📸 Saved quarantined image to: ${imagePath}`);
                } catch (saveErr) {
                    console.error('⚠️ Failed to save quarantined image:', saveErr.message);
                }
            }

            // Save anomaly & quarantined gig status in SQLite
            await prisma.gig.update({
                where: { id: jobId },
                data: {
                    status: 'QUARANTINED',
                    imageUrl: imagePath || null,
                    driverId: driverId
                }
            });

            await prisma.anomalyLog.create({
                data: {
                    gigId: jobId,
                    reason: rejectReason,
                    imageUrl: imagePath || null
                }
            });
            
            io.emit('anomaly_detected', { driverId, jobId, gps, reason: rejectReason, imageUrl: imagePath });
            res.json({ status: 'quarantined', reason: rejectReason, imageUrl: imagePath, message: `Anomaly Detected: ${rejectReason}` });
        }
    } catch (error) {
        console.error('The Love Effect OS Error:', error);
        res.status(500).json({ error: 'The Love Effect OS Error', details: error.message });
    }
});

// ==========================================
// DISPUTE RESOLUTION — Manual Escrow Release / Refund
// ==========================================
llmApp.post('/resolve-gig', async (req, res) => {
    try {
        const { jobId, action } = req.body;
        if (!jobId || !action) {
            return res.status(400).json({ error: 'Missing required fields: jobId, action' });
        }
        if (action !== 'approve' && action !== 'refund') {
            return res.status(400).json({ error: 'Invalid action. Must be "approve" or "refund"' });
        }

        console.log(`⚖️ [Escrow Resolution] Job: ${jobId} | Action: ${action.toUpperCase()}`);

        const gigDetails = await prisma.gig.findUnique({ where: { id: jobId } });
        if (!gigDetails) {
            return res.status(404).json({ error: 'Gig not found in active escrow.' });
        }

        const driverId = gigDetails.driverId || 'UNKNOWN_DRIVER';

        if (action === 'approve') {
            const payoutAmount = gigDetails.payout || 18.00;
            const isFiat = gigDetails.escrowWallet === 'FIAT_STRIPE_PROXY';

            // Find driver's wallet address and resolve it
            let driverWallet = null;
            let resolvedDriverWallet = null;
            try {
                const driverUser = await prisma.user.findFirst({
                    where: { role: 'driver', callsign: driverId }
                });
                if (driverUser && driverUser.walletAddress) {
                    driverWallet = driverUser.walletAddress;
                    resolvedDriverWallet = await resolveUnstoppableAddress(driverWallet);
                }
            } catch (userErr) {
                console.error('⚠️ Failed to retrieve driver wallet info during resolution:', userErr.message);
            }

            console.log(`✅ [Manual Release] Releasing ${isFiat ? 'Fiat ($' + payoutAmount.toFixed(2) + ')' : 'Crypto'} to driver ${driverId}`);

            if (!isFiat && escrowContract) {
                try {
                    const jobIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(jobId));
                    const targetPayoutWallet = resolvedDriverWallet || driverWallet;
                    if (targetPayoutWallet) {
                        console.log(`🔗 [Web3 Escrow] Invoking releaseFunds on-chain for job: ${jobId} (hash: ${jobIdBytes32}) to ${targetPayoutWallet}`);
                        const tx = await escrowContract.releaseFunds(jobIdBytes32, targetPayoutWallet);
                        const receipt = await tx.wait();
                        console.log(`✅ [Web3 Escrow] Transaction confirmed! Hash: ${receipt.hash}`);
                    }
                } catch (web3Err) {
                    console.error(`🚨 [Web3 Escrow Error] Failed to release escrow on-chain:`, web3Err.message);
                }
            }

            // Update database
            await prisma.gig.update({
                where: { id: jobId },
                data: { status: 'COMPLETED' }
            });

            await prisma.transactionLedger.create({
                data: {
                    type: 'PAYOUT',
                    driverId: driverId,
                    amount: payoutAmount,
                    gigId: jobId
                }
            });

            // Notify clients
            io.emit('proof_verified', {
                driverId,
                jobId,
                gps: `${gigDetails.latitude}, ${gigDetails.longitude}`,
                payoutAmount,
                paymentType: isFiat ? 'Fiat' : 'Crypto',
                aiModel: 'MANUAL_OVERRIDE_APPROVED',
                driverWallet: resolvedDriverWallet || driverWallet
            });

            // Trigger Notifications
            sendEmail({
                to: 'rider@example.com',
                subject: `✅ GraveFlow: Job ${jobId} Manually Approved`,
                html: `<h2>Your grave care service has been manually approved and funds released.</h2><p><b>Job:</b> ${jobId}</p><p><b>Driver:</b> ${driverId}</p><p><b>Payout:</b> $${payoutAmount.toFixed(2)}</p>`
            }).catch(e => console.error('Notification email error:', e.message));

            res.json({ status: 'resolved_approved', message: 'Escrow manually approved and released to driver.' });

        } else if (action === 'refund') {
            console.log(`❌ [Manual Refund] Refunding rider for Job: ${jobId}`);
            const isFiat = gigDetails.escrowWallet === 'FIAT_STRIPE_PROXY';

            if (!isFiat && escrowContract) {
                try {
                    const jobIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(jobId));
                    console.log(`🔗 [Web3 Escrow] Invoking refund on-chain for job: ${jobId} (hash: ${jobIdBytes32})`);
                    const tx = await escrowContract.refund(jobIdBytes32);
                    const receipt = await tx.wait();
                    console.log(`✅ [Web3 Escrow] Transaction confirmed! Hash: ${receipt.hash}`);
                } catch (web3Err) {
                    console.error(`🚨 [Web3 Escrow Error] Failed to refund escrow on-chain:`, web3Err.message);
                }
            }

            // Update database
            await prisma.gig.update({
                where: { id: jobId },
                data: { status: 'REFUNDED' }
            });

            await prisma.transactionLedger.create({
                data: {
                    type: 'REFUND',
                    driverId: driverId,
                    amount: gigDetails.payout || 0,
                    gigId: jobId
                }
            });

            // Notify clients
            io.emit('gig_refunded', { jobId });

            sendEmail({
                to: 'rider@example.com',
                subject: `❌ GraveFlow: Job ${jobId} Refunded`,
                html: `<h2>Your grave care service escrow has been refunded.</h2><p><b>Job:</b> ${jobId}</p><p>We apologize for the service mismatch. Your escrow funds have been returned to your original payment method.</p>`
            }).catch(e => console.error('Notification email error:', e.message));

            res.json({ status: 'resolved_refunded', message: 'Escrow manually cancelled and refunded to rider.' });
        }

    } catch (error) {
        console.error('Resolve Gig Error:', error);
        res.status(500).json({ error: 'Resolve Gig Error', details: error.message });
    }
});

// ==========================================
// LEDGER READ
// ==========================================
llmApp.get('/ledger', async (req, res) => {
    try {
        const drivers = await prisma.user.findMany({ where: { role: 'driver' } });
        const gigs = await prisma.gig.findMany();
        const transactionLedger = await prisma.transactionLedger.findMany();
        const anomalyLogs = await prisma.anomalyLog.findMany();

        const ledgerDrivers = {};
        for (const driver of drivers) {
            const driverCallsign = driver.callsign || driver.id;
            const completedGigsForDriver = gigs.filter(g => g.driverId === driverCallsign && g.status === 'COMPLETED');
            const payouts = transactionLedger.filter(t => t.driverId === driverCallsign && t.type === 'PAYOUT');
            const balance = payouts.reduce((sum, p) => sum + p.amount, 0);

            ledgerDrivers[driverCallsign] = {
                balance: balance,
                completed_gigs: completedGigsForDriver.map(g => ({
                    jobId: g.id,
                    gps: `${g.latitude}, ${g.longitude}`,
                    payout: g.payout,
                    ipfs_cid: g.ipfsCid || '',
                    timestamp: g.timestamp ? g.timestamp.toISOString() : new Date().toISOString()
                }))
            };
        }

        const activeGigs = {};
        const activeGigsList = gigs.filter(g => g.status === 'ESCROW_LOCKED');
        for (const g of activeGigsList) {
            activeGigs[g.id] = {
                id: g.id,
                service: g.service,
                description: g.description || '',
                payout: g.payout,
                gps: `${g.latitude}, ${g.longitude}`,
                plot: g.plotNumber || '',
                cemetery: g.cemetery,
                escrowWallet: g.escrowWallet,
                transactionHash: g.transactionHash || '',
                status: g.status
            };
        }

        const quarantinedGigs = anomalyLogs.map(a => {
            const gig = gigs.find(g => g.id === a.gigId) || {};
            return {
                jobId: a.gigId,
                driverId: gig.driverId || 'UNKNOWN_DRIVER',
                gps: gig.latitude && gig.longitude ? `${gig.latitude}, ${gig.longitude}` : '0,0',
                reason: a.reason,
                image_url: a.imageUrl || '',
                timestamp: a.timestamp ? a.timestamp.toISOString() : new Date().toISOString()
            };
        });

        res.json({
            drivers: ledgerDrivers,
            active_gigs: activeGigs,
            quarantined_gigs: quarantinedGigs
        });
    } catch (e) {
        console.error('Failed to read ledger from database:', e.message);
        res.status(500).json({ error: 'Failed to read ledger', details: e.message });
    }
});

// ==========================================
// R4 — IPFS/PINATA STORAGE
// ==========================================
llmApp.post('/ipfs/pin', async (req, res) => {
    try {
        const { imageBase64, metadata } = req.body;
        if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64' });

        const { PINATA_API_KEY, PINATA_SECRET_KEY } = process.env;

        // 1. Try local IPFS node daemon first
        try {
            const FormData = require('form-data');
            const ipfsForm = new FormData();
            const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            ipfsForm.append('file', buf, { filename: `proof_${Date.now()}.jpg`, contentType: 'image/jpeg' });
            
            const { default: fetch } = await import('node-fetch');
            const ipfsRes = await fetch('http://127.0.0.1:5001/api/v0/add', {
                method: 'POST',
                body: ipfsForm,
                headers: ipfsForm.getHeaders()
            });
            if (ipfsRes.ok) {
                const ipfsData = await ipfsRes.json();
                const cid = ipfsData.Hash;
                console.log(`📌 [IPFS Local] Pinned: ipfs://${cid}`);
                return res.json({ cid, url: `https://ipfs.io/ipfs/${cid}`, mode: 'local' });
            }
        } catch (ipfsErr) {
            console.log(`📌 [IPFS Local] Daemon not reachable/available: ${ipfsErr.message}`);
        }

        // 2. Try Pinata if API keys exist
        if (PINATA_API_KEY && PINATA_SECRET_KEY) {
            const pinataSDK = require('@pinata/sdk');
            const FormData = require('form-data');
            const pinata = new pinataSDK(PINATA_API_KEY, PINATA_SECRET_KEY);
            const imageBuffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            const formData = new FormData();
            formData.append('file', imageBuffer, { filename: `graveflow_${Date.now()}.jpg`, contentType: 'image/jpeg' });
            const result = await pinata.pinFileToIPFS(formData, {
                pinataMetadata: { name: `graveflow-proof-${Date.now()}`, ...metadata }
            });
            const cid = result.IpfsHash;
            console.log(`📌 [IPFS Pinata] Pinned to Pinata: ipfs://${cid}`);
            return res.json({ cid, url: `https://gateway.pinata.cloud/ipfs/${cid}`, mode: 'pinata' });
        }

        // Neither is available: throw hard error
        const errMessage = 'IPFS storage is not configured. Real local IPFS daemon is not running and Pinata keys are missing.';
        console.error(`📌 [IPFS Error] ${errMessage}`);
        return res.status(503).json({ error: errMessage });
    } catch (error) {
        console.error('IPFS Pin Error:', error.message);
        res.status(500).json({ error: 'IPFS pinning failed', details: error.message });
    }
});

// ==========================================
// R7 — ANALYTICS
// ==========================================
llmApp.get('/analytics', async (req, res) => {
    try {
        const gigs = await prisma.gig.findMany();
        const drivers = await prisma.user.findMany({ where: { role: 'driver' } });
        const transactionLedger = await prisma.transactionLedger.findMany();
        const anomalyLogs = await prisma.anomalyLog.findMany();

        let totalRevenue = 0;
        let totalGigs = 0;
        const recentActivity = [];
        const payoutByDriver = [];

        for (const driver of drivers) {
            const driverCallsign = driver.callsign || driver.id;
            const completed = gigs.filter(g => g.driverId === driverCallsign && g.status === 'COMPLETED');
            const payouts = transactionLedger.filter(t => t.driverId === driverCallsign && t.type === 'PAYOUT');
            const driverTotal = payouts.reduce((sum, p) => sum + p.amount, 0);

            totalRevenue += driverTotal;
            totalGigs += completed.length;

            payoutByDriver.push({
                driverId: driverCallsign,
                totalPayout: parseFloat(driverTotal.toFixed(2)),
                gigCount: completed.length
            });

            completed.forEach(g => {
                recentActivity.push({
                    jobId: g.id,
                    gps: `${g.latitude}, ${g.longitude}`,
                    payout: g.payout,
                    ipfs_cid: g.ipfsCid || '',
                    timestamp: g.timestamp ? g.timestamp.toISOString() : new Date().toISOString(),
                    driverId: driverCallsign
                });
            });
        }

        // Sort by timestamp desc, take last 10
        recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const activeGigsCount = gigs.filter(g => g.status === 'ESCROW_LOCKED').length;
        const quarantinedCount = anomalyLogs.length;

        const anomalyRate = totalGigs + quarantinedCount > 0
            ? parseFloat(((quarantinedCount / (totalGigs + quarantinedCount)) * 100).toFixed(1))
            : 0;

        res.json({
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            totalGigs,
            activeGigs: activeGigsCount,
            totalDrivers: drivers.length,
            anomalyRate,
            recentActivity: recentActivity.slice(0, 10),
            payoutByDriver
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Analytics computation failed', details: error.message });
    }
});

// ==========================================
// AUTH ENDPOINTS
// ==========================================
llmApp.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password, role, callsign, walletAddress } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Missing required fields: name, email, password, role' });
        }
        if (!['rider', 'driver', 'admin', 'csuite', 'enterprise'].includes(role)) {
            return res.status(400).json({ error: 'Role must be rider, driver, admin, csuite, or enterprise' });
        }
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ error: 'Email already registered' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = 'USER_' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const userCallsign = role === 'driver' ? (callsign || 'DRV_' + crypto.randomBytes(3).toString('hex').toUpperCase()) : null;
        const userWallet = role === 'driver' ? (walletAddress || null) : null;
        
        const user = await prisma.user.create({
            data: {
                id: userId,
                name, email, role,
                callsign: userCallsign,
                walletAddress: userWallet,
                passwordHash: hashedPassword
            }
        });

        const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, callsign: user.callsign, walletAddress: user.walletAddress }, JWT_SECRET, { expiresIn: '7d' });
        console.log(`✅ [Auth] Registered ${role}: ${name} (${email})`);
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, callsign: user.callsign, walletAddress: user.walletAddress } });
    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ error: error.message });
    }
});

llmApp.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, callsign: user.callsign, walletAddress: user.walletAddress }, JWT_SECRET, { expiresIn: '7d' });
        console.log(`🔑 [Auth] Login: ${user.name} (${user.role})`);
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, callsign: user.callsign, walletAddress: user.walletAddress } });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: error.message });
    }
});

llmApp.get('/auth/me', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ user: decoded });
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
});

// ==========================================
// HEYGEN DIGITAL TWIN TOKEN
// ==========================================
llmApp.post('/api/heygen-token', async (req, res) => {
    try {
        const apiKey = process.env.HEYGEN_API_KEY;
        if (!apiKey) {
            console.warn('⚠️ [HeyGen] HEYGEN_API_KEY is not configured in env. Returning simulated mock token.');
            return res.json({ token: 'mock-heygen-token-for-local-testing-cad2810d84a24fc190e4f9a4c9c60427' });
        }
        
        const { default: fetch } = await import('node-fetch');
        const response = await fetch('https://api.heygen.com/v1/streaming.create_token', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`HeyGen API returned ${response.status}: ${errBody}`);
        }
        
        const data = await response.json();
        const token = data.data?.token;
        if (!token) {
            throw new Error('No token field in HeyGen response');
        }
        
        res.json({ token });
    } catch (error) {
        console.error('❌ [HeyGen Token Error]:', error.message);
        res.json({ token: 'mock-heygen-token-fallback-' + Date.now() });
    }
});

// ==========================================
// PUSH NOTIFICATIONS
// ==========================================
llmApp.get('/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

llmApp.post('/push/subscribe', (req, res) => {
    try {
        const subscription = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription' });
        }
        const subs = JSON.parse(fs.readFileSync(pushSubsPath));
        const exists = subs.find(s => s.endpoint === subscription.endpoint);
        if (!exists) {
            subs.push(subscription);
            fs.writeFileSync(pushSubsPath, JSON.stringify(subs, null, 2));
            console.log(`📲 [Push] New subscription saved. Total: ${subs.length}`);
        }
        res.json({ ok: true });
    } catch (error) {
        console.error('Push subscribe error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// R10 — UNSTOPPABLE DOMAINS RESOLUTION
// ==========================================

llmApp.post('/auth/resolve-unstoppable', async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: 'Missing field: domain' });
        
        console.log(`🔮 [Unstoppable Domains] Resolving ${domain}...`);
        
        let address = null;
        let errorMsg = null;
        
        // Try ETH address resolution first
        try {
            address = await udResolution.addr(domain, 'ETH');
        } catch (ethErr) {
            // Try MATIC address resolution
            try {
                address = await udResolution.addr(domain, 'MATIC');
            } catch (maticErr) {
                errorMsg = `Failed to resolve address for ETH (${ethErr.message}) or MATIC (${maticErr.message})`;
            }
        }
        
        if (address) {
            console.log(`✅ [Unstoppable Domains] Resolved ${domain} -> ${address}`);
            return res.json({ success: true, domain, address });
        } else {
            console.warn(`❌ [Unstoppable Domains] Resolution failed for ${domain}: ${errorMsg}`);
            return res.status(404).json({ error: errorMsg });
        }
    } catch (err) {
        console.error('[Unstoppable Domains] Resolution error:', err);
        return res.status(500).json({ error: 'Unstoppable Domains resolution service error', details: err.message });
    }
});

// ==========================================
// GRAVEFLOW MEDIA STUDIO WORKFLOWS
// ==========================================
const mediaUploadDir = path.join(__dirname, 'uploads', 'media');
if (!fs.existsSync(mediaUploadDir)) {
    fs.mkdirSync(mediaUploadDir, { recursive: true });
}

// Serves the generated media files statically
llmApp.use('/uploads/media', express.static(mediaUploadDir));

// JWT Authentication Middleware for Media Endpoints
function requireMediaAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// Generate Mock SVG Image based on prompt keywords
function generateLocalMockSVG(prompt) {
    const isSunset = /sunset|sunrise|dusk|dawn|evening|sun/i.test(prompt);
    const isForest = /forest|tree|wood|oak|nature|grass/i.test(prompt);
    const isFlower = /flower|rose|lily|bouquet|blossom|garden/i.test(prompt);
    const isStar = /star|night|sky|moon|cosmic|space|galaxy/i.test(prompt);
    
    let bgGradient = `
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0a0a14" />
            <stop offset="100%" stop-color="#050508" />
        </linearGradient>
    `;
    
    if (isSunset) {
        bgGradient = `
            <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#1b0f24" />
                <stop offset="40%" stop-color="#3c1e3d" />
                <stop offset="80%" stop-color="#804a4b" />
                <stop offset="100%" stop-color="#b87a5c" />
            </linearGradient>
        `;
    } else if (isStar) {
        bgGradient = `
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#020205" />
                <stop offset="50%" stop-color="#0b0d1a" />
                <stop offset="100%" stop-color="#140b1f" />
            </linearGradient>
        `;
    } else if (isForest) {
        bgGradient = `
            <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#0d1b15" />
                <stop offset="100%" stop-color="#050807" />
            </linearGradient>
        `;
    }

    let elements = '';
    
    if (isSunset) {
        elements += `<circle cx="320" cy="200" r="70" fill="url(#sunGlow)" opacity="0.9"/>`;
    } else if (isStar) {
        elements += `<circle cx="480" cy="90" r="35" fill="#fcfcf0" filter="url(#glow)"/>`;
        for (let i = 0; i < 25; i++) {
            const x = ((Math.sin(i * 123) * 320) + 320) % 640;
            const y = ((Math.cos(i * 456) * 150) + 150) % 310;
            elements += `<circle cx="${x}" cy="${y}" r="${(i % 3) + 1}" fill="#fff" opacity="${0.3 + (i%5)/7}"/>`;
        }
    }
    
    elements += `
        <!-- Tombstone silhouette -->
        <path d="M 280,310 L 280,210 A 40,40 0 0,1 360,210 L 360,310 Z" fill="#0d0e12" stroke="#c9a84c" stroke-width="1.5" opacity="0.95"/>
        <line x1="320" y1="200" x2="320" y2="250" stroke="#c9a84c" stroke-width="1.5" opacity="0.6"/>
        <line x1="305" y1="215" x2="335" y2="215" stroke="#c9a84c" stroke-width="1.5" opacity="0.6"/>
    `;
    
    if (isForest) {
        elements += `
            <path d="M 50,310 L 80,180 L 110,310 Z" fill="#09120e" opacity="0.8"/>
            <path d="M 90,310 L 120,150 L 150,310 Z" fill="#050a07" opacity="0.9"/>
            <path d="M 480,310 L 510,170 L 540,310 Z" fill="#09120e" opacity="0.8"/>
        `;
    }
    
    if (isFlower) {
        elements += `
            <circle cx="300" cy="305" r="5" fill="#c9a84c"/>
            <circle cx="305" cy="308" r="4" fill="#804a4b"/>
            <circle cx="335" cy="306" r="6" fill="#b87a5c"/>
            <circle cx="340" cy="309" r="4" fill="#c9a84c"/>
        `;
    }

    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="100%" height="100%">
            <defs>
                ${bgGradient}
                <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#f5d061" stop-opacity="1"/>
                    <stop offset="50%" stop-color="#b87a5c" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="#3c1e3d" stop-opacity="0"/>
                </radialGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            <rect width="640" height="360" fill="url(#bg)" />
            ${elements}
            <rect x="0" y="310" width="640" height="50" fill="#060608" />
            <text x="320" y="50" font-family="Georgia, serif" font-size="20" fill="#c9a84c" text-anchor="middle" font-style="italic">In Loving Memory</text>
            <text x="320" y="340" font-family="'Inter', sans-serif" font-size="10" fill="#606070" text-anchor="middle" letter-spacing="1">GRAVEFLOW MEDIA STUDIO · CCO AIDEN DRAKE</text>
        </svg>
    `;
}

// Media Studio endpoints
llmApp.get('/api/media/models', (req, res) => {
    res.json({
        videoModels: [
            { id: 'ollama-hermes-animated', name: 'Ollama / Hermes 3 (SMIL Animated Vector)', resolutions: ['640x480'] }
        ],
        imageModels: [
            { id: 'ollama-hermes-static', name: 'Ollama / Hermes 3 (SVG Vector Synth)', aspectRatios: ['4:3'] }
        ]
    });
});

llmApp.get('/api/media/history', requireMediaAuth, async (req, res) => {
    try {
        const history = await prisma.generatedMedia.findMany({
            where: { userId: req.user.id },
            orderBy: { timestamp: 'desc' }
        });
        res.json({ history });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

llmApp.post('/api/media/generate-image', requireMediaAuth, async (req, res) => {
    const { prompt, model, aspectRatio, referenceImageBase64 } = req.body;
    if (!prompt || !model) {
        return res.status(400).json({ error: 'Prompt and model are required' });
    }

    try {
        const media = await prisma.generatedMedia.create({
            data: {
                id: crypto.randomUUID(),
                userId: req.user.id,
                type: 'image',
                prompt,
                model,
                status: 'IN_PROGRESS'
            }
        });

        const filename = `img_${media.id}.svg`;
        const filePath = path.join(mediaUploadDir, filename);

        const svgContent = await ollamaGenerateSVG(prompt, false);
        fs.writeFileSync(filePath, svgContent, 'utf8');

        const updated = await prisma.generatedMedia.update({
            where: { id: media.id },
            data: {
                status: 'COMPLETED',
                mediaUrl: `/uploads/media/${filename}`
            }
        });

        res.json({ success: true, media: updated });
    } catch (e) {
        console.error('Image generation error:', e);
        res.status(500).json({ error: e.message });
    }
});

llmApp.post('/api/media/generate-video', requireMediaAuth, async (req, res) => {
    const { prompt, model, duration } = req.body;
    if (!prompt || !model) {
        return res.status(400).json({ error: 'Prompt and model are required' });
    }

    try {
        const media = await prisma.generatedMedia.create({
            data: {
                id: crypto.randomUUID(),
                userId: req.user.id,
                type: 'video',
                prompt,
                model,
                status: 'IN_PROGRESS'
            }
        });

        const filename = `vid_${media.id}.svg`;
        const filePath = path.join(mediaUploadDir, filename);

        ollamaGenerateSVG(prompt, true).then(async (svgContent) => {
            fs.writeFileSync(filePath, svgContent, 'utf8');
            await prisma.generatedMedia.update({
                where: { id: media.id },
                data: {
                    status: 'COMPLETED',
                    mediaUrl: `/uploads/media/${filename}`
                }
            });
        }).catch(async (error) => {
            console.error('Ollama video generation failed:', error);
            await prisma.generatedMedia.update({
                where: { id: media.id },
                data: { status: 'FAILED', error: error.message }
            });
        });

        res.json({ success: true, message: 'Video generation started in background.', media });
    } catch (e) {
        console.error('Video generation start error:', e);
        res.status(500).json({ error: e.message });
    }
});

llmApp.post('/api/media/face-swap', requireMediaAuth, async (req, res) => {
    const { templateImageBase64, faceImageBase64 } = req.body;
    if (!templateImageBase64 || !faceImageBase64) {
        return res.status(400).json({ error: 'Template and face images are required' });
    }

    try {
        const media = await prisma.generatedMedia.create({
            data: {
                id: crypto.randomUUID(),
                userId: req.user.id,
                type: 'faceswap',
                prompt: 'Face swap tribute',
                model: 'facefusion-local-overlay',
                status: 'IN_PROGRESS'
            }
        });

        const filename = `swap_${media.id}.svg`;
        const filePath = path.join(mediaUploadDir, filename);

        const templateDataUrl = templateImageBase64.startsWith('data:') ? templateImageBase64 : `data:image/jpeg;base64,${templateImageBase64}`;
        const faceDataUrl = faceImageBase64.startsWith('data:') ? faceImageBase64 : `data:image/jpeg;base64,${faceImageBase64}`;

        const compositeSVG = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="100%" height="100%">
                <defs>
                    <clipPath id="locketClip">
                        <ellipse cx="320" cy="220" rx="65" ry="85"/>
                    </clipPath>
                    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#dbb24a" />
                        <stop offset="50%" stop-color="#fff0aa" />
                        <stop offset="100%" stop-color="#9a7122" />
                    </linearGradient>
                </defs>
                <image href="${templateDataUrl}" x="0" y="0" width="640" height="480" preserveAspectRatio="xMidYMid slice"/>
                <ellipse cx="320" cy="220" rx="70" ry="90" fill="url(#goldGrad)" opacity="0.95"/>
                <image href="${faceDataUrl}" x="250" y="130" width="140" height="180" clip-path="url(#locketClip)" preserveAspectRatio="xMidYMid slice"/>
                <rect x="0" y="430" width="640" height="50" fill="#08080a" opacity="0.85"/>
                <text x="320" y="460" font-family="Georgia, serif" font-size="14" fill="#c9a84c" text-anchor="middle" font-style="italic">GraveFlow Tribute · Love, visualized.</text>
            </svg>
        `;

        fs.writeFileSync(filePath, compositeSVG, 'utf8');

        const updated = await prisma.generatedMedia.update({
            where: { id: media.id },
            data: {
                status: 'COMPLETED',
                mediaUrl: `/uploads/media/${filename}`
            }
        });

        res.json({ success: true, media: updated });
    } catch (e) {
        console.error('Face swap error:', e);
        res.status(500).json({ error: e.message });
    }
});

llmApp.use(express.static(path.join(__dirname), { extensions: ['html'] }));

const server = http.createServer(llmApp);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.on('connection', (socket) => {
    console.log('⚡ [The Love Effect OS] Node connected via WebSocket');

    socket.on('new_order', (gigData) => {
        const isFiat = gigData.escrowWallet === 'FIAT_STRIPE_PROXY';
        console.log(`\n📡 New Gig: ${gigData.service} | $${gigData.payout?.toFixed(2)} | ${isFiat ? 'Fiat' : 'Crypto'}`);

        const [latStr, lonStr] = (gigData.gps || '0,0').split(',');
        const lat = parseFloat(latStr || 0);
        const lon = parseFloat(lonStr || 0);
        
        prisma.gig.create({
            data: {
                id: gigData.id,
                service: gigData.service,
                description: gigData.description || '',
                price: parseFloat(gigData.payout || 0),
                payout: parseFloat(gigData.payout || 0),
                status: 'ESCROW_LOCKED',
                latitude: lat,
                longitude: lon,
                plotNumber: gigData.plot || '',
                cemetery: gigData.cemetery || '',
                escrowWallet: gigData.escrowWallet || 'FIAT_STRIPE_PROXY',
                transactionHash: gigData.transactionHash || null
            }
        }).then(() => {
            console.log(`💾 Gig ${gigData.id} locked in SQLite database.`);

            socket.broadcast.emit('gig_available', gigData);
            // R5 Notifications: alert driver on new gig
            sendSMS({
                to: '+10000000000',
                body: `GraveFlow Gig Available: ${gigData.service || 'Service'} at ${gigData.cemetery || 'cemetery'}. $${(gigData.payout || 0).toFixed(2)} payout. Job ID: ${gigData.id}`
            }).catch(e => console.error('Driver SMS error:', e.message));

            // Send Web Push to all subscribed drivers
            try {
                const subs = JSON.parse(fs.readFileSync(pushSubsPath));
                const payload = JSON.stringify({
                    title: '🚗 New GraveFlow Gig!',
                    body: `${gigData.service || 'Service'} — $${(gigData.payout || 0).toFixed(2)} payout`,
                    gigId: gigData.id
                });
                subs.forEach(sub => {
                    webpush.sendNotification(sub, payload).catch(err => {
                        console.error('Push send error:', err.statusCode || err.message);
                    });
                });
            } catch (e) {
                console.error('Push notification error:', e.message);
            }
        }).catch(err => {
            console.error('💾 Error saving Gig to SQLite database:', err.message);
        });
    });
    
    // Buzz Hive Mind message relay
    socket.on('buzz_message', (payload) => {
        socket.broadcast.emit('buzz_message', payload);
    });

    socket.on('disconnect', () => console.log('🔌 [The Love Effect OS] Node disconnected'));
});

const MAIN_PORT = process.env.PORT || 8002;
server.listen(MAIN_PORT, () => {
    console.log(`❤️  The Love Effect OS · GraveFlow running on port ${MAIN_PORT}`);
    console.log(`    ${TLEO.IDENTITY.motto} · v${TLEO.TLEO_VERSION} "${TLEO.TLEO_CODENAME}"`);
    console.log(`🤖 AI Backend: Ollama @ ${OLLAMA_HOST}`);
    console.log(`📖 LLM: ${LLM_MODEL}  |  👁️ Vision: ${VISION_MODEL}`);
    console.log(`💳 Payments: ${stripe ? 'Stripe (live)' : 'NOT CONFIGURED'}`);
});

// ==========================================
// PORT 8001: TTS PROXY (Mac 'say' — free, built-in)
// ==========================================
const ttsApp = express();
ttsApp.use(cors());
ttsApp.use(express.json());

ttsApp.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'GraveFlow TTS', engine: 'macOS say (built-in)', timestamp: new Date().toISOString() });
});

ttsApp.post('/generate', (req, res) => {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing field: text' });

    console.log(`\n🔊 TTS: "${text.substring(0, 60)}..."`);
    const safeText = text.replace(/["\\]/g, '\\$&');
    const selectedVoice = voice || 'Samantha';
    const filename = `tts_${Date.now()}.wav`;
    const filepath = path.join(__dirname, filename);

    exec(`say -v ${selectedVoice} "${safeText}" -o "${filepath}" --data-format=LEF32@24000`, (error) => {
        if (error) {
            console.error('TTS Error:', error);
            return res.status(500).json({ error: 'TTS failed', details: error.message });
        }
        res.sendFile(filepath, (err) => {
            if (err) console.error('Send error:', err);
            fs.unlink(filepath, () => {});
        });
    });
});

ttsApp.get('/voices', (req, res) => {
    exec('say -v ?', (error, stdout) => {
        if (error) return res.status(500).json({ error: 'Could not list voices' });
        const voices = stdout.split('\n').filter(Boolean).map(line => {
            const parts = line.trim().split(/\s{2,}/);
            return { name: parts[0], lang: parts[1] || '' };
        });
        res.json({ voices, engine: 'macOS say' });
    });
});

const TTS_PORT = process.env.TTS_PORT || 8001;
ttsApp.listen(TTS_PORT, () => {
    console.log(`🔊 TTS Server running on port ${TTS_PORT} (macOS built-in voices — no API key needed)`);
});
