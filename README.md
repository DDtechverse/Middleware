# RAYS DYNAMICS — Middleware

Node.js + TypeScript + Express + PostgreSQL (Prisma) + WebSocket backend for the RAYS DYNAMICS smart-home app.

Covers: Auth (signup/OTP/login/JWT), Homes, Rooms, Devices (pairing + control), Schedules (with a cron worker), Scenes, Sharing/Permissions (Home → Room → Device level), Notifications, Voice Integration stubs (Google Home / Alexa), and two WebSocket channels (`/ws/app` for the mobile app, `/ws/device` for ESP32 devices).

---

## 1. Prerequisites

- Node.js 18+ (`node -v`)
- A PostgreSQL database (local install, Docker, or a managed instance on your VPS)

## 2. Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in real values
cp .env.example .env
# edit .env: set DATABASE_URL, JWT secrets, SMTP creds (or leave SMTP blank —
# OTPs will just be printed to the console in dev mode)

# 3. Create the database tables from the Prisma schema
npm run prisma:migrate
# (this also runs prisma generate; first run will prompt for a migration name, e.g. "init")

# 4. Seed the device type catalog (Smart Switch, Plug, Bulb, Fan, AC, etc.)
npm run prisma:seed

# 5. Start the dev server (auto-restarts on file changes)
npm run dev
```

Server starts on `http://localhost:4000` by default. Health check: `GET /health`.

## 3. Production build

```bash
npm run build     # compiles TypeScript -> dist/
npm start         # runs dist/server.js
```

Run this behind a process manager (PM2 recommended) on your VPS so it survives reboots/crashes:

```bash
npm install -g pm2
pm2 start dist/server.js --name rays-middleware
pm2 save
pm2 startup
```

Put Nginx (or Caddy) in front for HTTPS/SSL termination and to proxy both the REST API and the two WebSocket paths (`/ws/app`, `/ws/device`) to this Node process.

## 4. Project layout

```
prisma/schema.prisma     — full DB schema
prisma/seed.ts           — seeds device type catalog
src/config/               — env + Prisma client
src/middleware/           — JWT auth guard, permission guard, error handler
src/utils/                — jwt, password hashing, otp, mailer, response helpers
src/modules/*/            — one folder per domain: routes + controller (+ service for auth)
src/websocket/            — app.gateway.ts (mobile app), device.gateway.ts (ESP32 devices)
src/jobs/scheduleWorker.ts — cron job that fires due schedules every minute
src/server.ts              — wires everything together and starts listening
```

## 5. What's implemented vs. stubbed

**Fully implemented:** auth (signup → OTP email → login → JWT access/refresh → logout), homes/rooms/devices/schedules/scenes CRUD, 3-level sharing permissions, device control routing (local vs global), WebSocket broadcast on state change, schedule cron worker, notifications.

**Stubbed — needs real integration before production:**
- `sendOtpEmail` (mailer.ts) falls back to console logging if `SMTP_HOST` isn't set — wire up a real SMTP/SES/SendGrid account.
- `scanForDevices` (devices.controller.ts) returns an empty candidate list — this needs to talk to the actual pairing flow once ESP32 firmware exists (local network discovery or a QR/BLE handoff).
- Google Home / Alexa OAuth (`integrations.controller.ts`) has placeholder redirect/callback logic — real implementation needs Google/Amazon developer console apps plus their Smart Home fulfillment webhook, which is a separate piece of work.
- Pairing sessions are stored in memory (`Map`) — fine for a single server instance; move to Redis if you ever run multiple instances behind a load balancer.

## 6. Next steps (per our plan)

1. Get this running on your VPS (PostgreSQL + this Node app + PM2 + Nginx/SSL).
2. Build the ESP32 firmware for local REST/WebSocket control, matching the `/devices/:id/state` contract and `/ws/device` protocol described in `API_DESIGN.md`.
3. Once middleware + one working local device are validated end-to-end, start the real Flutter app, replacing the prototype's mock data with real calls to this API.
