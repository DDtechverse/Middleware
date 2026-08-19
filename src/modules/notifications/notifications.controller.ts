import { Request, Response } from "express";
import { prisma } from "../../config/db";
import { ok } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const readFilter = req.query.read === "true" ? true : req.query.read === "false" ? false : undefined;
  const notifications = await prisma.notification.findMany({
    where: { userId: req.userId, ...(readFilter !== undefined ? { read: readFilter } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok(res, notifications);
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
  return ok(res, notification);
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  await prisma.notification.updateMany({ where: { userId: req.userId, read: false }, data: { read: true } });
  return ok(res, { updated: true });
});
