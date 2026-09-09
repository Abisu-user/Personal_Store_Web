import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ActivateStorageObject,
  CreatePendingStorageObject,
  StorageMetadataWriter,
  StorageObjectMetadata,
  StorageObjectStatus,
  StorageProviderName,
} from "./metadata-contract";

const metadataColumns = "id,user_id,provider,bucket,object_key,category,byte_size,mime_type,checksum,status,created_at,updated_at,deleted_at,reservation_expires_at,cleanup_claimed_at,cleanup_attempts,cleanup_last_error";

type StorageObjectRow = {
  id: string;
  user_id: string;
  provider: StorageProviderName;
  bucket: string;
  object_key: string;
  category: string;
  byte_size: number | string | null;
  mime_type: string | null;
  checksum: string | null;
  status: StorageObjectStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  reservation_expires_at: string | null;
  cleanup_claimed_at: string | null;
  cleanup_attempts: number | string;
  cleanup_last_error: string | null;
};

function toMetadata(value: unknown): StorageObjectMetadata {
  const row = value as StorageObjectRow;
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    bucket: row.bucket,
    objectKey: row.object_key,
    category: row.category,
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    mimeType: row.mime_type,
    checksum: row.checksum,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    reservationExpiresAt: row.reservation_expires_at,
    cleanupClaimedAt: row.cleanup_claimed_at,
    cleanupAttempts: Number(row.cleanup_attempts ?? 0),
    cleanupLastError: row.cleanup_last_error,
  };
}

function validateOwnedInput(userId: string, objectKey: string) {
  if (!userId || !objectKey.startsWith(`${userId}/`)) {
    throw new Error("Storage metadata must stay inside the authenticated account prefix.");
  }
}

export class SupabaseStorageMetadataRepository implements StorageMetadataWriter {
  constructor(private readonly client: SupabaseClient) {}

  async createPending(input: CreatePendingStorageObject) {
    validateOwnedInput(input.userId, input.objectKey);
    const { data, error } = await this.client.from("storage_objects").insert({
      user_id: input.userId,
      provider: input.provider,
      bucket: input.bucket,
      object_key: input.objectKey,
      category: input.category,
      byte_size: input.byteSize ?? null,
      mime_type: input.mimeType ?? null,
      checksum: input.checksum ?? null,
      status: "pending",
    }).select(metadataColumns).single();
    if (error || !data) throw error ?? new Error("Storage metadata was not created.");
    return toMetadata(data);
  }

  async reservePending(input: CreatePendingStorageObject, ttlSeconds = 3600) {
    validateOwnedInput(input.userId, input.objectKey);
    const { data, error } = await this.client.rpc("vault_reserve_storage_object", {
      target_user_id: input.userId,
      target_provider: input.provider,
      target_bucket: input.bucket,
      target_object_key: input.objectKey,
      target_category: input.category,
      reserved_byte_size: input.byteSize,
      target_mime_type: input.mimeType ?? null,
      target_checksum: input.checksum ?? null,
      reservation_ttl_seconds: ttlSeconds,
    }).single();
    if (error || !data) throw error ?? new Error("Storage capacity was not reserved.");
    return toMetadata(data);
  }

  async activateOwned(input: ActivateStorageObject) {
    const { data, error } = await this.client.rpc("vault_activate_storage_object", {
      target_id: input.id,
      target_user_id: input.userId,
      actual_byte_size: input.byteSize,
      target_mime_type: input.mimeType ?? null,
      target_checksum: input.checksum ?? null,
    }).single();
    if (error || !data) throw error ?? new Error("Owned pending Storage metadata was not found.");
    return toMetadata(data);
  }

  async findOwnedActive(id: string, userId: string) {
    const { data, error } = await this.client.from("storage_objects").select(metadataColumns)
      .eq("id", id).eq("user_id", userId).eq("status", "active").is("deleted_at", null).maybeSingle();
    if (error) throw error;
    return data ? toMetadata(data) : null;
  }

  async findOwnedPending(id: string, userId: string) {
    const { data, error } = await this.client.from("storage_objects").select(metadataColumns)
      .eq("id", id).eq("user_id", userId).eq("status", "pending").is("deleted_at", null).maybeSingle();
    if (error) throw error;
    return data ? toMetadata(data) : null;
  }

  async markFailed(id: string, userId: string) {
    const { error } = await this.client.from("storage_objects").update({
      status: "failed",
      reservation_expires_at: null,
      cleanup_claimed_at: null,
    })
      .eq("id", id).eq("user_id", userId).eq("status", "pending").is("deleted_at", null);
    if (error) throw error;
  }

  async claimExpired(limit = 25) {
    const { data, error } = await this.client.rpc("vault_claim_expired_storage_objects", { batch_size: limit });
    if (error) throw error;
    return Array.isArray(data) ? data.map(toMetadata) : [];
  }

  async finishCleanup(id: string, succeeded: boolean, failureReason?: string | null) {
    const { data, error } = await this.client.rpc("vault_finish_storage_cleanup", {
      target_id: id,
      deletion_succeeded: succeeded,
      failure_reason: failureReason ?? null,
    }).single();
    if (error || !data) throw error ?? new Error("Storage cleanup claim was not completed.");
    return toMetadata(data);
  }
}

export function createStorageMetadataRepository(client: SupabaseClient = createAdminClient()) {
  return new SupabaseStorageMetadataRepository(client);
}
