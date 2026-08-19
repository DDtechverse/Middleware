import { Router } from "express";
import * as controller from "./schedules.controller";
import { authGuard } from "../../middleware/auth.guard";

const roomScopedRouter = Router({ mergeParams: true });
roomScopedRouter.use(authGuard);
roomScopedRouter.get("/", controller.listRoomSchedules);

const homeScopedRouter = Router({ mergeParams: true });
homeScopedRouter.use(authGuard);
homeScopedRouter.get("/", controller.listHomeSchedules);

const scheduleRouter = Router();
scheduleRouter.use(authGuard);
scheduleRouter.post("/", controller.createSchedule);
scheduleRouter.get("/:id", controller.getSchedule);
scheduleRouter.patch("/:id", controller.updateSchedule);
scheduleRouter.patch("/:id/toggle", controller.toggleSchedule);
scheduleRouter.delete("/:id", controller.deleteSchedule);

export { roomScopedRouter, homeScopedRouter, scheduleRouter };
