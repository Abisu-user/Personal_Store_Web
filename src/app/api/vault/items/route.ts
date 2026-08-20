import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";

const base64 = z.string().min(1).max(200_000).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const itemSchema = z.object({ id: z.string().uuid(), ciphertext: base64, nonce: base64, aad: z.object({ entryId: z.string().uuid(), version: z.literal(1) }) });
const deleteSchema = z.object({ id: z.string().uuid() });
const asBytea = (value: string) => `\\x${Buffer.from(value, "base64").toString("hex")}`;
const asBase64 = (value: unknown) => { if (typeof value !== "string" || !value.startsWith("\\x")) throw new Error("Invalid encrypted payload."); return Buffer.from(value.slice(2), "hex").toString("base64"); };

export const dynamic = "force-dynamic";
export async function GET() {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await createAdminClient().from("entries").select("id, vault_payloads(ciphertext, nonce, aad, encryption_version)").eq("owner_id", context.userId).eq("kind", "vault_item").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100);
    if (error) throw error;
    const items = (data ?? []).flatMap((entry) => { const payload = Array.isArray(entry.vault_payloads) ? entry.vault_payloads[0] : entry.vault_payloads; if (!payload) return []; return [{ id: entry.id, ciphertext: asBase64(payload.ciphertext), nonce: asBase64(payload.nonce), aad: payload.aad, encryptionVersion: payload.encryption_version }]; });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Vault items are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = itemSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success || parsed.data.id !== parsed.data.aad.entryId) return NextResponse.json({ error: "加密資料無效。" }, { status: 400 });
  const nonce = Buffer.from(parsed.data.nonce, "base64"); if (nonce.length !== 12 || Buffer.from(parsed.data.ciphertext, "base64").length < 16) return NextResponse.json({ error: "加密資料無效。" }, { status: 400 });
  try {
    const admin = createAdminClient(); const { data: vault } = await admin.from("vaults").select("owner_id").eq("owner_id", context.userId).maybeSingle(); if (!vault) return NextResponse.json({ error: "請先建立 Vault。" }, { status: 409 }); const { error: entryError } = await admin.from("entries").insert({ id: parsed.data.id, owner_id: context.userId, kind: "vault_item", security_level: "vault", title: "Private Vault record", description: null }); if (entryError) throw entryError;
    const { error: payloadError } = await admin.from("vault_payloads").insert({ entry_id: parsed.data.id, ciphertext: asBytea(parsed.data.ciphertext), nonce: asBytea(parsed.data.nonce), aad: parsed.data.aad, encryption_version: 1 });
    if (payloadError) { await admin.from("entries").delete().eq("id", parsed.data.id).eq("owner_id", context.userId); throw payloadError; }
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "vault_item_created", entry_id: parsed.data.id, metadata: { encryption_version: 1 }, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "無法儲存保管庫項目。" }, { status: 503 }); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try { const admin = createAdminClient(); const { data, error } = await admin.from("entries").delete().eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "vault_item").select("id").maybeSingle(); if (error) throw error; if (!data) return NextResponse.json({ error: "找不到項目。" }, { status: 404 }); await admin.from("audit_logs").insert({ owner_id: context.userId, action: "vault_item_deleted", metadata: {}, ip_hash: context.ipHash }); return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } }); } catch { return NextResponse.json({ error: "無法刪除保管庫項目。" }, { status: 503 }); }
}
