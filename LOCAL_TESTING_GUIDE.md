# Local Testing Guide — Middleware + Firmware (before the app)

Goal: validate that a Pro device registers, connects, and responds to relay commands through the middleware — and that a Standard device responds to local commands directly — all on your laptop + home WiFi, before touching any VPS or the real app.

---

## Step 1 — Find your laptop's LAN IP

- Windows: `ipconfig` → look for "IPv4 Address" (something like `192.168.1.42`)
- Mac/Linux: `ifconfig` or `ip addr` → look for your WiFi adapter's `inet` address

Write this down — call it `<LAPTOP_IP>`. Your ESP32 devices must be able to reach it, so laptop and devices must be on the **same WiFi network**.

## Step 2 — Run the middleware locally

```bash
cd rays-middleware
npm install
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` → point at a local PostgreSQL (install Postgres locally, or run one via Docker: `docker run --name rays-pg -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=rays_dynamics -p 5432:5432 -d postgres`)
- Leave `SMTP_HOST` blank — OTPs will just print in your terminal, which is fine for this test.

```bash
npm run prisma:migrate     # creates all tables (schema now includes RelayChannelState)
npm run prisma:seed        # seeds device types
npm run dev                # starts on http://localhost:4000
```

You should see: `🚀 RAYS DYNAMICS middleware running on port 4000`.

**Important:** make sure your laptop's firewall allows inbound connections on port 4000 (Windows will usually prompt you the first time — allow it for both Private/Public networks while testing).

## Step 3 — Create a test user + home + room (via Postman)

You need a `roomId` to register a device into. Use Postman (or `curl`) against `http://<LAPTOP_IP>:4000/v1`:

1. `POST /auth/signup` — `{ "fullName": "Test", "email": "test@rays.dev", "password": "test1234" }`
2. Check your terminal for the printed OTP (dev-mode logging), then:
   `POST /auth/verify-otp` — `{ "email": "test@rays.dev", "otpCode": "123456", "purpose": "signup" }` → returns `accessToken`
3. `POST /homes` (header `Authorization: Bearer <accessToken>`) — `{ "name": "Test Home" }` → returns `id` (homeId)
4. `POST /homes/<homeId>/rooms` — `{ "name": "Test Room", "type": "Living Room" }` → returns `id` (**this is your roomId**)

Copy that `roomId` — you'll paste it into the firmware config next.

## Step 4 — Configure firmware for local testing

Open `platformio.ini`. Two environments are pre-built for this: `pro_8ch_local` and `standard_8ch_local`.

Edit `pro_8ch_local`'s `build_flags`:
```ini
-D RAYS_API_HOST=\"<LAPTOP_IP>\"          ; e.g. 192.168.1.42
-D RAYS_API_PORT=4000
-D RAYS_API_USE_TLS=0
-D TEST_ROOM_ID=\"<the roomId from step 3>\"
```

`standard_8ch_local` doesn't need the host/room (Standard tier never calls the cloud) — leave it as-is.

## Step 5 — Flash the two devices

```bash
pio run -e pro_8ch_local -t upload        # your Pro test unit
pio run -e standard_8ch_local -t upload   # your Standard test unit
```

## Step 6 — Provision WiFi on each device

Each device boots into AP mode (`RDS_PRO_xxxxxx` / `RDS_STD_xxxxxx`, password `RDS@9565`).

1. Connect your phone/laptop to that AP.
2. Open `http://192.168.4.1` in a browser (captive portal) → scan/select your home WiFi → enter password → submit.
3. Watch the Serial Monitor (`pio device monitor -b 115200`) — you should see it connect to your WiFi and print an IP address.

## Step 7 — Verify the Pro device (cloud path)

In the Serial Monitor, look for, in order:
```
Trying Device Registration...
Registration Code : 200
Device Registration Successful
Connecting WS...
WS Connected
WS AUTH TX: {"device_id":"RDS-pro-XXXXXX","device_secret":"..."}
WS Authenticated
Syncing All Relay States...
```

If you see all of this, the device is fully connected. Now find its `deviceId` (the middleware's internal id, not the firmware's `device_id` string):

`GET /rooms/<roomId>/devices` (with your `accessToken`) → note the `id` field of the device that just registered.

Send a test command:
`POST /devices/<deviceId>/relay` — `{ "channel": 0, "state": true }`

Relay channel 0 should physically click, and the Serial Monitor should show:
```
RELAY COMMAND
Channel : 0
State : 1
ACK TX: {"type":"relay_ack",...}
```

Toggle it back with `{ "channel": 0, "state": false }` to confirm both directions work.

## Step 8 — Verify the Standard device (local path)

Find the Standard device's local IP from its Serial Monitor output (printed after it joins your WiFi).

From Postman/curl, on the same WiFi:
```bash
curl http://<STANDARD_DEVICE_IP>/api/state
curl -X POST http://<STANDARD_DEVICE_IP>/api/relay -H "Content-Type: application/json" -d '{"channel":0,"state":true}'
```

Relay channel 0 should click, no cloud involved at all.

## If something doesn't work

- **Registration fails / times out** → check laptop firewall, check `<LAPTOP_IP>` is correct and both devices are truly on the same WiFi (not a guest network that isolates clients from each other).
- **WS connects but never authenticates** → the device's self-generated `device_secret` only gets stored in the DB *at registration time*. If you re-flash and it generates a new one without re-registering, or if you manually cleared its NVS, delete the device row and re-register.
- **Relay command has no effect but device shows "connected: true"** → double check you're using the middleware's `id` (uuid) in the URL, not the firmware's `device_id` string.

## After this works

Once both devices are validated end-to-end, next steps are: (1) deploy the middleware to a real VPS with a domain + SSL and switch the devices to the real `pro_8ch`/`standard_8ch` environments, and (2) start building the real Flutter app against this same API — replacing this Postman-driven testing with the actual UI.
