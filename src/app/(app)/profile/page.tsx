import { ProfileSettings } from "@/components/profile/profile-settings";
import { getUserProfile } from "@/lib/profile/data";
import { requireUser } from "@/lib/security/require-user";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getUserProfile(user);

  return <main className="dashboard">
    <header className="dashboard-header"><div><p className="eyebrow">ACCOUNT</p><h1>個人檔案</h1><p>管理你的圖標、名稱、信箱與登入密碼。</p></div></header>
    <ProfileSettings email={user.email ?? ""} initialProfile={profile} />
  </main>;
}
