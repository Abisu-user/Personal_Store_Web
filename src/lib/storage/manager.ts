import type { SignedDownloadOptions, SignedUploadOptions, StorageBody, StorageListOptions, StorageProvider, StorageUploadOptions } from "./provider";

/** One entry point for features; no provider selection, path rewriting or retries in feature code. */
export class StorageManager implements StorageProvider {
  private readonly provider: StorageProvider;

  constructor(provider: StorageProvider) {
    this.provider = provider;
  }

  upload(bucket: string, path: string, body: StorageBody, options?: StorageUploadOptions) {
    return this.provider.upload(bucket, path, body, options);
  }

  uploadToSignedUrl(bucket: string, path: string, token: string, body: StorageBody, options?: StorageUploadOptions) {
    return this.provider.uploadToSignedUrl(bucket, path, token, body, options);
  }

  createSignedUploadUrl(bucket: string, path: string, options?: SignedUploadOptions) {
    return this.provider.createSignedUploadUrl(bucket, path, options);
  }

  getSignedUrl(bucket: string, path: string, expiresIn: number, options?: SignedDownloadOptions) {
    return this.provider.getSignedUrl(bucket, path, expiresIn, options);
  }

  download(bucket: string, path: string) {
    return this.provider.download(bucket, path);
  }

  delete(bucket: string, paths: string[]) {
    return this.provider.delete(bucket, paths);
  }

  head(bucket: string, path: string) {
    return this.provider.head(bucket, path);
  }

  list(bucket: string, prefix: string, options?: StorageListOptions) {
    return this.provider.list(bucket, prefix, options);
  }

  listBuckets() {
    return this.provider.listBuckets();
  }
}
