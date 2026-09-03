// ============================================================
// THE LOVE EFFECT OS — v1.0
// ============================================================
// The base operating system of GraveFlow.
//
// "The Love Effect" is the measurable, traceable ripple that
// happens when a family honours a loved one across distance.
// Every gig is an act of love. Every verified proof is love
// made tangible. Every payout is love rewarded.
//
// This OS governs all AI, all verification, all escrow,
// all decisions — anchored to that single truth.
// ============================================================

const os = require('os');
const fs = require('fs');
const path = require('path');

const TLEO_VERSION = '1.0.0';
const TLEO_CODENAME = 'Everlasting';
const TLEO_ESTABLISHED = '2026';

// ── Core Philosophy ─────────────────────────────────────────
const PHILOSOPHY = {
  mission: 'To make love across distance visible, verified, and permanent.',
  promise: 'Every grave visited is an act of love. The Love Effect OS makes that love provable.',
  principles: [
    'Love is the unit of value — every gig measures it.',
    'Truth is enforced by AI, not promised by people.',
    'Open source means no one owns love — it belongs to the community.',
    'Every family deserves access, regardless of geography.',
    'The driver who shows up is a vessel of someone else\'s love.',
    'Dignity is non-negotiable — in life and in death.',
  ],
};

// ── OS Identity ──────────────────────────────────────────────
const IDENTITY = {
  name: 'The Love Effect OS',
  shortName: 'TLEO',
  version: TLEO_VERSION,
  codename: TLEO_CODENAME,
  established: TLEO_ESTABLISHED,
  platform: 'GraveFlow',
  kernel: 'Node.js / Ollama / LLaVA',
  architecture: 'Local-first · Open-source · AI-verified · Escrow-protected',
  motto: 'Love, verified.',
};

// ── Boot Message ─────────────────────────────────────────────
function bootMessage() {
  const lines = [
    '',
    '\x1b[35m\x1b[1m  ╔══════════════════════════════════════════════════════════════╗',
    '  ║                                                              ║',
    '  ║        ❤️  THE LOVE EFFECT OS  ·  v' + TLEO_VERSION + ' "' + TLEO_CODENAME + '"          ║',
    '  ║                                                              ║',
    '  ║        "Love, verified."                                     ║',
    '  ║        Powering GraveFlow — On-Demand Grave Care            ║',
    '  ║                                                              ║',
    '  ╚══════════════════════════════════════════════════════════════╝\x1b[0m',
    '',
    `\x1b[90m  Kernel:    ${IDENTITY.kernel}`,
    `  Arch:      ${IDENTITY.architecture}`,
    `  Node:      ${process.version} on ${os.platform()} ${os.arch()}`,
    `  Memory:    ${Math.round(os.freemem() / 1024 / 1024)}MB free / ${Math.round(os.totalmem() / 1024 / 1024)}MB total`,
    `  Booted:    ${new Date().toLocaleString()}\x1b[0m`,
    '',
  ];
  lines.forEach(l => console.log(l));
}

// ── The Love Effect Metric ────────────────────────────────────
// Calculates the "love score" of a completed gig — a composite
// of verification quality, service type, and rider intent.
function loveScore({ serviceType, verificationScore, riderNote, photoCount }) {
  const serviceWeights = {
    'Full Memorial Visit': 1.0,
    'Headstone Cleaning': 0.7,
    'Flower Placement': 0.8,
    'Debris Removal Only': 0.5,
    default: 0.6,
  };
  const base = serviceWeights[serviceType] || serviceWeights.default;
  const verification = Math.min((verificationScore || 0.8), 1.0);
  const noteBonus = riderNote && riderNote.length > 10 ? 0.1 : 0;
  const photoBonus = Math.min((photoCount || 1) * 0.05, 0.15);
  const score = Math.min((base * verification) + noteBonus + photoBonus, 1.0);
  return {
    score: parseFloat(score.toFixed(3)),
    label: score >= 0.9 ? 'Profound' : score >= 0.75 ? 'Deep' : score >= 0.6 ? 'Sincere' : 'Gentle',
    description: `A ${score >= 0.9 ? 'profound' : score >= 0.75 ? 'deep' : 'sincere'} act of love, verified by The Love Effect OS.`,
  };
}

// ── Core Values for AI Executive Prompts ─────────────────────
function getExecutiveContext() {
  return `
You operate under The Love Effect OS — the base layer of GraveFlow.
Core mission: "${PHILOSOPHY.mission}"
Core promise: "${PHILOSOPHY.promise}"
Guiding principles:
${PHILOSOPHY.principles.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}

Every decision you make must be rooted in this OS. Love is the metric.
Drivers are vessels of love. Riders are families in grief. The platform
exists to make love permanent and verifiable across distance and death.
All strategic decisions flow from this foundation.
`.trim();
}

// ── Health Object (for API /health endpoint) ──────────────────
function healthPayload(extra = {}) {
  return {
    status: 'ok',
    os: IDENTITY.name,
    os_version: IDENTITY.version,
    os_codename: IDENTITY.codename,
    motto: IDENTITY.motto,
    platform: IDENTITY.platform,
    architecture: IDENTITY.architecture,
    ...extra,
    timestamp: new Date().toISOString(),
  };
}

// ── Love Effect Event Logger ──────────────────────────────────
const loveLogPath = path.join(__dirname, 'love_effect_log.json');

function logLoveEffect({ gigId, driverId, riderId, serviceType, score, label }) {
  let log = [];
  try { log = JSON.parse(fs.readFileSync(loveLogPath)); } catch {}
  log.push({
    timestamp: new Date().toISOString(),
    gigId, driverId, riderId, serviceType,
    loveScore: score,
    loveLabel: label,
    os: IDENTITY.name,
    osVersion: IDENTITY.version,
  });
  fs.writeFileSync(loveLogPath, JSON.stringify(log, null, 2));
}

// ── OS Status Summary ─────────────────────────────────────────
function statusSummary() {
  let loveEvents = 0;
  try { loveEvents = JSON.parse(fs.readFileSync(loveLogPath)).length; } catch {}
  return {
    os: IDENTITY.name,
    version: IDENTITY.version,
    codename: IDENTITY.codename,
    motto: IDENTITY.motto,
    loveEventsLogged: loveEvents,
    uptimeSecs: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: os.platform(),
  };
}

module.exports = {
  IDENTITY,
  PHILOSOPHY,
  TLEO_VERSION,
  TLEO_CODENAME,
  bootMessage,
  loveScore,
  getExecutiveContext,
  healthPayload,
  logLoveEffect,
  statusSummary,
};
