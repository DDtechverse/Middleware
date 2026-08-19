import { Router } from "express";
import * as controller from "./scenes.controller";
import { authGuard } from "../../middleware/auth.guard";

const roomScopedRouter = Router({ mergeParams: true });
roomScopedRouter.use(authGuard);
roomScopedRouter.get("/", controller.listRoomScenes);
roomScopedRouter.post("/", controller.createScene);

const sceneRouter = Router();
sceneRouter.use(authGuard);
sceneRouter.patch("/:id", controller.updateScene);
sceneRouter.delete("/:id", controller.deleteScene);
sceneRouter.post("/:id/apply", controller.applyScene);

export { roomScopedRouter, sceneRouter };
