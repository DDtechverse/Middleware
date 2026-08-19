import { Router } from "express";
import * as controller from "./users.controller";
import notificationsRouter from "../notifications/notifications.routes";
import { authGuard } from "../../middleware/auth.guard";

const router = Router();
router.use(authGuard);

router.get("/", controller.getMe);
router.patch("/", controller.updateMe);
router.patch("/password", controller.changePassword);
router.patch("/preferences", controller.updatePreferences);
router.delete("/", controller.deleteMe);
router.get("/sessions", controller.listSessions);
router.delete("/sessions/:id", controller.revokeSession);
router.use("/notifications", notificationsRouter);

export default router;
