"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function signOut() { setPending(true); await createClient().auth.signOut(); router.replace("/login"); router.refresh(); }
  return <button className="button secondary" disabled={pending} onClick={signOut} type="button">{pending ? "登出中…" : "登出"}</button>;
}
