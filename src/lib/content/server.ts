import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createB2StorageManager } from "@/lib/storage/b2-server";
import { createStorageMetadataRepository } from "@/lib/storage/metadata-repository";
import { createStorageManager } from "@/lib/storage/server";
import { verifyCoverUploadTicket } from "@/lib/security/cover-upload-ticket";

export type ContentKind = "note" | "code" | "file" | "photo";

export async function validateContentFolder(ownerId: string, kind: ContentKind, folderId: string | null | undefined) {
  if (!folderId) return true;
  const { data } = await createAdminClient().from("content_folders").select("id").eq("id", folderId).eq("owner_id", ownerId).eq("content_kind", kind).maybeSingle();
  return Boolean(data);
}

const storageObjectPrefix = "storage-object:";
const objectIdPattern = /^[0-9a-f-]{36}$/i;

export type VerifiedCover = { legacyPath: string | null; storageObjectId: string | null };

export function entryCoverFields(cover: VerifiedCover | null) {
  return { cover_image_path: cover?.legacyPath ?? null, cover_storage_object_id: cover?.storageObjectId ?? null };
}

export function animeCoverFields(cover: VerifiedCover | null) {
  return { cover_url: cover?.legacyPath ?? null, cover_storage_object_id: cover?.storageObjectId ?? null };
}

export function storedEntryCover(row: { cover_image_path?: string | null; cover_storage_object_id?: string | null }): VerifiedCover {
  return { legacyPath: row.cover_image_path ?? null, storageObjectId: row.cover_storage_object_id ?? null };
}

export function storedAnimeCover(ownerId: string, row: { cover_url?: string | null; cover_storage_object_id?: string | null }): VerifiedCover {
  const legacyPath = row.cover_url?.startsWith(`${ownerId}/covers/`) ? row.cover_url : null;
  return { legacyPath, storageObjectId: row.cover_storage_object_id ?? null };
}

export async function verifiedCover(ownerId: string, ticket: string | null | undefined): Promise<VerifiedCover | null | undefined> {
  if (!ticket) return null;
  if (ticket.startsWith(storageObjectPrefix)) {
    const storageObjectId = ticket.slice(storageObjectPrefix.length);
    if (!objectIdPattern.test(storageObjectId)) return undefined;
    const object = await createStorageMetadataRepository().findOwnedActive(storageObjectId, ownerId).catch(() => null);
    if (!object || object.provider !== "b2" || object.category !== "content-cover" || !object.objectKey.startsWith(`${ownerId}/content-cover/`)) return undefined;
    return { legacyPath: null, storageObjectId };
  }
  const cover = verifyCoverUploadTicket(ticket);
  if (!cover || cover.ownerId !== ownerId || !cover.storagePath.startsWith(`${ownerId}/covers/`)) return undefined;
  return { legacyPath: cover.storagePath, storageObjectId: null };
}

export async function deleteCover(ownerId: string, cover: VerifiedCover | null | undefined) {
  if (!cover) return;
  if (cover.storageObjectId) {
    const admin = createAdminClient();
    const object = await createStorageMetadataRepository(admin).findOwnedActive(cover.storageObjectId, ownerId);
    if (!object || object.provider !== "b2" || object.category !== "content-cover" || !object.objectKey.startsWith(`${ownerId}/content-cover/`)) return;
    const { error } = await createB2StorageManager().delete(object.bucket, [object.objectKey]);
    if (error) throw error;
    const { error: metadataError } = await admin.from("storage_objects").update({ status: "failed", deleted_at: new Date().toISOString(), reservation_expires_at: null }).eq("id", object.id).eq("user_id", ownerId).eq("status", "active");
    if (metadataError) throw metadataError;
    return;
  }
  if (cover.legacyPath?.startsWith(`${ownerId}/covers/`)) {
    const { error } = await createStorageManager().delete("content-covers", [cover.legacyPath]);
    if (error) throw error;
  }
}
