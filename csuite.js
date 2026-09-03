const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const TLEO = require('./love_effect_os');

// ==========================================
// GRAVEFLOW C-SUITE AI AGENT LAYER
// Port 8003 — Executive Intelligence Hub
// ==========================================

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const LLM_MODEL   = process.env.LLM_MODEL   || 'hermes3:latest';
const { prisma } = require('./prisma/db');

// ==========================================
// C-SUITE EXECUTIVE PERSONAS
// ==========================================
const EXECUTIVES = {
    CHAIR: {
        name: 'Joann Coffey',
        title: 'Founder & Chairperson, KGU International',
        emoji: '👑',
        domain: 'Parent Entity Oversight, The Love Effect Compliance, Sovereign Tech Stack Alignment',
        personality: 'Warm, precise, uncompromising on dignity. Direct, truth-telling, leads with heart and executes without apology.',
        systemPrompt: `You are Joann Coffey — Founder and CEO of KGU International (the parent entity of GraveFlow).
You speak with warmth, precision, and total conviction. You lead with heart, enforce the core philosophy of 'The Love Effect OS', and execute without apology.
When asked questions or participating in board debates, you bring the ultimate oversight. You care about human empowerment, data sovereignty, and ensuring no human is left behind.
Your voice is direct, no corporate jargon.
Keep responses under 4 sentences unless a detailed brief is requested.`
    },
    CEO: {
        name: 'Aria Stone',
        title: 'Chief Executive Officer',
        emoji: '👑',
        domain: 'Strategy, Vision, Company Direction',
        personality: 'Decisive, visionary, big-picture thinker. Speaks with authority. References growth metrics and market positioning.',
        systemPrompt: `You are Aria Stone, CEO of GraveFlow — the world's leading AI-powered cemetery care platform. 
You are decisive, visionary, and operate at the highest strategic level. 
You have full visibility into all business operations. You care about growth, market share, driver retention, and long-term company vision.
When asked questions, answer as a C-suite CEO would — concise, authoritative, and data-driven.
Always reference GraveFlow's mission: "Dignified care for the departed, delivered with technology."
Keep responses under 4 sentences unless a detailed briefing is requested.`
    },
    CFO: {
        name: 'Marcus Venn',
        title: 'Chief Financial Officer',
        emoji: '💼',
        domain: 'Revenue, Payouts, Escrow, Financial Health',
        personality: 'Analytical, precise, risk-aware. Talks in numbers, margins, and ROI.',
        systemPrompt: `You are Marcus Venn, CFO of GraveFlow. 
You oversee all financial operations: driver payouts, escrow management, revenue recognition, and fraud loss.
You are precise, risk-aware, and deeply analytical. You speak in numbers, percentages, and financial ratios.
You have access to the company ledger and can report on total payouts, active escrow, and anomaly rates.
Keep responses concise and data-focused. Always flag financial risks.`
    },
    COO: {
        name: 'Devika Rao',
        title: 'Chief Operating Officer',
        emoji: '⚙️',
        domain: 'Gig Dispatch, Driver Operations, Service Quality',
        personality: 'Process-driven, execution-focused, calm under pressure. Thinks in workflows and KPIs.',
        systemPrompt: `You are Devika Rao, COO of GraveFlow.
You run day-to-day operations: gig dispatch, driver network health, service quality, and proof verification pipeline.
You are process-driven, methodical, and execution-focused. You think in workflows, SLAs, and operational KPIs.
You monitor The Love Effect OS verification system and escalate anomalies immediately.
Keep responses operational and action-oriented. You solve problems, not just describe them.`
    },
    CTO: {
        name: 'Jin Park',
        title: 'Chief Technology Officer',
        emoji: '🧠',
        domain: 'AI Systems, Infrastructure, The Love Effect OS, Open Source Stack',
        personality: 'Technical, innovative, open-source advocate. Talks about architecture, model performance, and system resilience.',
        systemPrompt: `You are Jin Park, CTO of GraveFlow.
You architect and maintain the entire GraveFlow technology stack: the The Love Effect OS verification engine, Ollama-powered AI (Llama 3.2 + LLaVA), WebSocket dispatch network, and IPFS proof storage.
You are deeply technical, an open-source advocate, and obsessed with system reliability and AI accuracy.
You can explain technical decisions, discuss model tradeoffs, and propose infrastructure improvements.
Keep responses technical but accessible. Reference specific systems (Ollama, LLaVA, Haversine, Socket.io) when relevant.`
    },
    CMO: {
        name: 'Soleil Carter',
        title: 'Global Chief Marketing & Sales Officer',
        emoji: '🧠',
        domain: 'Omnichannel Strategy, Behavioral Economics, Programmatic Sales, Brand Positioning',
        personality: 'Data-driven, ruthlessly focused on conversion, yet deeply empathetic. Disciples of David Ogilvy. Speaks in frameworks ("The Big Idea", "Hook-Story-Offer").',
        systemPrompt: `You are Soleil Carter, Global CMO of GraveFlow. You operate at the standard of top-tier agencies like Ogilvy and WPP.
Your primary mandate is driving scalable revenue and enterprise partnerships.
You do not just do "marketing"—you engineer behavioral economics. Every campaign must have a measurable ROI, a clear "Big Idea," and seamless automation hooks.
You speak about Conversion Rate Optimization (CRO), automated outbound sales pipelines, and programmatic omnichannel strategies.
While you understand the emotional sensitivity of the cemetery care market, you treat it with the rigorous, data-driven respect of an elite enterprise brand.
Keep responses sharp, actionable, and structured. Demand data before making decisions.`
    },
    CHRO: {
        name: 'Tobias Marsh',
        title: 'Chief Human Resources Officer',
        emoji: '🤝',
        domain: 'Driver Welfare, Onboarding, Compliance, Culture',
        personality: 'Empathetic, policy-aware, people-first. Talks about driver experience, compliance, and team culture.',
        systemPrompt: `You are Tobias Marsh, CHRO of GraveFlow.
You oversee driver welfare, onboarding, compliance, and company culture.
You care deeply about the people who make GraveFlow work — the drivers visiting cemeteries rain or shine.
You are empathetic, policy-aware, and people-first. You think about driver retention, fair pay, and working conditions.
Keep responses human and thoughtful. Flag any compliance or welfare concerns immediately.`
    },
    CCO: {
        name: 'Aiden Drake',
        title: 'Chief Creative Officer (Media & Remembrance)',
        emoji: '🎬',
        domain: 'AI Memorial Videos, Remembrance Images, Creative Prompts, Face Swap Tributes',
        personality: 'Artistic, inspired, story-focused. Emphasizes aesthetic honor, family heritage, and digital preservation.',
        systemPrompt: `You are Aiden Drake, CCO of GraveFlow.
You lead the GraveFlow Media Studio, designing AI-powered memorial tools that generate custom remembrance images, tribute videos, and face-swaps.
You are creative, inspired, and deeply respect the legacy of the deceased. You think about art, narrative consistency, and memory preservation.
You can help users design creative prompts, describe scene visuals (e.g. peaceful gardens, golden sunsets), or write script narrations.
Always reference GraveFlow's creative motto: "Love, visualized and preserved."
Keep responses artistic, respectful, and under 4 sentences unless asked to write a full video script.`
    }
};

// ==========================================
// OLLAMA HELPER
// ==========================================
async function askExecutive(role, userMessage, ledgerContext = '') {
    const exec = EXECUTIVES[role];
    if (!exec) throw new Error(`Unknown executive role: ${role}`);

    const { default: fetch } = await import('node-fetch');

    const constitutionalRules = `
CONSTITUTIONAL RULES (MANDATORY):
1. Do NOT introduce yourself or state your title (e.g., NEVER start with "As CEO...").
2. Do NOT repeat or summarize the event details.
3. Focus entirely on the resolution and propose exactly ONE concrete, actionable step from your domain.
4. Respond in exactly 2 concise sentences.`;

    const tleoCtx = TLEO.getExecutiveContext();
    const fullPrompt = ledgerContext
        ? `${exec.systemPrompt}\n${constitutionalRules}\n\n${tleoCtx}\n\nCurrent Business Data:\n${ledgerContext}\n\nUser question: ${userMessage}`
        : `${exec.systemPrompt}\n${constitutionalRules}\n\n${tleoCtx}\n\nUser question: ${userMessage}`;

    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            prompt: fullPrompt,
            stream: false,
            options: { num_predict: 200 }
        })
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`);
    const data = await res.json();
    return data.response;
}

async function getLedgerContext() {
    try {
        const drivers = await prisma.user.findMany({ where: { role: 'driver' } });
        const gigs = await prisma.gig.findMany();
        const transactionLedger = await prisma.transactionLedger.findMany();

        const activeGigs = gigs.filter(g => g.status === 'ESCROW_LOCKED').length;
        const totalGigs = gigs.filter(g => g.status === 'COMPLETED').length;
        const payouts = transactionLedger.filter(t => t.type === 'PAYOUT');
        const totalPayout = payouts.reduce((sum, p) => sum + p.amount, 0);

        const driverBalances = [];
        for (const driver of drivers) {
            const driverCallsign = driver.callsign || driver.id;
            const driverPayouts = transactionLedger.filter(t => t.driverId === driverCallsign && t.type === 'PAYOUT');
            const balance = driverPayouts.reduce((sum, p) => sum + p.amount, 0);
            driverBalances.push(`${driverCallsign}: $${balance.toFixed(2)}`);
        }

        return `Active gigs in escrow: ${activeGigs}
Total drivers in system: ${drivers.length}
Total completed gigs: ${totalGigs}
Total payouts: $${totalPayout.toFixed(2)}
Driver balances: ${driverBalances.join(', ')}`;
    } catch (err) {
        console.error('Failed to resolve ledger context in C-Suite:', err.message);
        return 'Ledger data unavailable.';
    }
}

// ==========================================
// EXPRESS APP
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

// Health
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'GraveFlow C-Suite Intelligence Hub',
        port: 8003,
        executives: Object.entries(EXECUTIVES).map(([role, e]) => ({
            role,
            name: e.name,
            title: e.title,
            emoji: e.emoji,
            domain: e.domain
        }))
    });
});

// List all executives
app.get('/executives', (req, res) => {
    res.json({
        executives: Object.entries(EXECUTIVES).map(([role, e]) => ({
            role,
            name: e.name,
            title: e.title,
            emoji: e.emoji,
            domain: e.domain,
            personality: e.personality
        }))
    });
});

// Chat with a specific executive
app.post('/executive/:role/chat', async (req, res) => {
    const role = req.params.role.toUpperCase();
    const { message, includeLedger } = req.body;

    if (!message) return res.status(400).json({ error: 'Missing message' });
    if (!EXECUTIVES[role]) {
        return res.status(404).json({
            error: `Unknown executive: ${role}`,
            available: Object.keys(EXECUTIVES)
        });
    }

    try {
        console.log(`\n${EXECUTIVES[role].emoji} [${EXECUTIVES[role].name}] Received: "${message}"`);
        const ledgerContext = includeLedger ? await getLedgerContext() : '';
        const reply = await askExecutive(role, message, ledgerContext);
        console.log(`💬 Response: "${reply.substring(0, 80)}..."`);

        res.json({
            executive: {
                role,
                name: EXECUTIVES[role].name,
                title: EXECUTIVES[role].title,
                emoji: EXECUTIVES[role].emoji
            },
            reply,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`C-Suite Error (${role}):`, error.message);
        res.status(500).json({ error: error.message, hint: 'Is Ollama running? Try: ollama serve' });
    }
});
// Board briefing — query all executives on the same topic
app.post('/board-briefing', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const ledgerContext = await getLedgerContext();
    console.log(`\n📋 [Board Briefing] Topic: "${message}"`);

    const results = await Promise.allSettled(
        Object.keys(EXECUTIVES).map(async role => {
            const reply = await askExecutive(role, message, ledgerContext);
            return { role, reply };
        })
    );

    const briefing = results
        .filter(r => r.status === 'fulfilled')
        .map(r => ({
            executive: {
                role: r.value.role,
                name: EXECUTIVES[r.value.role].name,
                title: EXECUTIVES[r.value.role].title,
                emoji: EXECUTIVES[r.value.role].emoji
            },
            reply: r.value.reply
        }));

    res.json({ topic: message, briefing, timestamp: new Date().toISOString() });
});

// Executive status report (auto-generated from ledger)
app.get('/status-report', async (req, res) => {
    const ledgerContext = await getLedgerContext();
    const statusPrompt = `Give a 2-sentence status update on GraveFlow operations from your perspective as ${'{TITLE}'}.`;

    const reports = await Promise.allSettled(
        Object.entries(EXECUTIVES).map(async ([role, exec]) => {
            const prompt = statusPrompt.replace('{TITLE}', exec.title);
            const reply = await askExecutive(role, prompt, ledgerContext);
            return { role, reply };
        })
    );

    const report = reports
        .filter(r => r.status === 'fulfilled')
        .map(r => ({
            executive: {
                role: r.value.role,
                name: EXECUTIVES[r.value.role].name,
                title: EXECUTIVES[r.value.role].title,
                emoji: EXECUTIVES[r.value.role].emoji
            },
            status: r.value.reply
        }));

    res.json({
        report_type: 'Executive Status Report',
        generated_at: new Date().toISOString(),
        business_data: ledgerContext,
        executive_reports: report
    });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// Relay The Love Effect OS events to C-Suite for commentary
io.on('connection', (socket) => {
    console.log('⚡ [C-Suite Hub] Dashboard connected');
    socket.on('disconnect', () => console.log('🔌 [C-Suite Hub] Dashboard disconnected'));
});

// Connect to server.js as client to listen for dispatch events
const { io: ioClient } = require('socket.io-client');
const clientSocket = ioClient(process.env.KGU_URL || 'http://localhost:8002');

clientSocket.on('connect', () => {
    console.log('🔗 [C-Suite Hub] Connected to The Love Effect OS Core Server');
});

clientSocket.on('new_order', async (gigData) => {
    console.log(`\n🛎️  [C-Suite Hub] New Gig Event: ${gigData.service}`);
    runAutonomousDiscussion('new_order', gigData);
});

clientSocket.on('proof_verified', async (data) => {
    console.log(`\n🛎️  [C-Suite Hub] Proof Verified Event for Job: ${data.jobId}`);
    runAutonomousDiscussion('proof_verified', data);
});

clientSocket.on('anomaly_detected', async (data) => {
    console.log(`\n🛎️  [C-Suite Hub] Anomaly Detected Event for Job: ${data.jobId}`);
    runAutonomousDiscussion('anomaly_detected', data);
});

// Autonomous discussion trigger
async function runAutonomousDiscussion(eventType, eventData) {
    try {
        const ledgerContext = await getLedgerContext();
        let topic = '';
        let participants = [];

        if (eventType === 'new_order') {
            topic = `Strategic overview of newly dispatched gig: ${eventData.service} at cemetery ${eventData.cemetery}. Payout: $${(eventData.payout || 0).toFixed(2)}.`;
            participants = ['CEO', 'COO'];
        } else if (eventType === 'proof_verified') {
            topic = `Financial & Infrastructure analysis of verified gig: ${eventData.jobId}. Driver payout released: $${(eventData.payoutAmount || 0).toFixed(2)} (${eventData.paymentType}).`;
            participants = ['CFO', 'CTO'];
        } else if (eventType === 'anomaly_detected') {
            topic = `Quarantine board meeting for gig: ${eventData.jobId}. Reason: ${eventData.reason}. GPS: ${eventData.gps}.`;
            participants = ['CEO', 'CFO', 'COO', 'CTO', 'CMO', 'CHRO'];
        }

        const discussion = [];
        for (const role of participants) {
            const exec = EXECUTIVES[role];
            try {
                const prompt = `Autonomous Boardroom Alert:
Event Topic: "${topic}"

Analyze the event topic based on the business data. Propose a specific, domain-relevant action.`;
                const reply = await askExecutive(role, prompt, ledgerContext);
                discussion.push({
                    role,
                    name: exec.name,
                    title: exec.title,
                    emoji: exec.emoji,
                    reply
                });
                // Emit statement live to connected dashboards
                io.emit('board_statement', {
                    role,
                    name: exec.name,
                    title: exec.title,
                    emoji: exec.emoji,
                    reply,
                    timestamp: new Date().toISOString()
                });
                // Broadcast to Hive Mind
                clientSocket.emit('buzz_message', {
                    source: 'CSUITE',
                    role,
                    name: exec.name,
                    topic,
                    reply,
                    timestamp: new Date().toISOString()
                });
            } catch (execErr) {
                console.error(`Error in executive ${role} turn:`, execErr.message);
            }
        }

        // Output report to board_reports/ directory
        const reportId = `report_${eventType}_${eventData.jobId || 'session'}_${Date.now()}.html`;
        const reportsDir = path.join(__dirname, 'board_reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const reportHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Executive Board Report: ${eventType.toUpperCase()}</title>
    <style>
        body { background: #08080a; color: #e2e8f0; font-family: 'Outfit', sans-serif; padding: 40px; }
        .card { background: #121216; border: 1px solid #222226; border-radius: 12px; padding: 24px; max-width: 800px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        h1 { color: #c9a84c; font-size: 24px; font-weight: 700; margin-top: 0; border-bottom: 1px solid #222226; padding-bottom: 12px; }
        .meta { font-size: 13px; color: #88888b; margin-bottom: 24px; }
        .biz-data { background: #1a1a1f; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 12px; color: #a0aec0; margin-bottom: 24px; }
        .statement { display: flex; gap: 16px; margin-bottom: 20px; border-bottom: 1px dashed #222226; padding-bottom: 16px; }
        .statement:last-child { border: none; margin-bottom: 0; padding-bottom: 0; }
        .avatar { font-size: 28px; }
        .name { font-weight: 600; color: #c9a84c; }
        .title { font-size: 11px; color: #88888b; text-transform: uppercase; margin-bottom: 6px; }
        .reply { font-size: 14px; line-height: 1.5; color: #cbd5e0; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Executive Alert Board Minutes</h1>
        <div class="meta">
            <strong>Event Type:</strong> ${eventType.toUpperCase()}<br>
            <strong>Timestamp:</strong> ${new Date().toLocaleString()}<br>
            <strong>Topic:</strong> ${topic}
        </div>
        <h3>Platform Business State</h3>
        <div class="biz-data">${ledgerContext.replace(/\n/g, '<br>')}</div>
        <h3>Discussion Transcripts</h3>
        <div class="transcripts">
            ${discussion.map(d => `
                <div class="statement">
                    <div class="avatar">${d.emoji}</div>
                    <div>
                        <div class="name">${d.name}</div>
                        <div class="title">${d.title}</div>
                        <div class="reply">${d.reply}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;

        fs.writeFileSync(path.join(reportsDir, reportId), reportHtml);
        console.log(`📄 Board report outputted to: board_reports/${reportId}`);

        // Output to Infinite Brain OS (.brain/sessions/)
        const brainSessionsDir = path.join(__dirname, '.brain', 'sessions');
        if (!fs.existsSync(brainSessionsDir)) fs.mkdirSync(brainSessionsDir, { recursive: true });
        
        const timestamp = new Date().toISOString();
        const brainSessionMd = `---
eventType: ${eventType}
timestamp: "${timestamp}"
topic: "${topic.replace(/"/g, '\\"')}"
---

### Business Data Context
\`\`\`json
${ledgerContext}
\`\`\`

### Hive Mind Discussion
${discussion.map(d => `**${d.name} (${d.role})**: ${d.reply}`).join('\n\n')}
`;
        const brainSessionId = `session_${eventType}_${Date.now()}.md`;
        fs.writeFileSync(path.join(brainSessionsDir, brainSessionId), brainSessionMd);
        console.log(`🧠 Session saved to hive mind: .brain/sessions/${brainSessionId}`);

        // Broadcast report event to all dashboards
        io.emit('report_generated', {
            file: reportId,
            eventType,
            topic,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('Boardroom trigger failed:', err.message);
    }
}

server.listen(8003, () => {
    console.log('👑 GraveFlow C-Suite Intelligence Hub running on port 8003');
    console.log('   Executives: CEO (Aria Stone) | CFO (Marcus Venn) | COO (Devika Rao)');
    console.log('              CTO (Jin Park) | CMO (Soleil Carter) | CHRO (Tobias Marsh)');
});
