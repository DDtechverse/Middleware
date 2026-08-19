import { Router } from "express";
import * as controller from "./rooms.controller";
import { authGuard } from "../../middleware/auth.guard";
import { requireHomeAccess } from "../../middleware/permission.guard";

// mounted twice: under /homes/:homeId/rooms and standalone /rooms/:roomId
const homeScopedRouter = Router({ mergeParams: true });
homeScopedRouter.use(authGuard);
homeScopedRouter.get("/", requireHomeAccess(), controller.listRooms);
homeScopedRouter.post("/", requireHomeAccess("CONTROL_AND_MANAGE"), controller.createRoom);

const roomRouter = Router();
roomRouter.use(authGuard);
roomRouter.get("/:roomId", controller.getRoom);
roomRouter.patch("/:roomId", controller.updateRoom);
roomRouter.delete("/:roomId", controller.deleteRoom);

export { homeScopedRouter, roomRouter };
