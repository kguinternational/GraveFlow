# GraveFlow Security Documentation

## Overview

GraveFlow implements multiple layers of production security to protect grave-service workers, clients, and the platform from abuse, fraud, and unauthorized access.

---

## 1. KGU OS Verification Pipeline

The **KGU OS (Knowledge Guardian Unit Operating System)** is GraveFlow's multi-factor proof-of-service verification engine. Every `POST /verify-proof` request passes through three sequential checks:

### 1a. GPS Geofence Check (Haversine Distance)

- The system computes the Haversine distance between the driver's submitted GPS coordinates and the registered grave plot coordinates stored in the ledger.
- **Maximum allowed distance:** 15 meters from the plot.
- If the driver is more than 15m away, the request is rejected with status `403` and reason `GPS out of bounds`.
- The Haversine formula accounts for Earth's curvature for sub-meter accuracy at cemetery scales.

### 1b. Time-of-Day Check

- GraveFlow enforces **permitted operating hours: 6:00 AM – 8:00 PM local time**.
- Proof submissions outside these hours are rejected as a `Trespassing Violation`.
- This prevents night-time fraud and protects cemetery grounds.

### 1c. Ollama Vision AI (LLaVA) Image Analysis

- If an image is submitted with the proof, GraveFlow forwards it to a **locally-running Ollama LLaVA model** for zero-cost, privacy-preserving AI analysis.
- The vision model is prompted to confirm the image shows a grave, headstone, cemetery, or memorial flowers relevant to the booked service.
- If the model replies `NO`, the proof is rejected.
- If Ollama is unavailable, a heuristic fallback (90% accept rate) is used with a warning logged.
- **No image data leaves the local machine** — all AI inference runs on-device.

### Verification Result

- **Authenticated:** IPFS content-addressed hash (SHA-256 of image) is logged; escrow is released; ledger updated; WebSocket event emitted.
- **Rejected:** Driver flagged as anomaly; event emitted to admin dashboard; HTTP 403 returned.

---

## 2. Rate Limiting

GraveFlow uses `express-rate-limit` to protect against brute-force, DDoS, and credential stuffing attacks.

| Endpoint | Limit | Window |
|---|---|---|
| `POST /verify-proof` | **30 requests** | per 15 minutes per IP |
| All other routes | **100 requests** | per 15 minutes per IP |

- Rate limit headers follow the **RateLimit standard** (`standardHeaders: true`).
- Legacy `X-RateLimit-*` headers are disabled (`legacyHeaders: false`).
- Limits are applied per IP address at the HTTP layer.

### Configuration (server.js)

```js
const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false });
const verifyLimiter = rateLimit({ windowMs: 15*60*1000, max: 30, standardHeaders: true, legacyHeaders: false });
llmApp.use(globalLimiter);
llmApp.post('/verify-proof', verifyLimiter, async (req, res) => { ... });
```

---

## 3. JWT Authentication

GraveFlow uses **JSON Web Tokens (JWT)** for stateless, secure authentication.

- **Token lifetime:** 7 days (`expiresIn: '7d'`)
- **Algorithm:** HS256 (HMAC-SHA256)
- **Secret:** Set via `JWT_SECRET` environment variable (defaults to a dev placeholder — **must be changed in production**)
- **Password hashing:** `bcryptjs` with 10 salt rounds
- **Token payload:** `{ id, name, email, role, callsign }`

### Endpoints

| Endpoint | Description |
|---|---|
| `POST /auth/register` | Create account (rider or driver), returns JWT |
| `POST /auth/login` | Authenticate and receive JWT |
| `GET /auth/me` | Verify token, return decoded user |

### Best Practices

- Store JWT in `localStorage` (client) or `HttpOnly` cookie for production.
- Rotate `JWT_SECRET` periodically and revoke tokens by changing the secret.
- Never log the full JWT token.

---

## 4. VAPID Keys (Web Push Security)

GraveFlow uses **Web Push with VAPID** (Voluntary Application Server Identification) for secure push notifications to drivers.

- VAPID keys are **automatically generated on first startup** if not already present.
- Keys are persisted to `.env.vapid` in the project root.
- The VAPID public key is served via `GET /push/vapid-public-key` for client subscription.
- Notifications are signed with the private key, preventing notification spoofing.

### Key Rotation

To rotate VAPID keys:
1. Delete `.env.vapid`
2. Restart the server — new keys auto-generate
3. All existing push subscriptions will need to re-subscribe (keys are invalidated)

---

## 5. HTTP Security Headers (Helmet)

GraveFlow uses `helmet` to set secure HTTP response headers:

- `X-DNS-Prefetch-Control`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HSTS)
- `X-XSS-Protection`
- **Content Security Policy** is disabled (`contentSecurityPolicy: false`) to allow the frontend to load external CDN resources.

---

## 6. Request Logging (Morgan)

All HTTP requests are logged using `morgan` in `combined` format (Apache-style logs), which includes:
- Client IP
- HTTP method and URL
- Response status code
- Response time
- User-Agent

This enables audit trails and anomaly detection in production.

---

## 7. Environment Variables

All secrets and configuration are managed via environment variables. See `.env.example` for the full list. **Never commit `.env` to version control.**

Key secrets:
- `JWT_SECRET` — must be a long, random string in production
- `STRIPE_SECRET_KEY` — optional; uses simulated escrow if unset
- `PINATA_API_KEY` / `PINATA_SECRET_KEY` — IPFS storage credentials
- `TWILIO_SID` / `TWILIO_TOKEN` — SMS notification credentials
- `SMTP_PASS` — Email app password (use app-specific passwords, not account password)

---

## 8. Threat Model Summary

| Threat | Mitigation |
|---|---|
| GPS spoofing | Haversine geofence + image AI cross-check |
| Night-time fraud | Time-of-day enforcement (6AM–8PM) |
| Fake proof images | Ollama LLaVA vision AI analysis |
| Credential brute force | Rate limiting (30 req/15min on /verify-proof) |
| DDoS | Global rate limit (100 req/15min) |
| Token theft | Short-lived JWT (7d) + bcrypt passwords |
| Push notification spoofing | VAPID key signing |
| Header injection | Helmet HTTP security headers |
| Secret exposure | dotenv + .env.example pattern |
