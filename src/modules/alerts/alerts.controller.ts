import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { ok } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { assertDeviceAccess } from "../../middleware/permission.guard";

// Alert rules for a whole room — the Smart Features "Set Alert" tab lists
// every device+channel in the room together with its current rule (if any).
export const listRoomAlertRules = asyncHandler(async (req: Request, res: Response) => {
  const devices = await prisma.device.findMany({ where: { roomId: req.params.roomId }, select: { id: true } });
  const rules = await prisma.channelAlertRule.findMany({
    where: { deviceId: { in: devices.map((d: { id: string }) => d.id) } },
  });
  return ok(res, rules);
});

const setRuleSchema = z.object({
  thresholdHours: z.number().min(0.1).max(72),
  enabled: z.boolean().default(true),
});

export const setAlertRule = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId);
  const channel = Number(req.params.channel);
  const input = setRuleSchema.parse(req.body);

  const rule = await prisma.channelAlertRule.upsert({
    where: { deviceId_channel: { deviceId: req.params.deviceId, channel } },
    update: { thresholdHours: input.thresholdHours, enabled: input.enabled },
    create: { deviceId: req.params.deviceId, channel, thresholdHours: input.thresholdHours, enabled: input.enabled, createdBy: req.userId! },
  });
  return ok(res, rule);
});

export const deleteAlertRule = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId);
  const channel = Number(req.params.channel);
  await prisma.channelAlertRule.deleteMany({ where: { deviceId: req.params.deviceId, channel } });
  return ok(res, { deleted: true });
});
