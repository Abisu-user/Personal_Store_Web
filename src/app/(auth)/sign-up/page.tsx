import { SignUpForm } from "@/components/auth/sign-up-form";
import Link from "next/link";

export default function SignUpPage() {
  return <main className="auth-shell"><section className="auth-brand"><Link className="auth-logo" href="/"><span>V</span>Personal Vault</Link><div><p className="eyebrow">YOUR PRIVATE SPACE</p><h1>從今天起，<em>安心保存。</em></h1><p>建立你的私人數位空間，讓每一筆資料都有清楚的位置與適合的保護。</p></div><div className="auth-brand-note"><i>◈</i><span>建立後請完成 Email 驗證，才可啟用完整功能。</span></div></section><section className="auth-card"><p className="eyebrow">CREATE ACCOUNT</p><h1>建立保管庫帳號</h1><p className="lead">你的 Email 會用於帳號驗證與安全通知。</p><SignUpForm /></section></main>;
}
