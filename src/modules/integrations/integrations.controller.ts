import { Request, Response } from "express";
import { prisma } from "../../config/db";
import { ok, ApiError } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";

export const listIntegrations = asyncHandler(async (req: Request, res: Response) => {
  const integrations = await prisma.voiceIntegration.findMany({ where: { userId: req.userId } });
  const providers = ["google_home", "alexa"];
  const merged = providers.map((p) => integrations.find((i: (typeof integrations)[number]) => i.provider === p) || { provider: p, connected: false });
  return ok(res, merged);
});

export const connectIntegration = asyncHandler(async (req: Request, res: Response) => {
  const provider = req.params.provider;
  if (!["google_home", "alexa"].includes(provider)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Unsupported provider.");
  }
  // Placeholder: real OAuth redirect URL construction happens here once
  // Google/Amazon developer console credentials exist.
  const redirectUrl = `https://oauth.example.com/${provider}/authorize?state=${req.userId}`;
  return ok(res, { redirectUrl });
});

export const oauthCallback = asyncHandler(async (req: Request, res: Response) => {
  const provider = req.params.provider;
  const userId = req.query.state as string;
  // Placeholder: exchange `code` query param for tokens with the provider here.
  await prisma.voiceIntegration.upsert({
    where: { userId_provider: { userId, provider } },
    update: { connected: true, connectedAt: new Date() },
    create: { userId, provider, connected: true, connectedAt: new Date() },
  });
  return ok(res, { connected: true });
});

export const disconnectIntegration = asyncHandler(async (req: Request, res: Response) => {
  const provider = req.params.provider;
  await prisma.voiceIntegration.updateMany({
    where: { userId: req.userId, provider },
    data: { connected: false, accessToken: null, refreshToken: null },
  });
  return ok(res, { disconnected: true });
});
