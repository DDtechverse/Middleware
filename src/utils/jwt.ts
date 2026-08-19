import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  userId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpiresIn } as jwt.SignOptions);
}

export function signRefreshToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpiresIn } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as AccessTokenPayload;
}

// separate signing for device (ESP32) WebSocket auth — never overlaps with user tokens
export function signDeviceToken(deviceId: string): string {
  return jwt.sign({ deviceId }, env.deviceTokenSecret, { expiresIn: "3650d" });
}

export function verifyDeviceToken(token: string): { deviceId: string } {
  return jwt.verify(token, env.deviceTokenSecret) as { deviceId: string };
}
