import { Resend } from "resend";
import { env } from "../config/env";

// Real email delivery via Resend (https://resend.com). Falls back to
// console logging if RESEND_API_KEY isn't set yet, so local/dev testing
// doesn't break before the key is configured.
const resend = env.resend.apiKey ? new Resend(env.resend.apiKey) : null;

export async function sendOtpEmail(to: string, otp: string, purpose: "signup" | "forgot_password") {
  const subject = purpose === "signup" ? "Verify your RAYS DYNAMICS account" : "Reset your RAYS DYNAMICS password";
  const html = `
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="color:#0A2A43">RAYS DYNAMICS</h2>
      <p style="color:#333">Your verification code is:</p>
      <h1 style="letter-spacing:6px;color:#0EA99B">${otp}</h1>
      <p style="color:#6B8394;font-size:13px">This code expires in ${env.otpExpiryMinutes} minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>`;

  if (!resend) {
    console.log(`[DEV MAIL — Resend not configured] To: ${to} | Subject: ${subject} | OTP: ${otp}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: env.resend.from,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[Resend] Failed to send email:", error);
    // Don't throw — signup/login flows shouldn't hard-fail just because an
    // email didn't go out; the OTP still exists in the DB and can be resent.
  }
}
