import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { ok, ApiError } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";

export const listRooms = asyncHandler(async (req: Request, res: Response) => {
  const rooms = await prisma.room.findMany({
    where: { homeId: req.params.homeId },
    include: { _count: { select: { devices: true } } },
  });
  return ok(res, rooms);
});

const createRoomSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  icon: z.string().optional(),
});

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  const input = createRoomSchema.parse(req.body);
  const room = await prisma.room.create({ data: { ...input, homeId: req.params.homeId } });
  return ok(res, room, 201);
});

export const getRoom = asyncHandler(async (req: Request, res: Response) => {
  const room = await prisma.room.findUnique({
    where: { id: req.params.roomId },
    include: { devices: true },
  });
  if (!room) throw new ApiError(404, "ROOM_NOT_FOUND", "Room not found.");
  return ok(res, room);
});

const updateRoomSchema = createRoomSchema.partial();

export const updateRoom = asyncHandler(async (req: Request, res: Response) => {
  const input = updateRoomSchema.parse(req.body);
  const room = await prisma.room.update({ where: { id: req.params.roomId }, data: input });
  return ok(res, room);
});

export const deleteRoom = asyncHandler(async (req: Request, res: Response) => {
  const force = req.query.force === "true";
  const deviceCount = await prisma.device.count({ where: { roomId: req.params.roomId } });
  if (deviceCount > 0 && !force) {
    throw new ApiError(409, "ROOM_DELETE_BLOCKED", "This room has devices. Pass ?force=true to delete anyway.");
  }
  await prisma.room.delete({ where: { id: req.params.roomId } });
  return ok(res, { deleted: true });
});
