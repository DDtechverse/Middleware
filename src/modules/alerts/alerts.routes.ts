import { Router } from "express";
import * as controller from "./alerts.controller";
import { authGuard } from "../../middleware/auth.guard";

const roomScopedRouter = Router({ mergeParams: true });
roomScopedRouter.use(authGuard);
roomScopedRouter.get("/", controller.listRoomAlertRules);

const deviceScopedRouter = Router({ mergeParams: true });
deviceScopedRouter.use(authGuard);
deviceScopedRouter.put("/:channel", controller.setAlertRule);
deviceScopedRouter.delete("/:channel", controller.deleteAlertRule);

export { roomScopedRouter, deviceScopedRouter };
