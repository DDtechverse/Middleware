import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { ok } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";

export const listHomes = asyncHandler(async (req: Request, res: Response) => {
  const owned = await prisma.home.findMany({ where: { ownerId: req.userId } });
  const memberships = await prisma.homeMember.findMany({
    where: { userId: req.userId },
    include: { home: true },
  });
  const shared = memberships.map((m: (typeof memberships)[number]) => m.home);
  return ok(res, { owned, shared });
});

const createHomeSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  type: z.enum(["APARTMENT", "VILLA", "INDEPENDENT_HOUSE", "OFFICE"]).default("APARTMENT"),
  icon: z.string().optional(),
});

export const createHome = asyncHandler(async (req: Request, res: Response) => {
  const input = createHomeSchema.parse(req.body);
  const existingCount = await prisma.home.count({ where: { ownerId: req.userId } });

  const home = await prisma.home.create({
    data: { ...input, ownerId: req.userId!, isPrimary: existingCount === 0 },
  });

  // owner is always also recorded as a HomeMember for uniform permission checks
  await prisma.homeMember.create({
    data: { homeId: home.id, userId: req.userId!, role: "OWNER", accessLevel: "CONTROL_AND_MANAGE", fullHomeAccess: true },
  });

  return ok(res, home, 201);
});

export const getHome = asyncHandler(async (req: Request, res: Response) => {
  const home = await prisma.home.findUnique({
    where: { id: req.params.homeId },
    include: { rooms: true },
  });
  if (!home) throw new ApiError(404, "HOME_NOT_FOUND", "Home not found.");
  return ok(res, home);
});

const updateHomeSchema = createHomeSchema.partial();

export const updateHome = asyncHandler(async (req: Request, res: Response) => {
  const input = updateHomeSchema.parse(req.body);
  const home = await prisma.home.update({ where: { id: req.params.homeId }, data: input });
  return ok(res, home);
});

export const deleteHome = asyncHandler(async (req: Request, res: Response) => {
  const force = req.query.force === "true";
  const roomCount = await prisma.room.count({ where: { homeId: req.params.homeId } });
  if (roomCount > 0 && !force) {
    throw new ApiError(409, "HOME_DELETE_BLOCKED", "This home has rooms/devices. Pass ?force=true to delete anyway.");
  }
  await prisma.home.delete({ where: { id: req.params.homeId } });
  return ok(res, { deleted: true });
});

export const setPrimaryHome = asyncHandler(async (req: Request, res: Response) => {
  await prisma.home.updateMany({ where: { ownerId: req.userId }, data: { isPrimary: false } });
  const home = await prisma.home.update({ where: { id: req.params.homeId }, data: { isPrimary: true } });
  return ok(res, home);
});
