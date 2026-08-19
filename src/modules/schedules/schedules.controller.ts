import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { ok, ApiError } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";

export const listRoomSchedules = asyncHandler(async (req: Request, res: Response) => {
  const devices = await prisma.device.findMany({ where: { roomId: req.params.roomId }, select: { id: true } });
  const schedules = await prisma.schedule.findMany({
    where: { deviceId: { in: devices.map((d: (typeof devices)[number]) => d.id) } },
    include: { device: { include: { relayChannels: true } } },
  });
  return ok(res, schedules);
});

export const listHomeSchedules = asyncHandler(async (req: Request, res: Response) => {
  const rooms = await prisma.room.findMany({ where: { homeId: req.params.homeId }, select: { id: true } });
  const devices = await prisma.device.findMany({ where: { roomId: { in: rooms.map((r: (typeof rooms)[number]) => r.id) } }, select: { id: true } });
  const schedules = await prisma.schedule.findMany({
    where: { deviceId: { in: devices.map((d: (typeof devices)[number]) => d.id) } },
    include: { device: { include: { relayChannels: true } } },
  });
  return ok(res, schedules);
});

const createSchema = z.object({
  targets: z.array(z.object({ deviceId: z.string(), channel: z.number().int().min(0).max(7).default(0) })).min(1),
  action: z.enum(["ON", "OFF", "OPEN", "CLOSE"]),
  time: z.string(), // "HH:MM" 24hr
  repeatDays: z.array(z.string()).default([]),
  isOneTime: z.boolean().default(false),
  notifyOnRun: z.boolean().default(true),
});

export const createSchedule = asyncHandler(async (req: Request, res: Response) => {
  const input = createSchema.parse(req.body);
  const schedules = await prisma.$transaction(
    input.targets.map((t) =>
      prisma.schedule.create({
        data: {
          deviceId: t.deviceId,
          channel: t.channel,
          action: input.action,
          time: input.time,
          repeatDays: input.repeatDays,
          isOneTime: input.isOneTime,
          notifyOnRun: input.notifyOnRun,
          createdBy: req.userId!,
        },
      })
    )
  );
  return ok(res, schedules, 201);
});

export const getSchedule = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id }, include: { device: true } });
  if (!schedule) throw new ApiError(404, "SCHEDULE_NOT_FOUND", "Schedule not found.");
  return ok(res, schedule);
});

const updateSchema = z.object({
  action: z.enum(["ON", "OFF", "OPEN", "CLOSE"]).optional(),
  time: z.string().optional(),
  repeatDays: z.array(z.string()).optional(),
  notifyOnRun: z.boolean().optional(),
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
  const input = updateSchema.parse(req.body);
  const schedule = await prisma.schedule.update({ where: { id: req.params.id }, data: input });
  return ok(res, schedule);
});

export const toggleSchedule = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.schedule.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, "SCHEDULE_NOT_FOUND", "Schedule not found.");
  const schedule = await prisma.schedule.update({ where: { id: req.params.id }, data: { enabled: !existing.enabled } });
  return ok(res, schedule);
});

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
  await prisma.schedule.delete({ where: { id: req.params.id } });
  return ok(res, { deleted: true });
});
