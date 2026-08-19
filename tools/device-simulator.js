/**
 * RAYS DYNAMICS — Device Simulator
 *
 * Pretends to be an ESP32 smart switch, speaking the EXACT same WebSocket
 * protocol the real firmware uses (see src/websocket/device.gateway.ts).
 * Use this to test the full middleware flow before your physical device
 * is ready — register it via REST, then run this to bring it "online".
 *
 * Usage:
 *   1. npm install ws node-fetch@2   (inside this tools/ folder, or project root)
 *   2. Edit the CONFIG block below
 *   3. node device-simulator.js
 */

const WebSocket = require("ws");
const fetch = require("node-fetch");

// ---------------- CONFIG — edit these ----------------
const API_BASE = "https://rays-dynamics-middleware.onrender.com/v1"; // or http://localhost:4000/v1
const WS_URL = "wss://rays-dynamics-middleware.onrender.com/ws/device"; // or ws://localhost:4000/ws/device
const ROOM_ID = "PASTE_YOUR_ROOM_ID_HERE"; // from POST /homes/:homeId/rooms
const DEVICE_ID = "RDS-SIM-000001"; // fake serial number, must be unique
const DEVICE_SECRET = "sim-secret-12345"; // fake secret, just needs to match at registration
const TIER = "PRO"; // STANDARD | PRO | ULTRA_PRO
const RELAY_COUNT = 8;
// -------------------------------------------------------

const relayState = Array(RELAY_COUNT).fill(false);

async function registerDevice() {
  const url = `${API_BASE}/devices/register?roomId=${ROOM_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: DEVICE_ID,
      device_secret: DEVICE_SECRET,
      firmware_version: "sim-1.0.0",
      tier: TIER,
      relay_count: RELAY_COUNT,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Registration failed (${res.status}): ${JSON.stringify(body)}`);
  }
  console.log(`✅ Registered as middleware device id: ${body.deviceId}`);
  return body.deviceId;
}

function connectWebSocket() {
  const ws = new WebSocket(WS_URL);
  let authenticated = false;
  let heartbeatTimer;

  ws.on("open", () => {
    console.log("🔌 WS connected — sending auth...");
    ws.send(JSON.stringify({ device_id: DEVICE_ID, device_secret: DEVICE_SECRET }));
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    console.log("⬅️  RX:", msg);

    // auth response (checked first, same as firmware does)
    if (!authenticated && msg.success === true) {
      authenticated = true;
      console.log("✅ Authenticated!");

      // sync initial relay states, like StateSyncManager.syncAllStates()
      for (let ch = 0; ch < RELAY_COUNT; ch++) {
        send(ws, { type: "relay_status", channel: ch, state: relayState[ch] });
      }

      heartbeatTimer = setInterval(() => {
        send(ws, { type: "heartbeat" });
      }, 30000);
      return;
    }

    if (msg.type === "relay_command") {
      const { channel, state, command_id } = msg;
      console.log(`💡 Simulated relay click — channel ${channel} -> ${state}`);
      relayState[channel] = state;
      send(ws, { type: "relay_ack", command_id, channel, state, success: true });
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`❌ WS closed (${code}): ${reason}`);
    clearInterval(heartbeatTimer);
    console.log("Reconnecting in 5s...");
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", (err) => console.error("WS error:", err.message));
}

function send(ws, obj) {
  const payload = JSON.stringify(obj);
  console.log("➡️  TX:", payload);
  ws.send(payload);
}

(async () => {
  try {
    if (TIER !== "STANDARD") {
      await registerDevice();
      connectWebSocket();
    } else {
      console.log("Standard tier — this simulator only demonstrates the GLOBAL (cloud) path.");
      console.log("For Standard/local testing, the real local REST API on the device is what matters, not this script.");
    }
  } catch (err) {
    console.error("Fatal:", err.message);
  }
})();
