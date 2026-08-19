import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { ok, ApiError } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { pushRelayCommand } from "../../websocket/device.gateway";
import { broadcastToHomeSubscribers } from "../../websocket/app.gateway";
import { v4 as uuid } from "uuid";

// Scenes are scoped to a single Room — the Home dashboard only shows scenes
// created for the room currently selected, matching how a real household
// thinks about "Movie Time" (living room) vs "Good Night" (bedroom).
export const listRoomScenes = asyncHandler(async (req: Request, res: Response) => {
  const scenes = await prisma.scene.findMany({
    where: { roomId: req.params.roomId },
    include: { actions: { include: { device: true } } },
    orderBy: { createdAt: "asc" },
  });
  return ok(res, scenes);
});

const actionSchema = z.object({
  deviceId: z.string(),
  channel: z.number().int().min(0).max(7).default(0),
  action: z.enum(["ON", "OFF", "OPEN", "CLOSE"]),
});

const createSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
  actions: z.array(actionSchema).min(1),
});

export const createScene = asyncHandler(async (req: Request, res: Response) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.roomId } });
  if (!room) throw new ApiError(404, "ROOM_NOT_FOUND", "Room not found.");

  const input = createSchema.parse(req.body);
  const scene = await prisma.scene.create({
    data: {
      name: input.name,
      icon: input.icon,
      homeId: room.homeId,
      roomId: room.id,
      actions: { create: input.actions },
    },
    include: { actions: { include: { device: true } } },
  });
  return ok(res, scene, 201);
});

export const updateScene = asyncHandler(async (req: Request, res: Response) => {
  const input = createSchema.partial().parse(req.body);
  const data: Record<string, unknown> = {};
  if (input.name) data.name = input.name;
  if (input.icon) data.icon = input.icon;

  if (input.actions) {
    await prisma.sceneAction.deleteMany({ where: { sceneId: req.params.id } });
    data.actions = { create: input.actions };
  }

  const scene = await prisma.scene.update({ where: { id: req.params.id }, data, include: { actions: { include: { device: true } } } });
  return ok(res, scene);
});

export const deleteScene = asyncHandler(async (req: Request, res: Response) => {
  await prisma.scene.delete({ where: { id: req.params.id } });
  return ok(res, { deleted: true });
});

export const applyScene = asyncHandler(async (req: Request, res: Response) => {
  const scene = await prisma.scene.findUnique({
    where: { id: req.params.id },
    include: { actions: { include: { device: true } } },
  });
  if (!scene) throw new ApiError(404, "SCENE_NOT_FOUND", "Scene not found.");

  for (const act of scene.actions) {
    const isOn = act.action === "ON" || act.action === "OPEN";

    if (act.device.connectionMode === "GLOBAL" && act.device.status === "ONLINE") {
      pushRelayCommand(act.device.id, act.channel, isOn, `scene-${scene.id}-${act.device.id}-${act.channel}-${uuid().slice(0, 6)}`);
    }

    const channelState = await prisma.relayChannelState.upsert({
      where: { deviceId_channel: { deviceId: act.device.id, channel: act.channel } },
      update: { state: isOn },
      create: { deviceId: act.device.id, channel: act.channel, state: isOn },
    });

    broadcastToHomeSubscribers(scene.homeId, {
      event: "device.relay_changed",
      deviceId: act.device.id,
      channel: act.channel,
      state: channelState.state,
    });
  }

  return ok(res, { applied: true, sceneId: scene.id });
});
