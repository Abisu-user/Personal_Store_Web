/** Provider-neutral contracts. Stored paths and existing HTTP DTOs stay unchanged. */
export type StorageResult<T> = { data: T; error: null } | { data: null; error: Error };
export type StorageBody = Blob | ArrayBuffer;
export type StorageUploadOptions = { contentType?: string; cacheControl?: string; upsert?: boolean };
export type SignedUploadOptions = { contentType?: string; checksumSha256?: string };
export type StorageListOptions = {
  limit?: number;
  offset?: number;
  search?: string;
  sortBy?: { column?: string; order?: string };
};
export type StorageListItem = { name: string; id: string | null };
export type StorageBucket = { id: string; name: string };
export type StorageObjectInfo = {
  name: string;
  byteSize: number | null;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  checksumSha256: string | null;
};
export type SignedUpload = { path: string; token: string; signedUrl: string; headers?: Record<string, string> };
export type SignedDownloadOptions = { download?: string | boolean };

/** Authorization, quota and upload finalization remain in the existing server routes. */
export interface StorageProvider {
  upload(bucket: string, path: string, body: StorageBody, options?: StorageUploadOptions): Promise<StorageResult<{ path: string }>>;
  uploadToSignedUrl(bucket: string, path: string, token: string, body: StorageBody, options?: StorageUploadOptions): Promise<StorageResult<{ path: string }>>;
  createSignedUploadUrl(bucket: string, path: string, options?: SignedUploadOptions): Promise<StorageResult<SignedUpload>>;
  getSignedUrl(bucket: string, path: string, expiresIn: number, options?: SignedDownloadOptions): Promise<StorageResult<{ signedUrl: string }>>;
  download(bucket: string, path: string): Promise<StorageResult<Blob>>;
  delete(bucket: string, paths: string[]): Promise<StorageResult<StorageListItem[]>>;
  head(bucket: string, path: string): Promise<StorageResult<StorageObjectInfo>>;
  list(bucket: string, prefix: string, options?: StorageListOptions): Promise<StorageResult<StorageListItem[]>>;
  listBuckets(): Promise<StorageResult<StorageBucket[]>>;
}
