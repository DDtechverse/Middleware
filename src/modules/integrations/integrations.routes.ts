import { Router } from "express";
import * as controller from "./integrations.controller";
import { authGuard } from "../../middleware/auth.guard";

const router = Router();
router.use(authGuard);
router.get("/", controller.listIntegrations);
router.post("/:provider/connect", controller.connectIntegration);
router.get("/:provider/callback", controller.oauthCallback);
router.delete("/:provider", controller.disconnectIntegration);

export default router;
