"use client";
import { useRouter } from "next/navigation";

export function CreateFormActions({ pending, returnHref, label, pendingLabel }: { pending: boolean; returnHref: string; label: string; pendingLabel: string }) {
  const router = useRouter();
  return <div className="create-form-actions"><button className="secondary-button" disabled={pending} onClick={() => router.push(returnHref)} type="button">取消</button><button className="button" disabled={pending} type="submit">{pending ? pendingLabel : label}</button></div>;
}
