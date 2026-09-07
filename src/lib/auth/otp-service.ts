import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import {
  OTP_EXPIRES_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  RESET_AUTH_EXPIRES_SECONDS,
  flowCookieName,
  maskEmail,
  resetAuthorizationCookieName,
  secondsUntil,
  type OtpPurpose,
} from "@/lib/auth/otp-policy";
import { createAdminClient } from "@/lib/supabase/admin";

type FlowRow = {
  id: string;
  email: string;
  purpose: OtpPurpose;
  expires_at: string;
  last_sent_at: string;
  attempt_count: number;
  consumed_at: string | null;
};

export class OtpFlowError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) {
    super(message);
  }
}

function createPublicAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
}

function securityHash(value: string) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Server security storage is not configured.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function isoAfter(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function setFlowCookie(response: NextResponse, purpose: OtpPurpose, flowId: string) {
  response.cookies.set(flowCookieName(purpose), flowId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OTP_EXPIRES_SECONDS,
  });
}

export function clearFlowCookie(response: NextResponse, purpose: OtpPurpose) {
  response.cookies.set(flowCookieName(purpose), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

async function enforceSendRate(request: NextRequest, email: string, purpose: OtpPurpose) {
  const admin = createAdminClient();
  const emailHash = securityHash(email);
  const ipHash = securityHash(requestIp(request));
  const { data, error } = await admin.rpc("reserve_auth_otp_send", {
    requested_email_hash: emailHash,
    requested_ip_hash: ipHash,
    requested_purpose: purpose,
  });
  if (error || !data || typeof data !== "object") throw new Error("Unable to reserve OTP delivery.");
  const reservation = data as { allowed?: boolean; eventId?: number; retryAfter?: number };
  if (!reservation.allowed) {
    throw new OtpFlowError("驗證碼寄送次數過多，請稍後再試。", 429, reservation.retryAfter ?? OTP_RESEND_COOLDOWN_SECONDS);
  }
  if (!reservation.eventId) throw new Error("OTP delivery reservation is incomplete.");
  return { admin, eventId: reservation.eventId };
}

async function deliverOtp(
  email: string,
  purpose: OtpPurpose,
  registration?: { password: string; displayName: string },
) {
  const auth = createPublicAuthClient().auth;
  let result;
  if (purpose === "email_verification") {
    if (!registration) throw new Error("Registration details are required.");
    const admin = createAdminClient();
    const { data: account, error: accountError } = await admin.rpc("lookup_auth_email_status", { requested_email: email });
    if (accountError) throw new Error("Unable to inspect registration status.");
    const status = account as { userId?: string | null; confirmed?: boolean } | null;
    if (status?.confirmed) {
      throw new OtpFlowError("此 Email 已完成註冊，請直接登入或使用忘記密碼。", 409);
    }
    if (status?.userId) {
      const { error: updateError } = await admin.auth.admin.updateUserById(status.userId, {
        password: registration.password,
        user_metadata: { display_name: registration.displayName },
      });
      if (updateError) throw new Error("Unable to refresh pending registration.");
      result = await auth.resend({ type: "signup", email });
    } else {
      result = await auth.signUp({
        email,
        password: registration.password,
        options: { data: { display_name: registration.displayName } },
      });
    }
  } else {
    result = await auth.resetPasswordForEmail(email);
  }
  if (result.error) {
    const status = result.error.status === 429 ? 429 : 503;
    throw new OtpFlowError(
      status === 429 ? "驗證碼寄送過於頻繁，請稍後再試。" : "目前無法寄送驗證碼，請稍後再試。",
      status,
      status === 429 ? OTP_RESEND_COOLDOWN_SECONDS : undefined,
    );
  }
}

export async function startOtpFlow(
  request: NextRequest,
  emailInput: string,
  purpose: OtpPurpose,
  registration?: { password: string; displayName: string },
) {
  const email = emailInput.trim().toLowerCase();
  const { admin, eventId } = await enforceSendRate(request, email, purpose);
  await deliverOtp(email, purpose, registration);

  const now = new Date().toISOString();
  const { data: flow, error } = await admin.from("auth_verification_flows").upsert({
    email,
    purpose,
    expires_at: isoAfter(OTP_EXPIRES_SECONDS),
    last_sent_at: now,
    attempt_count: 0,
    consumed_at: null,
  }, { onConflict: "email,purpose" }).select("id,email,purpose,expires_at,last_sent_at,attempt_count,consumed_at").single();
  if (error || !flow) throw new Error("Unable to create OTP flow.");
  const { error: eventError } = await admin.from("auth_otp_send_events").update({ flow_id: flow.id }).eq("id", eventId);
  if (eventError) throw new Error("Unable to record OTP delivery.");
  return flow as FlowRow;
}

export async function resendOtpFlow(request: NextRequest, purpose: OtpPurpose) {
  const flow = await readFlow(request, purpose);
  if (!flow) throw new OtpFlowError("驗證流程已失效，請重新開始。", 410);
  const { admin, eventId } = await enforceSendRate(request, flow.email, purpose);
  const auth = createPublicAuthClient().auth;
  const result = purpose === "email_verification"
    ? await auth.resend({ type: "signup", email: flow.email })
    : await auth.resetPasswordForEmail(flow.email);
  if (result.error) {
    const status = result.error.status === 429 ? 429 : 503;
    throw new OtpFlowError(
      status === 429 ? "驗證碼寄送過於頻繁，請稍後再試。" : "目前無法寄送驗證碼，請稍後再試。",
      status,
      status === 429 ? OTP_RESEND_COOLDOWN_SECONDS : undefined,
    );
  }
  const now = new Date().toISOString();
  const { data: updated, error } = await admin.from("auth_verification_flows").update({
    expires_at: isoAfter(OTP_EXPIRES_SECONDS),
    last_sent_at: now,
    attempt_count: 0,
    consumed_at: null,
  }).eq("id", flow.id).select("id,email,purpose,expires_at,last_sent_at,attempt_count,consumed_at").single();
  if (error || !updated) throw new Error("Unable to refresh OTP flow.");
  const { error: eventError } = await admin.from("auth_otp_send_events").update({ flow_id: flow.id }).eq("id", eventId);
  if (eventError) throw new Error("Unable to record OTP delivery.");
  return updated as FlowRow;
}

export async function readFlow(request: NextRequest, purpose: OtpPurpose) {
  const id = request.cookies.get(flowCookieName(purpose))?.value;
  if (!id) return null;
  const { data, error } = await createAdminClient().from("auth_verification_flows")
    .select("id,email,purpose,expires_at,last_sent_at,attempt_count,consumed_at")
    .eq("id", id)
    .eq("purpose", purpose)
    .maybeSingle();
  if (error || !data) return null;
  return data as FlowRow;
}

export function publicFlowStatus(flow: FlowRow | null) {
  if (!flow) return { active: false, canResend: false };
  if (flow.consumed_at || secondsUntil(flow.expires_at) === 0) {
    return {
      active: false,
      canResend: true,
      maskedEmail: maskEmail(flow.email),
      retryAfter: secondsUntil(new Date(new Date(flow.last_sent_at).getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000)),
    };
  }
  return {
    active: true,
    canResend: true,
    maskedEmail: maskEmail(flow.email),
    expiresIn: secondsUntil(flow.expires_at),
    retryAfter: secondsUntil(new Date(new Date(flow.last_sent_at).getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000)),
    attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - flow.attempt_count),
  };
}

export async function verifyOtpFlow(request: NextRequest, purpose: OtpPurpose, code: string) {
  const flow = await readFlow(request, purpose);
  if (!flow || flow.consumed_at) throw new OtpFlowError("驗證流程已失效，請重新開始。", 410);
  if (secondsUntil(flow.expires_at) === 0) throw new OtpFlowError("驗證碼已過期，請重新寄送驗證碼。", 410);
  if (flow.attempt_count >= OTP_MAX_ATTEMPTS) throw new OtpFlowError("驗證碼已失效，請重新寄送驗證碼。", 429);

  const nextAttemptCount = flow.attempt_count + 1;
  const admin = createAdminClient();
  const { error: attemptError } = await admin.from("auth_verification_flows")
    .update({ attempt_count: nextAttemptCount })
    .eq("id", flow.id)
    .eq("attempt_count", flow.attempt_count);
  if (attemptError) throw new Error("Unable to record OTP attempt.");

  const { data, error } = await createPublicAuthClient().auth.verifyOtp({
    email: flow.email,
    token: code,
    type: purpose === "email_verification" ? "signup" : "recovery",
  });
  if (error || !data.user) {
    if (nextAttemptCount >= OTP_MAX_ATTEMPTS) {
      await admin.from("auth_verification_flows").update({ consumed_at: new Date().toISOString() }).eq("id", flow.id);
      throw new OtpFlowError("驗證碼已失效，請重新寄送驗證碼。", 429);
    }
    throw new OtpFlowError("驗證碼不正確。", 400);
  }

  await admin.from("auth_verification_flows").update({ consumed_at: new Date().toISOString() }).eq("id", flow.id);
  if (purpose === "email_verification") return { destination: "/login" } as const;

  const resetToken = randomBytes(32).toString("base64url");
  await admin.from("password_reset_authorizations")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", data.user.id)
    .is("used_at", null);
  const { error: resetError } = await admin.from("password_reset_authorizations").insert({
    flow_id: flow.id,
    user_id: data.user.id,
    token_hash: tokenHash(resetToken),
    expires_at: isoAfter(RESET_AUTH_EXPIRES_SECONDS),
  });
  if (resetError) throw new Error("Unable to create password reset authorization.");
  return { destination: "/reset-password", resetToken } as const;
}

export function setResetAuthorizationCookie(response: NextResponse, token: string) {
  response.cookies.set(resetAuthorizationCookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RESET_AUTH_EXPIRES_SECONDS,
  });
}

export async function consumePasswordResetAuthorization(request: NextRequest, password: string) {
  const token = request.cookies.get(resetAuthorizationCookieName)?.value;
  if (!token) throw new OtpFlowError("密碼重設授權已失效，請重新取得驗證碼。", 401);
  const admin = createAdminClient();
  const { data: authorization, error } = await admin.from("password_reset_authorizations")
    .select("id,user_id,expires_at,used_at")
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (error || !authorization || authorization.used_at || secondsUntil(authorization.expires_at) === 0) {
    throw new OtpFlowError("密碼重設授權已失效，請重新取得驗證碼。", 401);
  }
  const { error: updateError } = await admin.auth.admin.updateUserById(authorization.user_id, { password });
  if (updateError) throw new OtpFlowError("目前無法更新密碼，請稍後再試。", 503);
  await admin.from("password_reset_authorizations").update({ used_at: new Date().toISOString() }).eq("id", authorization.id);
}

export function clearResetAuthorizationCookie(response: NextResponse) {
  response.cookies.set(resetAuthorizationCookieName, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
