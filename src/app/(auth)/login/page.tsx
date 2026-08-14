import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">PERSONAL DIGITAL VAULT</p><h1>安全登入</h1><p className="lead">使用已驗證的 Email 登入你的個人資料保管庫。</p><LoginForm /></section></main>;
}
