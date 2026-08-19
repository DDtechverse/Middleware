import { Router } from "express";
import * as controller from "./sharing.controller";
import { authGuard } from "../../middleware/auth.guard";

const homeScopedRouter = Router({ mergeParams: true });
homeScopedRouter.use(authGuard);
homeScopedRouter.get("/members", controller.listMembers);
homeScopedRouter.post("/invites", controller.createInvite);
homeScopedRouter.get("/invites", controller.listHomeInvites);
homeScopedRouter.patch("/members/:memberId", controller.updateMember);
homeScopedRouter.delete("/members/:memberId", controller.removeMember);
homeScopedRouter.patch("/members/:memberId/room-access", controller.setRoomAccess);
homeScopedRouter.patch("/members/:memberId/device-access", controller.setDeviceAccess);

const inviteRouter = Router();
inviteRouter.use(authGuard);
inviteRouter.get("/pending", controller.listPendingInvites);
inviteRouter.patch("/:id", controller.updateInvite);
inviteRouter.post("/:id/accept", controller.acceptInvite);
inviteRouter.post("/:id/decline", controller.declineInvite);
inviteRouter.delete("/:id", controller.revokeInvite);

export { homeScopedRouter, inviteRouter };
