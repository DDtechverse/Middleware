import { Router } from "express";
import * as controller from "./notifications.controller";
import { authGuard } from "../../middleware/auth.guard";

const router = Router();
router.use(authGuard);
router.get("/", controller.listNotifications);
router.patch("/:id/read", controller.markRead);
router.patch("/read-all", controller.markAllRead);

export default router;
