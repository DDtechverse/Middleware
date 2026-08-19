import { Router } from "express";
import * as controller from "./devices.controller";
import { authGuard } from "../../middleware/auth.guard";

// mounted under /rooms/:roomId/devices
const roomScopedRouter = Router({ mergeParams: true });
roomScopedRouter.use(authGuard);
roomScopedRouter.get("/", controller.listRoomDevices);
roomScopedRouter.post("/pair", controller.startPairing);

// standalone /devices/*
const deviceRouter = Router();

// PUBLIC — called directly by the physical board itself, before any user is involved.
deviceRouter.post("/register", controller.registerDevice);

// everything below requires a logged-in user
deviceRouter.get("/types", authGuard, controller.listDeviceTypes);
deviceRouter.post("/pair/:pairingSessionId/scan", authGuard, controller.scanForDevices);
deviceRouter.post("/pair/:pairingSessionId/confirm", authGuard, controller.confirmPairing);
deviceRouter.get("/:deviceId", authGuard, controller.getDevice);
deviceRouter.patch("/:deviceId", authGuard, controller.renameDevice);
deviceRouter.patch("/:deviceId/move", authGuard, controller.moveDevice);
deviceRouter.delete("/:deviceId", authGuard, controller.removeDevice);
deviceRouter.get("/:deviceId/state", authGuard, controller.getDeviceState);
deviceRouter.patch("/:deviceId/state", authGuard, controller.controlDevice);
deviceRouter.get("/:deviceId/energy", authGuard, controller.getDeviceEnergy);

// relay/channel control — the actual hardware protocol for Smart Switch boards
deviceRouter.get("/:deviceId/relay", authGuard, controller.getRelayState);
deviceRouter.post("/:deviceId/relay", authGuard, controller.setRelayChannel);
deviceRouter.patch("/:deviceId/relay/:channel", authGuard, controller.updateRelayChannelMeta);

export { roomScopedRouter, deviceRouter };
