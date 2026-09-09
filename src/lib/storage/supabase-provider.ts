import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignedDownloadOptions, StorageBody, StorageListOptions, StorageObjectInfo, StorageProvider, StorageResult, StorageUploadOptions } from "./provider";

/** Only this adapter knows the Supabase Storage SDK. Credentials are injected by the composition root. */
export class SupabaseStorageProvider implements StorageProvider {
  private readonly storage: SupabaseClient["storage"];

  constructor(storage: SupabaseClient["storage"]) {
    this.storage = storage;
  }

  upload(bucket: string, path: string, body: StorageBody, options?: StorageUploadOptions) {
    return this.storage.from(bucket).upload(path, body, options);
  }

  uploadToSignedUrl(bucket: string, path: string, token: string, body: StorageBody, options?: StorageUploadOptions) {
    return this.storage.from(bucket).uploadToSignedUrl(path, token, body, options);
  }

  createSignedUploadUrl(bucket: string, path: string) {
    return this.storage.from(bucket).createSignedUploadUrl(path);
  }

  getSignedUrl(bucket: string, path: string, expiresIn: number, options?: SignedDownloadOptions) {
    return this.storage.from(bucket).createSignedUrl(path, expiresIn, options);
  }

  async download(bucket: string, path: string) {
    return await this.storage.from(bucket).download(path);
  }

  delete(bucket: string, paths: string[]) {
    return this.storage.from(bucket).remove(paths);
  }

  async head(bucket: string, path: string): Promise<StorageResult<StorageObjectInfo>> {
    // Supabase's metadata-only endpoint avoids downloading the object body.
    const { data, error } = await this.storage.from(bucket).info(path);
    if (error) return { data: null, error };
    return {
      data: {
        name: data.name,
        byteSize: data.size ?? data.metadata?.size ?? null,
        contentType: data.contentType ?? data.metadata?.mimetype ?? null,
        etag: data.etag ?? data.metadata?.eTag ?? null,
        lastModified: data.lastModified ?? data.metadata?.lastModified ?? null,
        checksumSha256: null,
      },
      error: null,
    };
  }

  list(bucket: string, prefix: string, options?: StorageListOptions) {
    return this.storage.from(bucket).list(prefix, options);
  }

  listBuckets() {
    return this.storage.listBuckets();
  }
}
