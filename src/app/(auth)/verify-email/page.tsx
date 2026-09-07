import Link from "next/link";
import { OtpVerificationForm } from "@/components/auth/otp-verification-form";
import type { OtpPurpose } from "@/lib/auth/otp-policy";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  const params = await searchParams;
  const purpose: OtpPurpose = params.purpose === "password_reset" ? "password_reset" : "email_verification";
  const recovery = purpose === "password_reset";
  return <main className="auth-shell auth-shell-simple"><section className="auth-card"><Link className="auth-logo compact-logo" href="/"><span>V</span>Personal Vault</Link><p className="eyebrow">{recovery ? "PASSWORD RECOVERY" : "EMAIL VERIFICATION"}</p><h1>{recovery ? "驗證重設要求" : "驗證你的 Email"}</h1><p className="lead">{recovery ? "輸入 Email 中的 6 位密碼重設驗證碼。" : "輸入 Email 中的 6 位驗證碼，完成帳號啟用。"}</p><OtpVerificationForm purpose={purpose} /></section></main>;
}
