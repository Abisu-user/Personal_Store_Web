import { LoginForm } from "@/components/auth/login-form";
import Link from "next/link";

export default function LoginPage() {
  return <main className="auth-shell"><section className="auth-brand"><Link className="auth-logo" href="/"><span>V</span>Personal Vault</Link><div><p className="eyebrow">PRIVATE BY DESIGN</p><h1>把數位生活，<em>好好安放。</em></h1><p>在一個只屬於你的空間，管理重要資料、私密紀錄與珍貴連結。</p></div><div className="auth-brand-note"><i>⌁</i><span>你的私人資料不會顯示在登入前。</span></div></section><section className="auth-card"><p className="eyebrow">WELCOME BACK</p><h1>安全登入</h1><p className="lead">使用已驗證的 Email 登入你的個人資料保管庫。</p><LoginForm /></section></main>;
}
