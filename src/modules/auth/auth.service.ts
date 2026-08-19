import { prisma } from "../../config/db";
import { hashPassword, comparePassword } from "../../utils/password";
import { generateOtp } from "../../utils/otp";
import { sendOtpEmail } from "../../utils/mailer";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";
import { ApiError } from "../../utils/apiResponse";
import { env } from "../../config/env";

export async function signup(input: { fullName: string; email: string; phone?: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ApiError(409, "EMAIL_IN_USE", "An account with this email already exists.");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      passwordHash,
    },
  });

  await issueOtp(user.email, "signup");
  return { userId: user.id, email: user.email };
}

export async function issueOtp(email: string, purpose: "signup" | "forgot_password") {
  const otpCode = generateOtp();
  const expiresAt = new Date(Date.now() + env.otpExpiryMinutes * 60 * 1000);

  await prisma.otpVerification.create({
    data: { email, otpCode, purpose, expiresAt },
  });
  await sendOtpEmail(email, otpCode, purpose);
}

export async function verifyOtp(email: string, otpCode: string, purpose: "signup" | "forgot_password") {
  const record = await prisma.otpVerification.findFirst({
    where: { email, otpCode, purpose, verified: false },
    orderBy: { createdAt: "desc" },
  });
  if (!record) throw new ApiError(400, "OTP_INVALID", "Invalid verification code.");
  if (record.expiresAt < new Date()) throw new ApiError(400, "OTP_EXPIRED", "This code has expired. Request a new one.");

  await prisma.otpVerification.update({ where: { id: record.id }, data: { verified: true } });

  if (purpose === "signup") {
    await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  }
  return true;
}

export async function issueTokenPair(userId: string) {
  const accessToken = signAccessToken({ userId });
  const refreshToken = signRefreshToken({ userId });

  const decoded = verifyRefreshToken(refreshToken);
  void decoded;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // matches JWT_REFRESH_EXPIRES_IN default

  await prisma.refreshToken.create({ data: { token: refreshToken, userId, expiresAt } });
  return { accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

  if (!user.emailVerified) throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Please verify your email first.");

  const tokens = await issueTokenPair(user.id);
  return { user, ...tokens };
}

export async function refreshAccessToken(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Refresh token is invalid or expired.");
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw new ApiError(401, "UNAUTHORIZED", "Refresh token is invalid or expired.");
  }

  const accessToken = signAccessToken({ userId: payload.userId });
  return { accessToken };
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({ where: { token: refreshToken }, data: { revoked: true } });
}

export async function resetPassword(email: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { email }, data: { passwordHash } });
}
