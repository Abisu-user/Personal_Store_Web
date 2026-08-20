import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecurityContext } from "@/lib/security/activity";

const initSchema = z.object({ salt: z.string().min(20).max(100), wrappedVaultKey: z.string().min(40).max(1000), wrappedKeyNonce: z.string().min(16).max(40), kdfParameters: z.object({ algorithm: z.literal("PBKDF2"), hash: z.literal("SHA-256"), iterations: z.number().int().min(300_000).max(1_000_000), keyLength: z.literal(256) }) });
function bytea(value: string) { return `\\x${Buffer.from(value, "base64").toString("hex")}`; }
function fromBytea(value: unknown) { if (typeof value !== "string" || !value.startsWith("\\x")) throw new Error("Invalid encrypted data."); return Buffer.from(value.slice(2), "hex").toString("base64"); }

export const dynamic = "force-dynamic";
export async function GET() {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await createAdminClient().from("vaults").select("kdf_salt, kdf_parameters, wrapped_vault_key, wrapped_key_nonce, encryption_version").eq("owner_id", context.userId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ initialized: false }, { headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ initialized: true, salt: fromBytea(data.kdf_salt), kdfParameters: data.kdf_parameters, wrappedVaultKey: fromBytea(data.wrapped_vault_key), wrappedKeyNonce: fromBytea(data.wrapped_key_nonce), encryptionVersion: data.encryption_version }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Vault is temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = initSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "保管庫加密參數無效。" }, { status: 400 });
  try {
    const salt = Buffer.from(parsed.data.salt, "base64"); const nonce = Buffer.from(parsed.data.wrappedKeyNonce, "base64"); const wrappedKey = Buffer.from(parsed.data.wrappedVaultKey, "base64");
    if (salt.length < 16 || nonce.length !== 12 || wrappedKey.length < 32) return NextResponse.json({ error: "保管庫加密參數無效。" }, { status: 400 });
    const admin = createAdminClient(); const { error } = await admin.from("vaults").insert({ owner_id: context.userId, kdf_salt: bytea(parsed.data.salt), kdf_parameters: parsed.data.kdfParameters, wrapped_vault_key: bytea(parsed.data.wrappedVaultKey), wrapped_key_nonce: bytea(parsed.data.wrappedKeyNonce), encryption_version: 1 });
    if (error?.code === "23505") return NextResponse.json({ error: "保管庫已建立。" }, { status: 409 }); if (error) throw error;
    await admin.from("audit_logs").insert({ owner_id: context.userId, action: "vault_initialized", metadata: { kdf: "PBKDF2", iterations: parsed.data.kdfParameters.iterations }, ip_hash: context.ipHash });
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "無法建立保管庫。" }, { status: 503 }); }
}
