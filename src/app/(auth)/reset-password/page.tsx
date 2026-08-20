import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import Link from "next/link";

export default function ResetPasswordPage() {
  return <main className="auth-shell auth-shell-simple"><section className="auth-card"><Link className="auth-logo compact-logo" href="/"><span>V</span>Personal Vault</Link><p className="eyebrow">ACCOUNT RECOVERY</p><h1>設定新密碼</h1><p className="lead">請設定從未在其他服務使用過的新密碼。</p><ResetPasswordForm /></section></main>;
}
