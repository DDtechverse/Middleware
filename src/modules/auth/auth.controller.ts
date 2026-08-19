import { Request, Response } from "express";
import { z } from "zod";
import * as authService from "./auth.service";
import { ok } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../config/db";

const signupSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
});

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const input = signupSchema.parse(req.body);
  const result = await authService.signup(input);
  return ok(res, result, 201);
});

const otpSchema = z.object({
  email: z.string().email(),
  otpCode: z.string().length(6),
  purpose: z.enum(["signup", "forgot_password"]),
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, otpCode, purpose } = otpSchema.parse(req.body);
  await authService.verifyOtp(email, otpCode, purpose);

  if (purpose === "signup") {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const tokens = await authService.issueTokenPair(user.id);
    return ok(res, { verified: true, ...tokens });
  }
  return ok(res, { verified: true });
});

const resendOtpSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(["signup", "forgot_password"]),
});

export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, purpose } = resendOtpSchema.parse(req.body);
  await authService.issueOtp(email, purpose);
  return ok(res, { sent: true });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);
  const { user, accessToken, refreshToken } = await authService.login(email, password);
  return ok(res, {
    accessToken,
    refreshToken,
    user: { id: user.id, fullName: user.fullName, email: user.email },
  });
});

const forgotPasswordSchema = z.object({ email: z.string().email() });

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.issueOtp(email, "forgot_password");
  return ok(res, { sent: true });
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otpCode: z.string().length(6),
  newPassword: z.string().min(8),
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, otpCode, newPassword } = resetPasswordSchema.parse(req.body);
  await authService.verifyOtp(email, otpCode, "forgot_password");
  await authService.resetPassword(email, newPassword);
  return ok(res, { reset: true });
});

const refreshSchema = z.object({ refreshToken: z.string() });

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: token } = refreshSchema.parse(req.body);
  const result = await authService.refreshAccessToken(token);
  return ok(res, result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: token } = refreshSchema.parse(req.body);
  await authService.logout(token);
  return ok(res, { loggedOut: true });
});
