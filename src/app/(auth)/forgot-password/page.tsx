import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import Link from "next/link";

export default function ForgotPasswordPage() {
  return <main className="auth-shell auth-shell-simple"><section className="auth-card"><Link className="auth-logo compact-logo" href="/"><span>V</span>Personal Vault</Link><p className="eyebrow">ACCOUNT RECOVERY</p><h1>重設密碼</h1><p className="lead">我們會寄送單次使用的安全連結，不會顯示此 Email 是否已有帳號。</p><ForgotPasswordForm /></section></main>;
}
