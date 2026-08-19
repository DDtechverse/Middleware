import { Router } from "express";
import * as controller from "./homes.controller";
import { authGuard } from "../../middleware/auth.guard";
import { requireHomeAccess } from "../../middleware/permission.guard";

const router = Router();
router.use(authGuard);

router.get("/", controller.listHomes);
router.post("/", controller.createHome);
router.get("/:homeId", requireHomeAccess(), controller.getHome);
router.patch("/:homeId", requireHomeAccess("CONTROL_AND_MANAGE"), controller.updateHome);
router.delete("/:homeId", requireHomeAccess("CONTROL_AND_MANAGE"), controller.deleteHome);
router.patch("/:homeId/set-primary", requireHomeAccess("CONTROL_AND_MANAGE"), controller.setPrimaryHome);

export default router;
