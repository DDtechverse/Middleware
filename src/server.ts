import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error.handler";

import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import homesRoutes from "./modules/homes/homes.routes";
import { homeScopedRouter as roomsUnderHome, roomRouter } from "./modules/rooms/rooms.routes";
import { roomScopedRouter as devicesUnderRoom, deviceRouter } from "./modules/devices/devices.routes";
import {
  roomScopedRouter as schedulesUnderRoom,
  homeScopedRouter as schedulesUnderHome,
  scheduleRouter,
} from "./modules/schedules/schedules.routes";
import { roomScopedRouter as scenesUnderRoom, sceneRouter } from "./modules/scenes/scenes.routes";
import { homeScopedRouter as sharingUnderHome, inviteRouter } from "./modules/sharing/sharing.routes";
import integrationsRoutes from "./modules/integrations/integrations.routes";
import { roomScopedRouter as alertsUnderRoom, deviceScopedRouter as alertsUnderDevice } from "./modules/alerts/alerts.routes";

import { appWss, initAppGateway } from "./websocket/app.gateway";
import { deviceWss, initDeviceGateway } from "./websocket/device.gateway";
import { startScheduleWorker } from "./jobs/scheduleWorker";
import { startAlertWorker } from "./jobs/alertWorker";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

const v1 = express.Router();

v1.use("/auth", authRoutes);
v1.use("/me", usersRoutes);
v1.use("/homes", homesRoutes);
v1.use("/homes/:homeId/rooms", roomsUnderHome);
v1.use("/rooms", roomRouter);
v1.use("/rooms/:roomId/devices", devicesUnderRoom);
v1.use("/devices", deviceRouter);
v1.use("/rooms/:roomId/schedules", schedulesUnderRoom);
v1.use("/homes/:homeId/schedules", schedulesUnderHome);
v1.use("/schedules", scheduleRouter);
v1.use("/rooms/:roomId/scenes", scenesUnderRoom);
v1.use("/scenes", sceneRouter);
v1.use("/homes/:homeId", sharingUnderHome); // -> /homes/:homeId/members, /homes/:homeId/invites
v1.use("/invites", inviteRouter);
v1.use("/integrations", integrationsRoutes);
v1.use("/rooms/:roomId/alerts", alertsUnderRoom);
v1.use("/devices/:deviceId/alerts", alertsUnderDevice);

app.use("/v1", v1);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

initAppGateway();
initDeviceGateway();
startScheduleWorker();
startAlertWorker();

// Single, central 'upgrade' listener — routes by exact pathname to the right
// WebSocketServer (both created with `noServer: true`). This avoids the real
// `ws` library bug where attaching multiple WebSocketServers directly to the
// same http.Server (each with its own `path` option) causes whichever
// instance's path DOESN'T match to respond with an immediate HTTP 400,
// killing the connection before the correct instance ever gets a chance.
server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url || "").split("?")[0];

  if (pathname === "/ws/app") {
    appWss.handleUpgrade(req, socket, head, (ws) => {
      appWss.emit("connection", ws, req);
    });
  } else if (pathname === "/ws/device") {
    deviceWss.handleUpgrade(req, socket, head, (ws) => {
      deviceWss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(env.port, () => {
  console.log(`\n🚀 RAYS DYNAMICS middleware running on port ${env.port} (${env.nodeEnv})`);
  console.log(`   REST base:   http://localhost:${env.port}/v1`);
  console.log(`   App WS:      ws://localhost:${env.port}/ws/app?token=<accessToken>`);
  console.log(`   Device WS:   ws://localhost:${env.port}/ws/device?token=<deviceToken>\n`);
});
