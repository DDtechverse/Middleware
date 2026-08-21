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

  // Critical: this must never throw. A user's account is already created by
  // the time this runs — if the SDK itself throws (bad API key, network
  // blip, unverified sender domain, etc.) instead of returning a graceful
  // {error} object, that exception must not be allowed to bubble up and
  // fail the whole signup/login/forgot-password request. The OTP row still
  // exists in the DB either way and can be resent.
  try {
    const { error } = await resend.emails.send({
      from: env.resend.from,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[Resend] Failed to send email:", error);
    }
  } catch (err) {
    console.error("[Resend] Threw an exception while sending email:", err);
  }
}
