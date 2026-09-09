import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  SignedDownloadOptions,
  SignedUploadOptions,
  StorageBody,
  StorageListItem,
  StorageListOptions,
  StorageObjectInfo,
  StorageProvider,
  StorageResult,
  StorageUploadOptions,
} from "./provider";

export type R2StorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

type R2Client = Pick<S3Client, "send">;
type R2Signer = typeof getSignedUrl;

function resultError(cause: unknown): StorageResult<never> {
  return { data: null, error: cause instanceof Error ? cause : new Error("R2 request failed.") };
}

async function bodyBytes(body: StorageBody) {
  return body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : new Uint8Array(body);
}

function contentDisposition(download: string | boolean | undefined) {
  if (!download) return undefined;
  const filename = typeof download === "string" ? download.replace(/[\r\n"]/g, "_") : "download";
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export class R2StorageProvider implements StorageProvider {
  private readonly client: R2Client;
  private readonly signingClient: S3Client;
  private readonly signer: R2Signer;
  private readonly configuredBucket: string;

  constructor(config: R2StorageConfig, dependencies?: { client?: R2Client; signer?: R2Signer }) {
    if (!/^[a-f0-9]{32}$/i.test(config.accountId)) throw new Error("R2_ACCOUNT_ID is invalid.");
    if (!config.accessKeyId || !config.secretAccessKey) throw new Error("R2 API credentials are missing.");
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)) throw new Error("R2_BUCKET_NAME is invalid.");
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.client = dependencies?.client ?? client;
    this.signingClient = client;
    this.signer = dependencies?.signer ?? getSignedUrl;
    this.configuredBucket = config.bucket;
  }

  private bucket(name: string) {
    if (name !== this.configuredBucket) throw new Error("R2 bucket is outside the configured provider scope.");
    return name;
  }

  async upload(bucket: string, path: string, body: StorageBody, options?: StorageUploadOptions) {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket(bucket),
        Key: path,
        Body: await bodyBytes(body),
        ContentType: options?.contentType,
        CacheControl: options?.cacheControl,
      }));
      return { data: { path }, error: null };
    } catch (cause) { return resultError(cause); }
  }

  async uploadToSignedUrl(bucket: string, path: string, signedUrl: string, body: StorageBody, options?: StorageUploadOptions) {
    try {
      this.bucket(bucket);
      const response = await fetch(signedUrl, {
        method: "PUT",
        headers: options?.contentType ? { "Content-Type": options.contentType } : undefined,
        body: await bodyBytes(body),
      });
      if (!response.ok) throw new Error(`R2 signed upload failed with HTTP ${response.status}.`);
      return { data: { path }, error: null };
    } catch (cause) { return resultError(cause); }
  }

  async createSignedUploadUrl(bucket: string, path: string, options?: SignedUploadOptions) {
    try {
      const headers = {
        ...(options?.contentType ? { "Content-Type": options.contentType } : {}),
        ...(options?.checksumSha256 ? { "x-amz-meta-sha256": options.checksumSha256 } : {}),
      };
      const signedUrl = await this.signer(this.signingClient, new PutObjectCommand({
        Bucket: this.bucket(bucket), Key: path, ContentType: options?.contentType,
        Metadata: options?.checksumSha256 ? { sha256: options.checksumSha256 } : undefined,
      }), {
        expiresIn: 600,
        unhoistableHeaders: new Set(["x-amz-meta-sha256"]),
      });
      return { data: { path, token: signedUrl, signedUrl, headers }, error: null };
    } catch (cause) { return resultError(cause); }
  }

  async getSignedUrl(bucket: string, path: string, expiresIn: number, options?: SignedDownloadOptions) {
    try {
      const signedUrl = await this.signer(this.signingClient, new GetObjectCommand({
        Bucket: this.bucket(bucket),
        Key: path,
        ResponseContentDisposition: contentDisposition(options?.download),
      }), { expiresIn });
      return { data: { signedUrl }, error: null };
    } catch (cause) { return resultError(cause); }
  }

  async download(bucket: string, path: string) {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(bucket), Key: path }));
      if (!response.Body) throw new Error("R2 object body is missing.");
      const bytes = await response.Body.transformToByteArray();
      const copy = Uint8Array.from(bytes);
      return { data: new Blob([copy.buffer], { type: response.ContentType ?? "application/octet-stream" }), error: null };
    } catch (cause) { return resultError(cause); }
  }

  async delete(bucket: string, paths: string[]) {
    if (!paths.length) return { data: [], error: null };
    try {
      const response = await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket(bucket),
        Delete: { Objects: paths.map((Key) => ({ Key })), Quiet: false },
      }));
      if (response.Errors?.length) throw new Error(response.Errors.map((item) => `${item.Key ?? "unknown"}: ${item.Message ?? item.Code ?? "delete failed"}`).join("; "));
      const deleted = (response.Deleted ?? paths.map((Key) => ({ Key }))).flatMap((item) => item.Key ? [{ id: null, name: item.Key }] : []);
      return { data: deleted, error: null };
    } catch (cause) { return resultError(cause); }
  }

  async head(bucket: string, path: string): Promise<StorageResult<StorageObjectInfo>> {
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket(bucket), Key: path }));
      return { data: {
        name: path,
        byteSize: response.ContentLength ?? null,
        contentType: response.ContentType ?? null,
        etag: response.ETag ?? null,
        lastModified: response.LastModified?.toISOString() ?? null,
        checksumSha256: response.Metadata?.sha256 ?? null,
      }, error: null };
    } catch (cause) { return resultError(cause); }
  }

  async list(bucket: string, prefix: string, options?: StorageListOptions) {
    try {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket(bucket),
        Prefix: prefix ? `${prefix.replace(/\/$/, "")}/` : undefined,
        Delimiter: "/",
        MaxKeys: Math.min(1000, Math.max(1, (options?.limit ?? 100) + (options?.offset ?? 0))),
      }));
      const objects: StorageListItem[] = (response.Contents ?? []).flatMap((item) => item.Key ? [{ id: item.ETag ?? null, name: item.Key.split("/").at(-1) ?? item.Key }] : []);
      const folders: StorageListItem[] = (response.CommonPrefixes ?? []).flatMap((item) => item.Prefix ? [{ id: null, name: item.Prefix.replace(/\/$/, "").split("/").at(-1) ?? item.Prefix }] : []);
      const search = options?.search?.toLocaleLowerCase("en-US");
      const filtered = [...folders, ...objects].filter((item) => !search || item.name.toLocaleLowerCase("en-US").includes(search));
      const offset = options?.offset ?? 0;
      return { data: filtered.slice(offset, offset + (options?.limit ?? 100)), error: null };
    } catch (cause) { return resultError(cause); }
  }

  async listBuckets() {
    try {
      const response = await this.client.send(new ListBucketsCommand({}));
      const buckets = (response.Buckets ?? []).flatMap((item) => item.Name === this.configuredBucket ? [{ id: item.Name, name: item.Name }] : []);
      return { data: buckets, error: null };
    } catch (cause) { return resultError(cause); }
  }
}
