"use client";

import { ChangeEvent, type CSSProperties, useEffect, useRef, useState } from "react";

export type CoverCrop = { x: number; y: number; zoom: number };
export type CoverSize = { width: number; height: number };
export type CoverSelection = { file: File; crop: CoverCrop; size?: CoverSize } | null;
const coverWidth = 1240;
const coverHeight = 880;
const allowedCoverMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const coverMimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export type CoverUploadStage = "decode" | "process" | "prepare" | "upload" | "finalize";

export class CoverUploadError extends Error {
  constructor(
    public readonly stage: CoverUploadStage,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CoverUploadError";
  }
}

function normalizedCoverFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extensionMime = coverMimeByExtension[extension] ?? null;
  const mime = file.type.toLowerCase().split(";", 1)[0].trim() || extensionMime;
  if (!mime || !allowedCoverMimeTypes.has(mime) || (extensionMime && extensionMime !== mime)) {
    throw new CoverUploadError("decode", "不支援此圖片格式。請使用 JPG、JPEG、PNG、WebP 或 AVIF。");
  }
  return file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

async function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("無法讀取封面圖片。"));
    image.src = source;
  });
}

function drawCover(image: HTMLImageElement, crop: CoverCrop, size: CoverSize = { width: coverWidth, height: coverHeight }) {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("無法處理封面圖片。");
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * (crop.zoom / 100);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) * (crop.x / 100), (canvas.height - height) * (crop.y / 100), width, height);
  return canvas;
}

export function CoverImageField({ initialUrl, onChange, onError, cropSize }: { initialUrl?: string | null; onChange: (value: CoverSelection) => void; onError?: (message: string) => void; cropSize?: CoverSize }) {
  const [sourceUrl, setSourceUrl] = useState(initialUrl ?? "");
  const [preview, setPreview] = useState(initialUrl ?? "");
  const [crop, setCrop] = useState<CoverCrop>({ x: 50, y: 50, zoom: 100 });
  const fileInput = useRef<HTMLInputElement>(null);
  const sourceFile = useRef<File | null>(null);
  useEffect(() => () => { if (sourceUrl.startsWith("blob:")) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);
  useEffect(() => {
    if (!sourceUrl) { setPreview(""); return; }
    let cancelled = false;
    void loadImage(sourceUrl).then((image) => {
      if (!cancelled) setPreview(drawCover(image, crop, cropSize).toDataURL("image/webp", .92));
    }).catch(() => { if (!cancelled) setPreview(sourceUrl); });
    return () => { cancelled = true; };
  }, [crop, sourceUrl]);
  useEffect(() => {
    if (!initialUrl || sourceUrl.startsWith("blob:")) return;
    let cancelled = false;
    void fetch(sourceUrl, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("無法讀取封面圖片。");
      const blob = await response.blob();
      if (!cancelled) sourceFile.current = new File([blob], "cover.webp", { type: blob.type || "image/webp" });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [initialUrl, sourceUrl]);
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]; if (!selected) return;
    try {
      const file = normalizedCoverFile(selected);
      sourceFile.current = file; setCrop({ x: 50, y: 50, zoom: 100 }); setSourceUrl(URL.createObjectURL(file)); onChange({ file, crop: { x: 50, y: 50, zoom: 100 }, size: cropSize });
    } catch (cause) {
      sourceFile.current = null;
      setSourceUrl("");
      setPreview("");
      event.target.value = "";
      onChange(null);
      onError?.(cause instanceof Error ? cause.message : "不支援此圖片格式。");
    }
  }
  async function selectCrop(next: CoverCrop) {
    let file = sourceFile.current ?? fileInput.current?.files?.[0] ?? null;
    if (!file && sourceUrl) {
      const response = await fetch(sourceUrl, { cache: "no-store" });
      if (response.ok) { const blob = await response.blob(); file = new File([blob], "cover.webp", { type: blob.type || "image/webp" }); sourceFile.current = file; }
    }
    if (file) onChange({ file, crop: next, size: cropSize });
  }
  function change(key: keyof CoverCrop, value: number) { const next = { ...crop, [key]: value }; setCrop(next); void selectCrop(next); }
  return <fieldset className="content-cover-field" style={cropSize ? { "--cover-preview-aspect": `${cropSize.width} / ${cropSize.height}` } as CSSProperties : undefined}><legend>封面圖片（選填）</legend><input accept="image/jpeg,image/png,image/webp,image/avif" data-cover-file onChange={choose} ref={fileInput} type="file" />
    {preview && <><div aria-label="封面裁切預覽" className="content-cover-preview"><img alt="封面裁切預覽" src={preview} /></div>
      <div className="cover-crop-controls"><label>水平<input max="100" min="0" onChange={(event) => change("x", Number(event.target.value))} type="range" value={crop.x} /></label><label>垂直<input max="100" min="0" onChange={(event) => change("y", Number(event.target.value))} type="range" value={crop.y} /></label><label>放大<input max="180" min="100" onChange={(event) => change("zoom", Number(event.target.value))} type="range" value={crop.zoom} /></label></div></>}
  </fieldset>;
}

export async function uploadCover(selection: CoverSelection) {
  if (!selection) return null;
  const { crop, size } = selection;
  const file = normalizedCoverFile(selection.file);
  const sourceUrl = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try {
    image = await loadImage(sourceUrl);
  } catch (cause) {
    console.error("[content-cover:decode] failed", { fileName: file.name, fileSize: file.size, fileType: file.type, cause });
    throw new CoverUploadError("decode", "無法讀取封面圖片，檔案可能已損壞。");
  } finally { URL.revokeObjectURL(sourceUrl); }
  let canvas: HTMLCanvasElement;
  try {
    canvas = drawCover(image, crop, size);
  } catch (cause) {
    console.error("[content-cover:process] draw failed", { fileName: file.name, fileSize: file.size, fileType: file.type, cause });
    throw new CoverUploadError("process", "圖片讀取成功，但無法處理裁切結果。");
  }
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .92));
  if (!blob || blob.type !== "image/webp") {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
  }
  if (!blob || !["image/webp", "image/jpeg"].includes(blob.type)) {
    console.error("[content-cover:process] encode failed", { fileName: file.name, fileSize: file.size, fileType: file.type, blobType: blob?.type ?? null });
    throw new CoverUploadError("process", "圖片讀取成功，但無法產生可上傳的封面。");
  }
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const ticketResponse = await fetch("/api/content-covers/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mimeType: blob.type,
      byteSize: blob.size,
      sha256,
      sourceFileName: file.name,
      sourceFileSize: file.size,
      sourceFileMime: file.type,
    }),
  });
  const ticket = await ticketResponse.json().catch(() => null);
  if (!ticketResponse.ok || !ticket?.ticket) {
    console.error("[content-cover:prepare] failed", { fileName: file.name, fileSize: file.size, fileType: file.type, processedSize: blob.size, processedType: blob.type, status: ticketResponse.status, error: ticket?.error ?? null });
    throw new CoverUploadError("prepare", ticket?.error ?? "圖片讀取成功，但無法準備上傳。", ticketResponse.status);
  }
  const uploadContext = { bucket: ticket.bucket ?? "content-covers", path: ticket.uploadPath ?? ticket.storagePath ?? null, fileName: file.name, fileSize: file.size, fileType: file.type, blobSize: blob.size, blobType: blob.type };
  if (ticket.provider === "b2") {
    if (!ticket.uploadUrl) throw new CoverUploadError("prepare", "圖片讀取成功，但無法準備上傳。");
    let upload: Response;
    try {
      upload = await fetch(ticket.uploadUrl, { method: ticket.method ?? "PUT", headers: ticket.headers ?? { "Content-Type": blob.type }, body: blob });
    } catch (cause) {
      console.error("[content-cover:upload] network failed", { ...uploadContext, cause });
      throw new CoverUploadError("upload", "圖片讀取成功，但上傳連線中斷，請重試。");
    }
    if (!upload.ok) {
      const responseText = await upload.text().catch(() => "");
      console.error("[content-cover:upload] B2 rejected upload", { ...uploadContext, status: upload.status, response: responseText.slice(0, 500) });
      throw new CoverUploadError("upload", "圖片讀取成功，但上傳失敗，請稍後再試。", upload.status);
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 250 * 2 ** (attempt - 1)));
      const finalizedResponse = await fetch("/api/storage/b2/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: ticket.ticket }) });
      const finalized = await finalizedResponse.json().catch(() => null);
      if (finalizedResponse.ok && typeof finalized?.storageObjectId === "string") return `storage-object:${finalized.storageObjectId}`;
      const retryable = finalizedResponse.status === 503 && attempt < 3;
      console.error("[content-cover:finalize] failed", { ...uploadContext, attempt: attempt + 1, status: finalizedResponse.status, error: finalized?.error ?? null, retryable });
      if (!retryable) throw new CoverUploadError("finalize", finalized?.error ?? "圖片已上傳，但無法確認儲存結果，請重試。", finalizedResponse.status);
    }
  }
  if (ticket.provider === "supabase" && ticket.storagePath && ticket.token) {
    const { createBrowserStorageManager } = await import("@/lib/storage/client");
    const { data, error } = await createBrowserStorageManager().uploadToSignedUrl("content-covers", ticket.storagePath, ticket.token, blob, { contentType: blob.type });
    if (error) {
      const storageError = error as Error & { status?: number; statusCode?: number | string };
      const status = storageError.status ?? (storageError.statusCode ? Number(storageError.statusCode) : undefined);
      console.error("[content-cover:upload] Supabase rejected upload", { ...uploadContext, storageResponse: data ?? null, error: { name: storageError.name, message: storageError.message, status, statusCode: storageError.statusCode } });
      throw new CoverUploadError("upload", "圖片讀取成功，但上傳失敗，請稍後再試。", status);
    }
    return ticket.ticket as string;
  }
  console.error("[content-cover:prepare] invalid storage response", uploadContext);
  throw new CoverUploadError("prepare", "封面儲存服務回應無效。");
}
