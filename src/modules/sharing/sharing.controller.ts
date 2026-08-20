import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { ok, ApiError } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendToUser } from "../../websocket/app.gateway";
import { broadcastToHomeSubscribers } from "../../websocket/app.gateway";

export const listMembers = asyncHandler(async (req: Request, res: Response) => {
  const members = await prisma.homeMember.findMany({
    where: { homeId: req.params.homeId },
    include: {
      user: { select: { id: true, fullName: true, email: true, profilePhotoUrl: true } },
      roomAccess: true,
      deviceAccess: true,
    },
  });
  return ok(res, members);
});

const inviteSchema = z.object({
  invitedEmail: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  accessLevel: z.enum(["CONTROL_ONLY", "CONTROL_AND_MANAGE"]).default("CONTROL_ONLY"),
  fullHomeAccess: z.boolean().default(true),
  scopedRoomIds: z.array(z.string()).default([]),
  scopedDeviceIds: z.array(z.string()).default([]),
});

export const createInvite = asyncHandler(async (req: Request, res: Response) => {
  const input = inviteSchema.parse(req.body);
  const invite = await prisma.invite.create({
    data: { ...input, homeId: req.params.homeId, invitedBy: req.userId! },
  });

  // If the invited email already has an account, notify them in-app right
  // away. If they don't have an account yet, they'll see the invite once
  // they sign up and log in (GET /invites/pending matches by email).
  const invitedUser = await prisma.user.findUnique({ where: { email: input.invitedEmail } });
  if (invitedUser) {
    const home = await prisma.home.findUnique({ where: { id: req.params.homeId } });
    const sender = await prisma.user.findUnique({ where: { id: req.userId } });
    await prisma.notification.create({
      data: {
        userId: invitedUser.id,
        title: "New home invitation",
        body: `${sender?.fullName ?? "Someone"} invited you to ${home?.name ?? "their home"}`,
        category: "sharing",
      },
    });
    sendToUser(invitedUser.id, { event: "notification.new", category: "sharing" });
  }

  return ok(res, invite, 201);
});

// The Owner/Admin's view of everyone they've invited to this home — pending,
// accepted, declined, revoked. Without this, an invite sender had no way to
// even see that their invite existed after sending it.
export const listHomeInvites = asyncHandler(async (req: Request, res: Response) => {
  const invites = await prisma.invite.findMany({
    where: { homeId: req.params.homeId },
    orderBy: { createdAt: "desc" },
  });
  return ok(res, invites);
});

const updateInviteSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  accessLevel: z.enum(["CONTROL_ONLY", "CONTROL_AND_MANAGE"]).optional(),
  fullHomeAccess: z.boolean().optional(),
  scopedRoomIds: z.array(z.string()).optional(),
  scopedDeviceIds: z.array(z.string()).optional(),
});

// Lets the sender adjust what a still-pending invite will grant, before the
// recipient accepts it — this is the "decide what access to give" screen's
// save action.
export const updateInvite = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.invite.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, "INVITE_NOT_FOUND", "Invite not found.");
  if (existing.status !== "PENDING") throw new ApiError(409, "INVITE_NOT_PENDING", "This invite has already been responded to.");

  const input = updateInviteSchema.parse(req.body);
  const invite = await prisma.invite.update({ where: { id: req.params.id }, data: input });
  return ok(res, invite);
});

export const listPendingInvites = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const invites = await prisma.invite.findMany({
    where: { invitedEmail: user!.email, status: "PENDING" },
    include: { home: true },
  });
  return ok(res, invites);
});

export const acceptInvite = asyncHandler(async (req: Request, res: Response) => {
  const invite = await prisma.invite.findUnique({ where: { id: req.params.id } });
  if (!invite || invite.status !== "PENDING") throw new ApiError(404, "INVITE_NOT_FOUND", "Invite not found or already handled.");

  const member = await prisma.homeMember.create({
    data: {
      homeId: invite.homeId,
      userId: req.userId!,
      role: invite.role,
      accessLevel: invite.accessLevel,
      fullHomeAccess: invite.fullHomeAccess,
    },
  });

  if (!invite.fullHomeAccess) {
    if (invite.scopedRoomIds.length) {
      await prisma.roomAccess.createMany({
        data: invite.scopedRoomIds.map((roomId: string) => ({ homeMemberId: member.id, roomId, accessLevel: invite.accessLevel })),
      });
    }
    if (invite.scopedDeviceIds.length) {
      await prisma.deviceAccess.createMany({
        data: invite.scopedDeviceIds.map((deviceId: string) => ({ homeMemberId: member.id, deviceId, accessLevel: invite.accessLevel })),
      });
    }
  }

  await prisma.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });

  // Let the inviter's Management -> Sharing tab refresh live instead of only
  // updating after a manual pull-to-refresh.
  broadcastToHomeSubscribers(invite.homeId, { event: "sharing.member_joined", homeId: invite.homeId });

  return ok(res, member);
});

export const declineInvite = asyncHandler(async (req: Request, res: Response) => {
  await prisma.invite.update({ where: { id: req.params.id }, data: { status: "DECLINED", respondedAt: new Date() } });
  return ok(res, { declined: true });
});

export const revokeInvite = asyncHandler(async (req: Request, res: Response) => {
  await prisma.invite.update({ where: { id: req.params.id }, data: { status: "REVOKED", respondedAt: new Date() } });
  return ok(res, { revoked: true });
});

const updateMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  accessLevel: z.enum(["CONTROL_ONLY", "CONTROL_AND_MANAGE"]).optional(),
  fullHomeAccess: z.boolean().optional(),
});

export const updateMember = asyncHandler(async (req: Request, res: Response) => {
  const input = updateMemberSchema.parse(req.body);
  const member = await prisma.homeMember.update({ where: { id: req.params.memberId }, data: input });
  return ok(res, member);
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  await prisma.homeMember.delete({ where: { id: req.params.memberId } });
  return ok(res, { removed: true });
});

const roomAccessSchema = z.object({
  roomIds: z.array(z.object({ roomId: z.string(), accessLevel: z.enum(["CONTROL_ONLY", "CONTROL_AND_MANAGE"]) })),
});

export const setRoomAccess = asyncHandler(async (req: Request, res: Response) => {
  const { roomIds } = roomAccessSchema.parse(req.body);
  await prisma.roomAccess.deleteMany({ where: { homeMemberId: req.params.memberId } });
  await prisma.roomAccess.createMany({
    data: roomIds.map((r) => ({ homeMemberId: req.params.memberId, roomId: r.roomId, accessLevel: r.accessLevel })),
  });
  return ok(res, { updated: true });
});

const deviceAccessSchema = z.object({
  deviceIds: z.array(z.object({ deviceId: z.string(), accessLevel: z.enum(["CONTROL_ONLY", "CONTROL_AND_MANAGE"]) })),
});

export const setDeviceAccess = asyncHandler(async (req: Request, res: Response) => {
  const { deviceIds } = deviceAccessSchema.parse(req.body);
  await prisma.deviceAccess.deleteMany({ where: { homeMemberId: req.params.memberId } });
  await prisma.deviceAccess.createMany({
    data: deviceIds.map((d) => ({ homeMemberId: req.params.memberId, deviceId: d.deviceId, accessLevel: d.accessLevel })),
  });
  return ok(res, { updated: true });
});
