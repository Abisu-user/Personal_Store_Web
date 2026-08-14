import { MfaChallenge } from "@/components/auth/mfa-challenge";

export default function MfaChallengePage() {
  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">TWO-FACTOR VERIFICATION</p><h1>再確認一次身分</h1><p className="lead">請開啟你的驗證器 App，輸入目前顯示的代碼。</p><MfaChallenge /></section></main>;
}
