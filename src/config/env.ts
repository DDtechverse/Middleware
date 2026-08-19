import dotenv from "dotenv";
dotenv.config();

function required(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return val;
}

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:4000",

  databaseUrl: required("DATABASE_URL"),

  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",

  deviceTokenSecret: required("DEVICE_TOKEN_SECRET", "dev_device_secret"),

  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    // Resend requires a verified domain to send from a custom address like
    // no-reply@raysdynamics.in. Until that domain is verified in the Resend
    // dashboard, use their shared test sender so emails still go out.
    from: process.env.RESEND_FROM || "RAYS DYNAMICS <onboarding@resend.dev>",
  },

  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10),

  corsOrigin: process.env.CORS_ORIGIN || "*",
};
