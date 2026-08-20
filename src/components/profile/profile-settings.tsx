"use client";

import { FormEvent, useState } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { profileAvatars, type ProfileAvatar } from "@/lib/profile/constants";

type ProfileSettingsProps = {
  initialProfile: { username: string; displayName: string | null; avatar: ProfileAvatar };
  email: string;
};

export function ProfileSettings({ initialProfile, email }: ProfileSettingsProps) {
  const [profile, setProfile] = useState({
    displayName: initialProfile.displayName ?? "",
    username: initialProfile.username,
    avatar: initialProfile.avatar,
    email,
  });
  const [profilePending, setProfilePending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfilePending(true); setError(null); setMessage(null);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "profile", ...profile }),
    });
    const result = await response.json().catch(() => null);
    setProfilePending(false);
    if (!response.ok) { setError(result?.error ?? "無法儲存個人資料。"); return; }
    setMessage(result?.message ?? "個人資料已儲存。");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPasswordPending(true); setError(null); setMessage(null);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "password",
        currentPassword: String(form.get("currentPassword") ?? ""),
        newPassword: String(form.get("newPassword") ?? ""),
        confirmPassword: String(form.get("confirmPassword") ?? ""),
      }),
    });
    const result = await response.json().catch(() => null);
    setPasswordPending(false);
    if (!response.ok) { setError(result?.error ?? "無法更新密碼。"); return; }
    formElement.reset();
    setMessage(result?.message ?? "密碼已更新。");
  }

  return <div className="profile-workspace">
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice success" role="status">{message}</p>}
    <form className="profile-panel" onSubmit={saveProfile}>
      <div><p className="eyebrow">PERSONAL IDENTITY</p><h2>個人資料</h2><p className="lead">這些資訊只會顯示於你的私人保管庫。</p></div>
      <div className="profile-avatar-picker" role="radiogroup" aria-label="選擇個人圖標">
        {profileAvatars.map((avatar) => <button aria-checked={profile.avatar === avatar} className={profile.avatar === avatar ? "active" : ""} key={avatar} onClick={() => setProfile((current) => ({ ...current, avatar }))} role="radio" type="button">{avatar}</button>)}
      </div>
      <label>顯示名稱<input maxLength={80} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} placeholder="你的名稱" value={profile.displayName} /></label>
      <label>使用者名稱<input minLength={3} onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value.toLowerCase() }))} pattern="[a-z0-9][a-z0-9_-]{2,31}" required value={profile.username} /></label>
      <label>信箱<input autoComplete="email" onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} required type="email" value={profile.email} /></label>
      <button className="button" disabled={profilePending} type="submit">{profilePending ? "儲存中…" : "儲存個人資料"}</button>
    </form>
    <form className="profile-panel password-panel" onSubmit={changePassword}>
      <div><p className="eyebrow">ACCOUNT SECURITY</p><h2>修改密碼</h2><p className="lead">先輸入目前密碼，再設定至少 10 個字元的新密碼。</p></div>
      <PasswordInput autoComplete="current-password" id="profile-current-password" label="目前密碼" name="currentPassword" />
      <PasswordInput autoComplete="new-password" hint="至少 10 個字元" id="profile-new-password" label="新密碼" name="newPassword" />
      <PasswordInput autoComplete="new-password" id="profile-confirm-password" label="確認新密碼" name="confirmPassword" />
      <button className="button" disabled={passwordPending} type="submit">{passwordPending ? "更新中…" : "更新密碼"}</button>
    </form>
  </div>;
}
