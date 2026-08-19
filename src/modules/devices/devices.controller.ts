import { Request, Response } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { prisma } from "../../config/db";
import { ok, ApiError } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { assertDeviceAccess } from "../../middleware/permission.guard";
import { hashPassword } from "../../utils/password";
import { pushRelayCommand, isDeviceConnected } from "../../websocket/device.gateway";
import { broadcastToHomeSubscribers } from "../../websocket/app.gateway";

export const listDeviceTypes = asyncHandler(async (_req: Request, res: Response) => {
  const types = await prisma.deviceType.findMany();
  return ok(res, types);
});

export const listRoomDevices = asyncHandler(async (req: Request, res: Response) => {
  const devices = await prisma.device.findMany({
    where: { roomId: req.params.roomId },
    orderBy: { createdAt: "asc" },
    include: { deviceType: true, state: true, relayChannels: { orderBy: { channel: "asc" } } },
  });
  return ok(res, devices);
});

export const getDevice = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId);
  const device = await prisma.device.findUnique({
    where: { id: req.params.deviceId },
    include: { deviceType: true, state: true, relayChannels: { orderBy: { channel: "asc" } } },
  });
  if (!device) throw new ApiError(404, "DEVICE_NOT_FOUND", "Device not found.");
  return ok(res, device);
});

// --- App-driven pairing flow (real production path, used once the app exists) ---
const pairingSessions = new Map<string, { roomId: string; userId: string; createdAt: number }>();

export const startPairing = asyncHandler(async (req: Request, res: Response) => {
  const pairingSessionId = uuid();
  pairingSessions.set(pairingSessionId, { roomId: req.params.roomId, userId: req.userId!, createdAt: Date.now() });
  return ok(res, { pairingSessionId });
});

export const scanForDevices = asyncHandler(async (req: Request, res: Response) => {
  const session = pairingSessions.get(req.params.pairingSessionId);
  if (!session) throw new ApiError(404, "PAIRING_SESSION_NOT_FOUND", "Pairing session expired or not found.");
  return ok(res, { candidates: [] });
});

const confirmPairingSchema = z.object({
  name: z.string().min(1),
  deviceTypeId: z.string(),
  serialNumber: z.string(),
  tier: z.enum(["STANDARD", "PRO", "ULTRA_PRO"]).default("STANDARD"),
});

export const confirmPairing = asyncHandler(async (req: Request, res: Response) => {
  const session = pairingSessions.get(req.params.pairingSessionId);
  if (!session) throw new ApiError(404, "PAIRING_SESSION_NOT_FOUND", "Pairing session expired or not found.");

  const input = confirmPairingSchema.parse(req.body);
  const connectionMode = input.tier === "STANDARD" ? "LOCAL" : "GLOBAL";

  const device = await prisma.device.create({
    data: {
      name: input.name,
      serialNumber: input.serialNumber,
      deviceTypeId: input.deviceTypeId,
      roomId: session.roomId,
      tier: input.tier,
      connectionMode,
      status: "OFFLINE",
      pairedAt: new Date(),
      globalDeviceId: connectionMode === "GLOBAL" ? uuid() : null,
    },
  });

  await prisma.deviceState.create({ data: { deviceId: device.id, isOn: false } });
  pairingSessions.delete(req.params.pairingSessionId);

  return ok(res, { device }, 201);
});

// --- Hardware bring-up / self-registration (what the firmware calls today) ---
// PUBLIC route — no user login. The physical board calls this itself with an
// id+secret it generated on first boot. Requires a roomId that already exists
// (create one first via POST /homes and POST /homes/:homeId/rooms).
// NOTE: this is a bring-up/testing path. The real product flow is the
// app-driven pairing above; the two will be reconciled once the app exists.
const registerSchema = z.object({
  device_id: z.string().min(1),
  device_secret: z.string().min(1),
  firmware_version: z.string().optional(),
  tier: z.enum(["STANDARD", "PRO", "ULTRA_PRO"]).default("PRO"),
  relay_count: z.number().int().min(1).max(8).default(8),
});

export const registerDevice = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const roomId = req.query.roomId as string;
  if (!roomId) throw new ApiError(400, "VALIDATION_ERROR", "roomId query param is required for bring-up registration.");

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new ApiError(404, "ROOM_NOT_FOUND", "Room not found — create a home/room first.");

  let deviceType = await prisma.deviceType.findFirst({ where: { name: "Smart Switch" } });
  if (!deviceType) {
    deviceType = await prisma.deviceType.create({
      data: { name: "Smart Switch", category: "switch", capabilities: { onOff: true, gangs: [4, 8] } },
    });
  }

  const secretHash = await hashPassword(input.device_secret);
  const connectionMode = input.tier === "STANDARD" ? "LOCAL" : "GLOBAL";

  const device = await prisma.device.upsert({
    where: { serialNumber: input.device_id },
    update: { firmwareVersion: input.firmware_version, deviceSecretHash: secretHash, tier: input.tier, connectionMode },
    create: {
      name: `${input.tier} Switch ${input.relay_count}CH`,
      serialNumber: input.device_id,
      deviceTypeId: deviceType.id,
      roomId,
      tier: input.tier,
      connectionMode,
      status: "OFFLINE",
      firmwareVersion: input.firmware_version,
      deviceSecretHash: secretHash,
      pairedAt: new Date(),
    },
  });

  console.log(`[Bring-up] Registered device ${input.device_id} -> ${device.id} in room ${roomId}`);
  return res.status(200).json({ ok: true, deviceId: device.id }); // plain 200 body — firmware only checks HTTP status code
});

const renameSchema = z.object({ name: z.string().min(1).optional(), localIp: z.string().optional() });

export const renameDevice = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId, true);
  const input = renameSchema.parse(req.body);
  const device = await prisma.device.update({ where: { id: req.params.deviceId }, data: input });
  return ok(res, device);
});

const moveSchema = z.object({ roomId: z.string() });

export const moveDevice = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId, true);
  const { roomId } = moveSchema.parse(req.body);
  const device = await prisma.device.update({ where: { id: req.params.deviceId }, data: { roomId } });
  return ok(res, device);
});

export const removeDevice = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId, true);
  await prisma.device.delete({ where: { id: req.params.deviceId } });
  return ok(res, { deleted: true });
});

export const getDeviceState = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId);
  const state = await prisma.deviceState.findUnique({ where: { deviceId: req.params.deviceId } });
  return ok(res, state);
});

const controlSchema = z.object({
  isOn: z.boolean().optional(),
  brightness: z.number().min(0).max(100).optional(),
  fanSpeed: z.number().min(1).max(5).optional(),
  temperature: z.number().optional(),
  mode: z.string().optional(),
});

// Generic single-value control — kept for future non-relay device types
// (bulbs/AC/fans that aren't just channel on/off). Relay hardware uses the
// dedicated /relay endpoint below instead.
export const controlDevice = asyncHandler(async (req: Request, res: Response) => {
  const device = await assertDeviceAccess(req.userId!, req.params.deviceId);
  const input = controlSchema.parse(req.body);

  const state = await prisma.deviceState.upsert({
    where: { deviceId: device.id },
    update: { ...input },
    create: { deviceId: device.id, isOn: input.isOn ?? false, ...input },
  });

  broadcastToHomeSubscribers(device.room.homeId, {
    event: "device.state_changed",
    deviceId: device.id,
    state,
  });

  return ok(res, state);
});

// ---- Relay channel control (the actual hardware protocol) ----

export const getRelayState = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId);
  const channels = await prisma.relayChannelState.findMany({
    where: { deviceId: req.params.deviceId },
    orderBy: { channel: "asc" },
  });
  const connected = isDeviceConnected(req.params.deviceId);
  return ok(res, { connected, channels });
});

const relaySchema = z.object({
  channel: z.number().int().min(0).max(7),
  state: z.boolean(),
});

export const setRelayChannel = asyncHandler(async (req: Request, res: Response) => {
  const device = await assertDeviceAccess(req.userId!, req.params.deviceId);
  const { channel, state } = relaySchema.parse(req.body);

  if (device.connectionMode !== "GLOBAL") {
    throw new ApiError(409, "NOT_GLOBAL", "This device is Standard tier — control it directly via its local IP (/api/relay), not through the middleware.");
  }

  const commandId = uuid();
  const sent = pushRelayCommand(device.id, channel, state, commandId);
  if (!sent) {
    throw new ApiError(409, "DEVICE_OFFLINE", "This device is not currently connected.");
  }

  return ok(res, { sent: true, commandId, channel, state });
});

const relayMetaSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  icon: z.string().max(30).optional(),
});

// Lets a user assign a friendly name + icon to one relay channel — this is
// what turns "Channel 0" into "Ceiling Light" on the dashboard. Purely
// metadata; does not touch the physical relay state.
export const updateRelayChannelMeta = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId, true);
  const channel = Number(req.params.channel);
  const input = relayMetaSchema.parse(req.body);

  const updated = await prisma.relayChannelState.upsert({
    where: { deviceId_channel: { deviceId: req.params.deviceId, channel } },
    update: input,
    create: { deviceId: req.params.deviceId, channel, state: false, ...input },
  });

  return ok(res, updated);
});

export const getDeviceEnergy = asyncHandler(async (req: Request, res: Response) => {
  await assertDeviceAccess(req.userId!, req.params.deviceId);
  const logs = await prisma.energyLog.findMany({
    where: { deviceId: req.params.deviceId },
    orderBy: { recordedAt: "desc" },
    take: 500,
  });
  return ok(res, logs);
});
