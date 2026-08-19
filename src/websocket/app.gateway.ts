import { WebSocket, WebSocketServer } from "ws";
import { verifyAccessToken } from "../utils/jwt";

interface AppSocketMeta {
  userId: string;
  homeIds: Set<string>;
}

const sockets = new Map<WebSocket, AppSocketMeta>();

// noServer: true — this gateway does NOT attach its own 'upgrade' listener to
// the shared http.Server. Attaching multiple WebSocketServers directly to the
// same server (each with its own `path`) is unsafe: the `ws` library calls
// every attached instance's handleUpgrade for every upgrade request, and
// whichever instance's path DOESN'T match responds with an immediate 400,
// killing the connection before the correct instance gets a chance — even
// though only one instance was ever supposed to handle it. Routing is done
// centrally in server.ts's single 'upgrade' listener instead (see routeUpgrade).
export const appWss = new WebSocketServer({ noServer: true });

export function initAppGateway() {
  appWss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4001, "Missing token");
      return;
    }

    let userId: string;
    try {
      userId = verifyAccessToken(token).userId;
    } catch {
      ws.close(4001, "Invalid token");
      return;
    }

    sockets.set(ws, { userId, homeIds: new Set() });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "subscribe.home" && msg.homeId) {
          sockets.get(ws)?.homeIds.add(msg.homeId);
        }
        // msg.event === "device.command" could be routed to devices.controller's
        // controlDevice logic here as a lower-latency alternative to the REST PATCH.
      } catch {
        // ignore malformed frames
      }
    });

    ws.on("close", () => sockets.delete(ws));
  });

  console.log("[WS] App gateway ready on /ws/app");
}

export function broadcastToHomeSubscribers(homeId: string, payload: unknown) {
  const message = JSON.stringify(payload);
  for (const [ws, meta] of sockets.entries()) {
    if (meta.homeIds.has(homeId) && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

export function sendToUser(userId: string, payload: unknown) {
  const message = JSON.stringify(payload);
  for (const [ws, meta] of sockets.entries()) {
    if (meta.userId === userId && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}
