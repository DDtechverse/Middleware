import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/db";
import { ApiError } from "../utils/apiResponse";
import { AccessLevel } from "@prisma/client";

/**
 * Resolves whether req.userId has access to a given home, and at what level,
 * walking Home.ownerId -> HomeMember -> RoomAccess -> DeviceAccess.
 * Attaches `req.access = { role, accessLevel, isOwner }` for downstream handlers.
 */
declare global {
  namespace Express {
    interface Request {
      access?: { role: string; accessLevel: AccessLevel; isOwner: boolean };
    }
  }
}

export function requireHomeAccess(minLevel: AccessLevel = "CONTROL_ONLY") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const homeId = req.params.homeId || req.body.homeId;
    if (!homeId) throw new ApiError(400, "VALIDATION_ERROR", "homeId is required.");

    const home = await prisma.home.findUnique({ where: { id: homeId } });
    if (!home) throw new ApiError(404, "HOME_NOT_FOUND", "Home not found.");

    if (home.ownerId === req.userId) {
      req.access = { role: "OWNER", accessLevel: "CONTROL_AND_MANAGE", isOwner: true };
      return next();
    }

    const member = await prisma.homeMember.findUnique({
      where: { homeId_userId: { homeId, userId: req.userId! } },
    });
    if (!member) throw new ApiError(403, "FORBIDDEN", "You do not have access to this home.");

    if (minLevel === "CONTROL_AND_MANAGE" && member.accessLevel !== "CONTROL_AND_MANAGE" && member.role === "MEMBER") {
      throw new ApiError(403, "FORBIDDEN", "You do not have manage permission for this home.");
    }

    req.access = { role: member.role, accessLevel: member.accessLevel, isOwner: false };
    next();
  };
}

/**
 * Device-level check: owner -> full home access -> room access -> explicit device access.
 * Use on routes scoped to a single deviceId.
 */
export async function assertDeviceAccess(userId: string, deviceId: string, needManage = false) {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, include: { room: true } });
  if (!device) throw new ApiError(404, "DEVICE_NOT_FOUND", "Device not found.");

  const home = await prisma.home.findUnique({ where: { id: device.room.homeId } });
  if (!home) throw new ApiError(404, "HOME_NOT_FOUND", "Home not found.");
  if (home.ownerId === userId) return device;

  const member = await prisma.homeMember.findUnique({
    where: { homeId_userId: { homeId: home.id, userId } },
  });
  if (!member) throw new ApiError(403, "FORBIDDEN", "You do not have access to this device.");

  if (member.fullHomeAccess) {
    if (needManage && member.accessLevel !== "CONTROL_AND_MANAGE") {
      throw new ApiError(403, "FORBIDDEN", "You do not have manage permission.");
    }
    return device;
  }

  const roomAccess = await prisma.roomAccess.findUnique({
    where: { homeMemberId_roomId: { homeMemberId: member.id, roomId: device.roomId } },
  });
  if (roomAccess) {
    if (needManage && roomAccess.accessLevel !== "CONTROL_AND_MANAGE") {
      throw new ApiError(403, "FORBIDDEN", "You do not have manage permission for this room.");
    }
    return device;
  }

  const deviceAccess = await prisma.deviceAccess.findUnique({
    where: { homeMemberId_deviceId: { homeMemberId: member.id, deviceId } },
  });
  if (deviceAccess) {
    if (needManage && deviceAccess.accessLevel !== "CONTROL_AND_MANAGE") {
      throw new ApiError(403, "FORBIDDEN", "You do not have manage permission for this device.");
    }
    return device;
  }

  throw new ApiError(403, "FORBIDDEN", "You do not have access to this device.");
}
