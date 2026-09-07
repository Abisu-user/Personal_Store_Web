export const OTP_LENGTH = 6;
export const OTP_EXPIRES_SECONDS = 10 * 60;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_SEND_WINDOW_SECONDS = 10 * 60;
export const OTP_MAX_SENDS_PER_WINDOW = 3;
export const OTP_MAX_SENDS_PER_IP_WINDOW = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const RESET_AUTH_EXPIRES_SECONDS = 15 * 60;

export type OtpPurpose = "email_verification" | "password_reset";

export function isOtpPurpose(value: unknown): value is OtpPurpose {
  return value === "email_verification" || value === "password_reset";
}

export function sanitizeOtp(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}${local.length > visible.length ? "***" : ""}@${domain}`;
}

export function secondsUntil(date: string | Date, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(date).getTime() - now) / 1000));
}

export function flowCookieName(purpose: OtpPurpose) {
  return purpose === "email_verification"
    ? "vault-email-verification-flow"
    : "vault-password-reset-flow";
}

export const resetAuthorizationCookieName = "vault-password-reset-authorization";
