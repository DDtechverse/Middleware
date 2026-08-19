import { WebSocket, WebSocketServer } from "ws";
import { prisma } from "../config/db";
import { comparePassword } from "../utils/password";
import { broadcastToHomeSubscribers } from "./app.gateway";

/**
 * Speaks the exact protocol the ESP32 firmware implements (see
 * WebSocketManager.cpp / MessageParser.cpp / StateSyncManager.cpp):
 *
 * Device -> Server (after raw WS connect, no query-string token):
 *   1st message: { "device_id": "...", "device_secret": "..." }   (auth)
 *   { "type": "heartbeat" }
 *   { "type": "relay_status", "channel": N, "state": bool }        (on connect, per channel)
 *   { "type": "relay_ack", "command_id": "...", "channel": N, "state": bool, "success": bool }
 *
 * Server -> Device:
 *   { "success": true }                                            (auth result — checked BEFORE
 *                                                                    anything else on the firmware
 *                                                                    side, so no other message we
 *                                                                    send should include "success")
 *   { "type": "heartbeat_ack" }
 *   { "type": "relay_status_ack" }
 *   { "type": "relay_ack_received" }
 *   { "type": "relay_command", "command_id": "...", "channel": N, "state": bool }
 */

interface DeviceSocketMeta {
  deviceId: string; // our internal Device.id (uuid), not the firmware's device_id string
  authenticated: boolean;
}

const deviceSockets = new Map<WebSocket, DeviceSocketMeta>();
const deviceIdToSocket = new Map<string, WebSocket>(); // Device.id -> ws

// noServer: true — see the comment in app.gateway.ts for why. Routing happens
// centrally in server.ts's single 'upgrade' listener.
export const deviceWss = new WebSocketServer({ noServer: true });

export function initDeviceGateway() {
  deviceWss.on("connection", (ws) => {
    deviceSockets.set(ws, { deviceId: "", authenticated: false });

    ws.on("message", async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignore malformed frames
      }

      const meta = deviceSockets.get(ws);
      if (!meta) return;

      // ---- Step 1: authentication (device_id + device_secret, first message) ----
      if (!meta.authenticated) {
        if (!msg.device_id || !msg.device_secret) {
          ws.send(JSON.stringify({ success: false }));
          ws.close(4001, "Missing device_id/device_secret");
          return;
        }

        const device = await prisma.device.findUnique({ where: { serialNumber: msg.device_id } });
        if (!device || !device.deviceSecretHash) {
          ws.send(JSON.stringify({ success: false }));
          ws.close(4001, "Unknown device");
          return;
        }

        const valid = await comparePassword(msg.device_secret, device.deviceSecretHash);
        if (!valid) {
          ws.send(JSON.stringify({ success: false }));
          ws.close(4001, "Invalid device_secret");
          return;
        }

        meta.deviceId = device.id;
        meta.authenticated = true;
        deviceIdToSocket.set(device.id, ws);

        await prisma.device.update({ where: { id: device.id }, data: { status: "ONLINE", lastSeenAt: new Date() } });

        ws.send(JSON.stringify({ success: true }));
        console.log(`[Device WS] ${msg.device_id} authenticated`);
        return;
      }

      // ---- Step 2: normal protocol messages ----
      const type = msg.type;

      if (type === "heartbeat") {
        await prisma.device.update({ where: { id: meta.deviceId }, data: { lastSeenAt: new Date(), status: "ONLINE" } });
        ws.send(JSON.stringify({ type: "heartbeat_ack" }));
        return;
      }

      if (type === "relay_status") {
        const channel = Number(msg.channel);
        const state = Boolean(msg.state);

        await prisma.relayChannelState.upsert({
          where: { deviceId_channel: { deviceId: meta.deviceId, channel } },
          update: { state },
          create: { deviceId: meta.deviceId, channel, state },
        });

        ws.send(JSON.stringify({ type: "relay_status_ack" }));

        const device = await prisma.device.findUnique({ where: { id: meta.deviceId } });
        if (device) {
          const room = await prisma.room.findUnique({ where: { id: device.roomId } });
          if (room) {
            broadcastToHomeSubscribers(room.homeId, {
              event: "device.relay_changed",
              deviceId: device.id,
              channel,
              state,
            });
          }
        }
        return;
      }

      if (type === "relay_ack") {
        const channel = Number(msg.channel);
        const state = Boolean(msg.state);

        await prisma.relayChannelState.upsert({
          where: { deviceId_channel: { deviceId: meta.deviceId, channel } },
          update: { state },
          create: { deviceId: meta.deviceId, channel, state },
        });

        ws.send(JSON.stringify({ type: "relay_ack_received" }));
        return;
      }
    });

    ws.on("close", async () => {
      const meta = deviceSockets.get(ws);
      if (meta?.deviceId) {
        deviceIdToSocket.delete(meta.deviceId);
        await prisma.device.update({ where: { id: meta.deviceId }, data: { status: "OFFLINE" } }).catch(() => {});
      }
      deviceSockets.delete(ws);
    });
  });

  console.log("[WS] Device gateway ready on /ws/device (device_id/device_secret protocol)");
}

/**
 * Pushes a relay command to a device over its live WebSocket, in the exact
 * shape MessageParser.cpp expects. Returns false if the device isn't connected.
 */
export function pushRelayCommand(deviceId: string, channel: number, state: boolean, commandId: string): boolean {
  const ws = deviceIdToSocket.get(deviceId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "relay_command", command_id: commandId, channel, state }));
    return true;
  }
  return false;
}

// kept for compatibility with modules that just need to know "is it online"
export function isDeviceConnected(deviceId: string): boolean {
  const ws = deviceIdToSocket.get(deviceId);
  return !!ws && ws.readyState === WebSocket.OPEN;
}
