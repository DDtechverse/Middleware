import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { ok, ApiError } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { comparePassword, hashPassword } from "../../utils/password";

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true, fullName: true, email: true, phone: true, profilePhotoUrl: true,
      emailVerified: true, language: true, theme: true, unitTemp: true, unitEnergy: true,
      notificationsEnabled: true, createdAt: true,
    },
  });
  return ok(res, user);
});

const updateMeSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  profilePhotoUrl: z.string().url().optional(),
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const input = updateMeSchema.parse(req.body);
  const user = await prisma.user.update({ where: { id: req.userId }, data: input });
  return ok(res, user);
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(401, "INVALID_CREDENTIALS", "Current password is incorrect.");

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: req.userId }, data: { passwordHash } });
  return ok(res, { updated: true });
});

const preferencesSchema = z.object({
  language: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  unitTemp: z.enum(["C", "F"]).optional(),
  unitEnergy: z.enum(["kWh", "Wh"]).optional(),
  notificationsEnabled: z.boolean().optional(),
});

export const updatePreferences = asyncHandler(async (req: Request, res: Response) => {
  const input = preferencesSchema.parse(req.body);
  const user = await prisma.user.update({ where: { id: req.userId }, data: input });
  return ok(res, user);
});

const deleteMeSchema = z.object({ password: z.string() });

export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
  const { password } = deleteMeSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new ApiError(401, "INVALID_CREDENTIALS", "Password is incorrect.");

  // Home.ownerId -> User has onDelete: Cascade, which cascades further into
  // Rooms -> Devices -> Schedules/SceneActions/RelayChannelStates etc, so
  // deleting the user cleanly removes everything they own. HomeMember rows
  // (their access to OTHER people's homes) also cascade via userId.
  await prisma.user.delete({ where: { id: req.userId } });
  return ok(res, { deleted: true });
});

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const sessions = await prisma.session.findMany({ where: { userId: req.userId }, orderBy: { lastActive: "desc" } });
  return ok(res, sessions);
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  await prisma.session.delete({ where: { id: req.params.id } });
  return ok(res, { revoked: true });
});
