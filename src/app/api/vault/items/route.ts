import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";

const base64 = z.string().min(1).max(200_000).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const itemSchema = z.object({ id: z.string().uuid(), ciphertext: base64, nonce: base64, aad: z.object({ entryId: z.string().uuid(), version: z.literal(1) }), categoryId: z.string().uuid().nullable().optional() });
const deleteSchema = z.object({ id: z.string().uuid() });
const asBytea = (value: string) => `\\x${Buffer.from(value, "base64").toString("hex")}`;
const asBase64 = (value: unknown) => { if (typeof value !== "string" || !value.startsWith("\\x")) throw new Error("Invalid encrypted payload."); return Buffer.from(value.slice(2), "hex").toString("base64"); };

export const dynamic = "force-dynamic";
async function categoryExists(ownerId: string, categoryId: string | null | undefined) {
  if (!categoryId) return true;
  const { data, error } = await createAdminClient().from("categories").select("id").eq("id", categoryId).eq("owner_id", ownerId).eq("content_kind", "vault_item").maybeSingle();
  return !error && Boolean(data);
}
function parseItemPayload(input: unknown) {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success || parsed.data.id !== parsed.data.aad.entryId) return null;
  const nonce = Buffer.from(parsed.data.nonce, "base64");
  return nonce.length === 12 && Buffer.from(parsed.data.ciphertext, "base64").length >= 16 ? parsed.data : null;
}
export async function GET() {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await createAdminClient().from("entries").select("id, category_id, vault_payloads(ciphertext, nonce, aad, encryption_version)").eq("owner_id", context.userId).eq("kind", "vault_item").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100);
    if (error) throw error;
    const items = (data ?? []).flatMap((entry) => { const payload = Array.isArray(entry.vault_payloads) ? entry.vault_payloads[0] : entry.vault_payloads; if (!payload) return []; return [{ id: entry.id, categoryId: entry.category_id ?? null, ciphertext: asBase64(payload.ciphertext), nonce: asBase64(payload.nonce), aad: payload.aad, encryptionVersion: payload.encryption_version }]; });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Vault items are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = parseItemPayload(await request.json().catch(() => null)); if (!item) return NextResponse.json({ error: "加密資料無效。" }, { status: 400 });
  try {
    const admin = createAdminClient(); const { data: vault } = await admin.from("vaults").select("owner_id").eq("owner_id", context.userId).maybeSingle(); if (!vault) return NextResponse.json({ error: "請先建立 Vault。" }, { status: 409 }); if (!(await categoryExists(context.userId, item.categoryId ?? null))) return NextResponse.json({ error: "找不到指定的保管庫分類。" }, { status: 400 }); const { error: entryError } = await admin.from("entries").insert({ id: item.id, owner_id: context.userId, kind: "vault_item", security_level: "vault", title: "Private Vault record", description: null, category_id: item.categoryId ?? null }); if (entryError) throw entryError;
    const { error: payloadError } = await admin.from("vault_payloads").insert({ entry_id: item.id, ciphertext: asBytea(item.ciphertext), nonce: asBytea(item.nonce), aad: item.aad, encryption_version: 1 });
    if (payloadError) { await admin.from("entries").delete().eq("id", item.id).eq("owner_id", context.userId); throw payloadError; }
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "vault_item_created", entry_id: item.id, metadata: { encryption_version: 1 }, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "無法儲存保管庫項目。" }, { status: 503 }); }
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const item = parseItemPayload(await request.json().catch(() => null)); if (!item) return NextResponse.json({ error: "加密資料無效。" }, { status: 400 });
  try {
    if (!(await categoryExists(context.userId, item.categoryId ?? null))) return NextResponse.json({ error: "找不到指定的保管庫分類。" }, { status: 400 });
    const admin = createAdminClient(); const { data: existingEntry, error: existingEntryError } = await admin.from("entries").select("id, category_id").eq("id", item.id).eq("owner_id", context.userId).eq("kind", "vault_item").maybeSingle(); if (existingEntryError) throw existingEntryError; if (!existingEntry) return NextResponse.json({ error: "找不到項目。" }, { status: 404 });
    const { data: previousPayload, error: previousPayloadError } = await admin.from("vault_payloads").select("ciphertext, nonce, aad, encryption_version").eq("entry_id", item.id).maybeSingle(); if (previousPayloadError) throw previousPayloadError; if (!previousPayload) return NextResponse.json({ error: "找不到加密資料。" }, { status: 404 });
    const { data: payload, error: payloadError } = await admin.from("vault_payloads").update({ ciphertext: asBytea(item.ciphertext), nonce: asBytea(item.nonce), aad: item.aad, encryption_version: 1 }).eq("entry_id", item.id).select("entry_id").maybeSingle(); if (payloadError) throw payloadError; if (!payload) return NextResponse.json({ error: "找不到加密資料。" }, { status: 404 });
    const { data: entry, error: entryError } = await admin.from("entries").update({ category_id: item.categoryId ?? null }).eq("id", item.id).eq("owner_id", context.userId).eq("kind", "vault_item").select("id").maybeSingle(); if (entryError || !entry) { await admin.from("vault_payloads").update(previousPayload).eq("entry_id", item.id); if (entryError) throw entryError; return NextResponse.json({ error: "找不到項目。" }, { status: 404 }); }
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "vault_item_updated", entry_id: item.id, metadata: { encryption_version: 1 }, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "無法更新保管庫項目。" }, { status: 503 }); }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const parsed = deleteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try { const admin = createAdminClient(); const { data, error } = await admin.from("entries").delete().eq("id", parsed.data.id).eq("owner_id", context.userId).eq("kind", "vault_item").select("id").maybeSingle(); if (error) throw error; if (!data) return NextResponse.json({ error: "找不到項目。" }, { status: 404 }); await admin.from("audit_logs").insert({ owner_id: context.userId, action: "vault_item_deleted", metadata: {}, ip_hash: context.ipHash }); return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } }); } catch { return NextResponse.json({ error: "無法刪除保管庫項目。" }, { status: 503 }); }
}
