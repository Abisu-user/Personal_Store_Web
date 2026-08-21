import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCoverUploadTicket } from "@/lib/security/cover-upload-ticket";

export type ContentKind = "note" | "code" | "file" | "photo";

export async function validateContentFolder(ownerId: string, kind: ContentKind, folderId: string | null | undefined) {
  if (!folderId) return true;
  const { data } = await createAdminClient().from("content_folders").select("id").eq("id", folderId).eq("owner_id", ownerId).eq("content_kind", kind).maybeSingle();
  return Boolean(data);
}

export function verifiedCoverPath(ownerId: string, ticket: string | null | undefined) {
  if (!ticket) return null;
  const cover = verifyCoverUploadTicket(ticket);
  if (!cover || cover.ownerId !== ownerId || !cover.storagePath.startsWith(`${ownerId}/covers/`)) return undefined;
  return cover.storagePath;
}

export async function deleteCover(path: string | null | undefined) {
  if (path) await createAdminClient().storage.from("content-covers").remove([path]);
}
