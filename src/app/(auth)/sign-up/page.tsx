import { SignUpForm } from "@/components/auth/sign-up-form";

export default function SignUpPage() {
  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">PERSONAL DIGITAL VAULT</p><h1>建立保管庫帳號</h1><p className="lead">你的 Email 會用於帳號驗證與安全通知。</p><SignUpForm /></section></main>;
}
