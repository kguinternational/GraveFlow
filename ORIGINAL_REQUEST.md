Created At: 2026-07-14T18:06:37Z
Completed At: 2026-07-14T18:06:37Z
# Original User Request

## Initial Request — 2026-06-06T20:32:21-04:00

GraveFlow is a full-stack gig-economy platform for cemetery care services: riders order grave visits (cleaning, flowers, etc.), drivers fulfill them on-site, and an AI-powered verification engine (GPS geofencing + Gemini Vision + time-of-day checks) gates escrow payouts in fiat (Stripe) or crypto. Build the complete product — rider UI, driver PWA, and admin command center — on top of the existing Node.js/Socket.io backend.

Working directory: /Users/jccoffey/Downloads/GAS/GraveFlow
Integrity mode: development

---

## Context — Existing Backend

The backend is already written and lives at `/Users/jccoffey/Downloads/GAS/GraveFlow/server.js`. Do NOT rewrite it. Wire UIs against these live endpoints:

| Port | Endpoint | Purpose |
|------|----------|---------| 
| 8002 | `POST /chat` | Gemini Flash LLM (prompt → reply) |
| 8002 | `POST /create-payment-intent` | Stripe payment intent |
| 8002 | `GET /search-graves?name=` | BillionGraves proxy |
| 8002 | `POST /verify-proof` | KGU OS proof verification (GPS + image) |
| 8002 | `GET /ledger` | Full ledger JSON |
| 8002 | WebSocket `new_order` → `gig_available` | Real-time gig dispatch |
| 8002 | WebSocket `proof_verified` / `anomaly_detected` | Real-time payout/alert events |
| 8001 | `POST /generate` | TTS audio (returns .wav) |
| 8001 | `GET /voices` | List Mac TTS voices |

Start the backend before building: `cd /Users/jccoffey/Downloads/GAS/GraveFlow && node server.js`

---

## Requirements

### R1. Rider Web UI
A polished, mobile-responsive web interface where a rider can:
- Search for a grave by name (calls `/search-graves`)
- Select a service type (e.g., "Clean headstone", "Place flowers", "Full memorial visit") and see a price
- Pay via Stripe (uses `/create-payment-intent` + Stripe.js)
- Dispatch the order to the driver network via WebSocket `new_order` event
- Track the job status in real time (listens for `proof_verified` or `anomaly_detected` events)
- Optionally interact with "Sightless Guide" AI assistant via `/chat`

### R2. Driver PWA
A progressive web app (installable, mobile-first) where a driver can:
- See incoming gigs in real time (listens for `gig_available` WebSocket events)
- Accept a gig and view cemetery address + plot details
- Submit proof: capture or upload a photo, auto-capture device GPS coordinates
- Send proof to `/verify-proof` (driverId, jobId, GPS string, base64 image)
- See the verification result and updated earnings balance
- Optionally hear job details via TTS (calls `/generate`)

### R3. Admin Command Center Dashboard
A real-time operations dashboard displaying:
- Live map or grid of all active gigs with GPS pins and status badges
- Ledger view: all drivers, their balances, and completed gig history (calls `/ledger`)
- Live event feed: `proof_verified` and `anomaly_detected` WebSocket events with timestamps and reasons
- Key metrics: total gigs dispatched, total payouts, anomaly rate

### R4. Navigation & Polish
All three interfaces should be visually premium — dark theme, clear typography, smooth transitions, and consistent GraveFlow branding (muted earth tones, deep blacks, gold accents fitting a cemetery-services aesthetic). Navigation should make it obvious which role (rider / driver / admin) the user is in.

---

## Acceptance Criteria

### Rider UI
- [ ] Grave search returns results (mocked or live) and displays cemetery + plot info
- [ ] Stripe payment flow completes without console errors (test mode keys accepted)
- [ ] Dispatching an order emits a `new_order` WebSocket event visible in server logs
- [ ] Job status updates in the UI when a `proof_verified` or `anomaly_detected` event arrives

### Driver PWA
- [ ] Incoming gig appears in the driver UI within 3 seconds of a rider dispatching it
- [ ] Photo capture works on mobile (file input or camera API)
- [ ] GPS coordinates are auto-populated from the device (or a manual input fallback)
- [ ] Submitting proof calls `/verify-proof` and displays the verdict (verified / quarantined)
- [ ] TTS reads job details aloud when triggered

### Admin Dashboard
- [ ] Dashboard loads ledger data from `/ledger` and renders driver balances and gig history
- [ ] Real-time event feed updates without page refresh when WebSocket events fire
- [ ] At least one summary metric (total payouts or total gigs) is computed and displayed correctly

### Overall
- [ ] All three UIs load without console errors when the backend is running
- [ ] The app is navigable across rider / driver / admin roles from a single entry point or clear separate URLs
- [ ] UI is visually polished and mobile-responsive

---

## Verification

Run the backend (`node server.js`) and open the UIs in a browser. Use browser DevTools console and Network tab to confirm:
1. No uncaught errors on load
2. WebSocket connects successfully (check WS frame in Network tab)
3. Submit a test order as rider → confirm `gig_available` received in driver UI and server logs show `💾 [KGU Ledger] Gig ... locked in escrow`
4. Submit a proof as driver → confirm `/verify-proof` responds and UI shows result
5. Open admin dashboard → confirm ledger renders and live feed shows events

## Follow-up — 2026-06-06T22:43:58-04:00

Upgrade the existing GraveFlow gig-economy cemetery-care app with 4 major features. All files live at `/Users/jccoffey/Downloads/GAS/GraveFlow`. The backend is running at port 8002 (HTTP + WebSocket) and port 8001 (TTS). Do NOT rewrite server.js from scratch — extend it.

Working directory: /Users/jccoffey/Downloads/GAS/GraveFlow
Integrity mode: development

---

## Existing Files (do not delete)
- `server.js` — backend on ports 8001 & 8002
- `index.html` — landing / role picker
- `rider.html` — rider UI
- `driver.html` — driver PWA
- `admin.html` — admin command center
- `driver-manifest.json` — PWA manifest
- `ledger.json` — persistent JSON ledger
- `package.json` — npm config

---

## Requirements

### R1. Local Authentication System
Add a lightweight local auth system (no external services, no cloud). Users (riders and drivers) must be able to register and log in. Auth state must persist across page reloads.
- Store user accounts in a local `users.json` file managed by the backend
- Add `POST /auth/register` and `POST /auth/login` endpoints to server.js. Login returns a signed JWT (use the `jsonwebtoken` npm package, secret from env or a generated default)
- Add `GET /auth/me` endpoint to validate a token and return user info
- Update `index.html` to show a login/register screen before the role picker
- Update `rider.html` and `driver.html` to require login and display the logged-in user's name and ID
- Driver ID must come from the authenticated user (not hardcoded as `NODE_492`)
- Rider must be able to register with name + email + password. Driver must be able to register with name + callsign + password.

### R2. Service Worker for Driver PWA
Create a `sw.js` service worker file that makes the driver app a fully installable, offline-capable PWA.
- Cache all static assets (driver.html, sw.js, driver-manifest.json) on install
- Serve cached assets when offline (show an offline banner if the WebSocket is unavailable)
- Register the service worker in `driver.html`
- Handle Web Push subscription: expose a `POST /push/subscribe` endpoint in server.js that saves push subscriptions to a `push_subscriptions.json` file. Use the `web-push` npm package.
- When a new gig is dispatched via the `new_order` WebSocket event, the backend must also send a Web Push notification to all subscribed drivers with the gig details.
- Add VAPID key generation: on first server start, auto-generate VAPID keys and save them to `.env.vapid` if they don't exist.

### R3. Real GPS Map on Admin Dashboard
Replace the current gig grid in `admin.html` with a real interactive map.
- Use Leaflet.js (loaded from CDN) with OpenStreetMap tiles (free, no API key)
- When the server starts or `/ledger` is polled, plot all active gigs as map markers with gold pins
- Each marker popup must show: job ID, service type, driver ID, GPS coordinates, and status
- When a `proof_verified` or `anomaly_detected` WebSocket event arrives, update the marker color (green for verified, red for anomaly) and remove it from active after 10 seconds
- Keep the ledger table and event feed panels below the map
- Map must default to a US-centered view and auto-fit bounds when markers are added

### R4. Desktop GPS Fallback for Driver
The driver proof submission currently relies on the browser Geolocation API which fails silently on desktop.
- If `navigator.geolocation` is unavailable or the user denies permission, show a clearly labeled manual GPS input (two number fields: Latitude, Longitude) pre-filled with the target gig's GPS coordinates (for demo/testing convenience)
- Show a banner indicating whether GPS is live or manual
- Validate that the GPS string is a valid `lat, lon` format before allowing proof submission

---

## Acceptance Criteria

### Auth
- [ ] A new user can register as Rider or Driver via the UI without touching any config file
- [ ] After login, rider.html and driver.html show the logged-in user's name in the header
- [ ] Driver gig submissions use the authenticated driver's callsign/ID (not NODE_492)
- [ ] Refreshing the page keeps the user logged in (JWT in localStorage)
- [ ] Registering twice with the same email returns an error

### Service Worker & Push
- [ ] driver.html registers a service worker on load (visible in DevTools > Application > Service Workers)
- [ ] Going offline shows an offline banner instead of a blank/broken screen
- [ ] `POST /push/subscribe` saves a subscription entry to push_subscriptions.json
- [ ] Dispatching a new_order from rider.html triggers a Web Push notification on the driver device (or browser)

### Map
- [ ] admin.html shows a Leaflet map with OpenStreetMap tiles
- [ ] Dispatching a test gig from rider.html causes a gold marker to appear on the admin map within 3 seconds
- [ ] Clicking a marker shows the job popup with service + driver + status info
- [ ] Verified gigs turn green; anomaly gigs turn red on the map

### GPS Fallback
- [ ] Opening driver.html on a desktop browser shows the manual GPS input when geolocation is unavailable
- [ ] Entering a valid lat/lon and submitting proof reaches `/verify-proof` with the correct GPS string
- [ ] An invalid format (e.g. letters) shows a validation error and blocks submission

---

## Technical Notes
- Install new npm packages as needed (`jsonwebtoken`, `web-push`, `bcryptjs`)
- Run `npm install <packages>` before referencing them in server.js
- VAPID keys must be generated automatically — do not hardcode them
- All new endpoints must be on port 8002 (same express app)
- The map tiles use `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` (free, no key)
- Leaflet CDN: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` and its CSS
- JWT secret fallback: `process.env.JWT_SECRET || 'graveflow-secret-change-in-prod'`

## Verification
1. `node server.js` starts without errors
2. Open `index.html` → register as Rider → dispatches gig → admin map shows marker
3. Open `driver.html` → register as Driver → gig appears → submit proof with manual GPS → verdict shown
4. Open DevTools > Application > Service Workers → sw.js is registered
5. Disable network → driver.html shows offline banner instead of crash

## Phase 3 — 2026-06-06T23:41:41-04:00

Build Phase 3 of GraveFlow — a full-stack AI-powered cemetery care gig economy platform. All existing files are at `/Users/jccoffey/Downloads/GAS/GraveFlow`. The backend runs on ports 8001 (TTS), 8002 (KGU OS), 8003 (C-Suite AI). Do NOT delete or rewrite existing files — only extend them.

Working directory: /Users/jccoffey/Downloads/GAS/GraveFlow
Integrity mode: development

---

## Existing Stack (do not break)
- `server.js` — Express + Socket.io on port 8002 (LLM, payments, KGU OS verification, WebSockets)
- `csuite.js` — C-Suite AI agents on port 8003
- `main.js` — Electron desktop app shell
- `index.html`, `rider.html`, `driver.html`, `admin.html`, `csuite.html` — UI pages
- `sw.js` — Service worker (PWA)
- `ledger.json` — persistent gig/driver ledger
- Ollama running locally on port 11434 with llama3.2 + llava models

---

## Requirements

### R1. Go Live — Internet Tunnel
Expose the GraveFlow app to the public internet without any hosting account.
- Write a script `tunnel.js` that uses `localtunnel` npm package to expose port 8002 and port 8003 to public HTTPS URLs
- Install localtunnel: `npm install localtunnel`
- When tunnel.js runs, print the public URLs clearly to the console and write them to a `tunnel_urls.json` file
- Add `"tunnel": "node tunnel.js"` to package.json scripts
- Update the Electron app (`app.html`) to show the live public URLs in the sidebar when tunnel is active

### R2. Mobile App — Expo/React Native
Create a React Native mobile app using Expo in a subdirectory `/Users/jccoffey/Downloads/GAS/GraveFlow/mobile`.
- Initialize with: `npx create-expo-app@latest mobile --template blank` (run inside GraveFlow directory)
- Build two screens: DriverScreen (accept gigs, submit GPS + photo proof) and RiderScreen (search grave, dispatch job)
- Connect to the GraveFlow backend at `http://localhost:8002` (configurable via `mobile/config.js`)
- Use Socket.io client for real-time gig events
- Use Expo Camera and Location APIs for proof submission
- Style with dark theme matching GraveFlow (bg: #08080a, accent: #c9a84c)
- Add a `mobile/README.md` with run instructions: `cd mobile && npx expo start`

### R3. Web3 Escrow — Solidity Smart Contract
Create a Solidity smart contract and local Hardhat environment in `/Users/jccoffey/Downloads/GAS/GraveFlow/contracts`.
- Initialize Hardhat: `npm install --save-dev hardhat` then `npx hardhat init` (minimal JS project)
- Write `contracts/GraveFlowEscrow.sol`: a contract with functions `lockFunds(jobId)` payable, `releaseFunds(jobId, driverAddress)`, `refund(jobId)`, and events `FundsLocked`, `FundsReleased`, `FundsRefunded`
- Write a deploy script `scripts/deploy.js` for local Hardhat network
- Write a test `test/GraveFlowEscrow.test.js` covering lock, release, and refund
- Add `"contracts:test": "cd contracts && npx hardhat test"` to root package.json scripts
- Update `server.js` to log a note when crypto escrow mode is triggered, pointing to the contract address
- Add a `contracts/README.md` explaining deployment to Base/Polygon testnet

### R4. Real IPFS Storage — Pinata Integration
Add real IPFS pinning via Pinata's free API tier.
- Install: `npm install @pinata/sdk form-data`
- Add a `POST /ipfs/pin` endpoint to `server.js` that accepts `{ imageBase64, metadata }` and pins the image to Pinata if `PINATA_API_KEY` and `PINATA_SECRET_KEY` are in the environment; falls back to SHA256 hash simulation if keys are missing
- Update the `/verify-proof` endpoint to call `/ipfs/pin` after successful verification and store the real IPFS CID in the ledger entry
- Add `PINATA_API_KEY=` and `PINATA_SECRET_KEY=` placeholder lines to a `.env.example` file

### R5. Email + SMS Notifications
- Install: `npm install nodemailer twilio`
- Add a `notifications.js` module (required by server.js) with two functions:
  - `sendEmail({ to, subject, html })` — uses nodemailer with SMTP config from env (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`); falls back to console.log if env vars are missing
  - `sendSMS({ to, body })` — uses Twilio (`TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`); falls back to console.log if missing
- Trigger `sendEmail` + `sendSMS` to the rider when `proof_verified` fires (use placeholder contact from the ledger for now)
- Trigger `sendSMS` to the driver when a new `gig_available` event fires with their gig details
- Add all required env vars as placeholders to `.env.example`

### R6. Marketing Landing Page
Create a stunning, fully self-contained `landing.html` at the root of the GraveFlow directory.
- Dark premium design: bg #08080a, gold accent #c9a84c, Inter font from Google Fonts
- Sections: Hero (headline + CTA), How It Works (3 steps: order → verify → payout), Features (AI verification, open source, dual escrow, real-time dispatch), C-Suite Team (show all 6 executives with name/title/emoji), and Footer
- Fully responsive, mobile-first
- Hero CTA button links to `index.html`
- Add smooth scroll animations using Intersection Observer (no external animation libraries)
- No placeholder images — use CSS gradients and emoji for visuals
- Include proper SEO meta tags (title, description, og:title, og:description)

### R7. Analytics Dashboard
Create `analytics.html` — a business intelligence dashboard.
- Add a `GET /analytics` endpoint to `server.js` that computes and returns:
  - `totalRevenue`: sum of all completed gig payouts
  - `totalGigs`: count of all completed gigs across all drivers
  - `activeGigs`: count of current active gigs
  - `totalDrivers`: count of registered drivers
  - `anomalyRate`: percentage of gigs that were quarantined (store a `quarantined_gigs` array in ledger.json)
  - `recentActivity`: last 10 completed gigs with timestamp, payout, driverId
  - `payoutByDriver`: array of {driverId, totalPayout, gigCount}
- Track quarantined gigs: update `/verify-proof` in server.js to push quarantined job IDs to `ledger.quarantined_gigs` array
- Build `analytics.html` with:
  - 4 KPI cards: Total Revenue, Total Gigs, Active Gigs, Anomaly Rate
  - A bar chart showing payouts by driver (use Chart.js from CDN)
  - A line chart showing gig volume over time (use timestamps from completed gigs)
  - A recent activity feed table
  - Auto-refreshes every 30 seconds
  - Same dark GraveFlow design system
- Add `analytics.html` as a nav item in `app.html` (the Electron shell)

### R8. Autonomous Driver Agent
Create an autonomous AI driver agent `agent_driver.js` that runs as a background Node.js process.
- The agent connects to port 8002 via Socket.io as a driver node with ID `AGENT_DRIVER_001`
- It listens for `gig_available` events
- When a gig arrives, it waits 3-5 seconds (simulating travel), then auto-submits a proof:
  - GPS: the target gig GPS coordinates (to pass geofence)
  - Image: a base64-encoded placeholder gray image (200x200 JPEG, solid gray, generated programmatically)
  - driverId: `AGENT_DRIVER_001`
- After submission, it logs the verification result
- It uses Ollama (llama3.2) to generate a brief status narration after each gig completion: ask the LLM "In one sentence, narrate completing a cemetery care job at [cemetery name] for [service type]" and log the response
- Add `"agent": "node agent_driver.js"` to package.json scripts
- The agent should be resilient: reconnect on disconnect, handle errors gracefully

### R9. Production Hardening
Harden the GraveFlow backend for production use.
- Install: `npm install express-rate-limit helmet morgan dotenv`
- Add to `server.js`:
  - `helmet()` middleware for security headers
  - `morgan('combined')` for request logging
  - Rate limiter: max 30 requests per 15 minutes on `/verify-proof`; max 100 requests per 15 minutes globally
  - Load `.env` file automatically with `dotenv.config()` at the top of server.js
- Create a `.env.example` file listing all required environment variables with descriptions
- Create a `start.sh` shell script that:
  1. Checks if Ollama is running; if not, starts it with `ollama serve &`
  2. Checks if required models are pulled; if not, pulls them
  3. Starts server.js and csuite.js with PM2 if available, otherwise with node
  4. Prints status of all services
- Make start.sh executable
- Add a `SECURITY.md` documenting the KGU OS verification pipeline, rate limits, and JWT auth

---

## Acceptance Criteria

### R1 — Tunnel
- [ ] `npm run tunnel` starts without error and prints two public HTTPS URLs
- [ ] `tunnel_urls.json` is created with the URLs

### R2 — Mobile
- [ ] `mobile/` directory exists with a valid Expo project (`app.json` present)
- [ ] `mobile/README.md` explains how to run it
- [ ] At least DriverScreen and RiderScreen components exist in `mobile/`

### R3 — Web3
- [ ] `contracts/GraveFlowEscrow.sol` exists and compiles without errors (`npx hardhat compile`)
- [ ] `npx hardhat test` in contracts/ passes at least 1 test

### R4 — IPFS
- [ ] `POST /ipfs/pin` endpoint exists and returns `{ cid }` (real or simulated)
- [ ] `/verify-proof` stores a CID in the ledger entry after verification
- [ ] `.env.example` includes PINATA_API_KEY and PINATA_SECRET_KEY

### R5 — Notifications
- [ ] `notifications.js` exports `sendEmail` and `sendSMS`
- [ ] A `proof_verified` event triggers a console.log notification (real send if env vars present)
- [ ] `.env.example` includes all SMTP and Twilio vars

### R6 — Landing
- [ ] `landing.html` opens in browser with no console errors
- [ ] All 5 sections present: Hero, How It Works, Features, C-Suite Team, Footer
- [ ] Mobile-responsive (viewport meta tag present, layout doesn't break at 375px)

### R7 — Analytics
- [ ] `GET /analytics` returns valid JSON with all 6 fields
- [ ] `analytics.html` loads and renders KPI cards from `/analytics`
- [ ] Both charts render using Chart.js
- [ ] Page auto-refreshes every 30 seconds

### R8 — Agent
- [ ] `npm run agent` starts without error
- [ ] Agent connects to WebSocket and logs connection
- [ ] When a gig is dispatched from rider.html, agent auto-submits proof within 10 seconds
- [ ] Agent logs an LLM-generated narration after each completed gig

### R9 — Hardening
- [ ] `server.js` starts with helmet and rate limiter without error
- [ ] `.env.example` exists and lists at least 8 environment variables
- [ ] `start.sh` is executable and runs without syntax errors (`bash -n start.sh`)
- [ ] `SECURITY.md` exists and documents the verification pipeline

