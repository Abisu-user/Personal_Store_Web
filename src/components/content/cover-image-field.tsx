"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

export type CoverCrop = { x: number; y: number; zoom: number };
export type CoverSelection = { file: File; crop: CoverCrop } | null;
const coverWidth = 1240;
const coverHeight = 880;

async function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("無法讀取封面圖片。"));
    image.src = source;
  });
}

function drawCover(image: HTMLImageElement, crop: CoverCrop) {
  const canvas = document.createElement("canvas");
  canvas.width = coverWidth;
  canvas.height = coverHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("無法處理封面圖片。");
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * (crop.zoom / 100);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) * (crop.x / 100), (canvas.height - height) * (crop.y / 100), width, height);
  return canvas;
}

export function CoverImageField({ initialUrl, onChange }: { initialUrl?: string | null; onChange: (value: CoverSelection) => void }) {
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
      if (!cancelled) setPreview(drawCover(image, crop).toDataURL("image/webp", .92));
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
    const file = event.target.files?.[0]; if (!file) return;
    sourceFile.current = file; setCrop({ x: 50, y: 50, zoom: 100 }); setSourceUrl(URL.createObjectURL(file)); onChange({ file, crop: { x: 50, y: 50, zoom: 100 } });
  }
  async function selectCrop(next: CoverCrop) {
    let file = sourceFile.current ?? fileInput.current?.files?.[0] ?? null;
    if (!file && sourceUrl) {
      const response = await fetch(sourceUrl, { cache: "no-store" });
      if (response.ok) { const blob = await response.blob(); file = new File([blob], "cover.webp", { type: blob.type || "image/webp" }); sourceFile.current = file; }
    }
    if (file) onChange({ file, crop: next });
  }
  function change(key: keyof CoverCrop, value: number) { const next = { ...crop, [key]: value }; setCrop(next); void selectCrop(next); }
  return <fieldset className="content-cover-field"><legend>封面圖片（選填）</legend><input accept="image/jpeg,image/png,image/webp" data-cover-file onChange={choose} ref={fileInput} type="file" />
    {preview && <><div aria-label="封面裁切預覽" className="content-cover-preview" style={{ backgroundImage: `url("${preview}")`, backgroundPosition: "center", backgroundSize: "cover" }} />
      <div className="cover-crop-controls"><label>水平<input max="100" min="0" onChange={(event) => change("x", Number(event.target.value))} type="range" value={crop.x} /></label><label>垂直<input max="100" min="0" onChange={(event) => change("y", Number(event.target.value))} type="range" value={crop.y} /></label><label>放大<input max="180" min="100" onChange={(event) => change("zoom", Number(event.target.value))} type="range" value={crop.zoom} /></label></div></>}
  </fieldset>;
}

export async function uploadCover(selection: CoverSelection) {
  if (!selection) return null;
  const { file, crop } = selection;
  const sourceUrl = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try { image = await loadImage(sourceUrl); } finally { URL.revokeObjectURL(sourceUrl); }
  const canvas = drawCover(image, crop);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .92)); if (!blob) throw new Error("無法處理封面圖片。");
  const ticketResponse = await fetch("/api/content-covers/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mimeType: "image/webp", byteSize: blob.size }) });
  const ticket = await ticketResponse.json().catch(() => null); if (!ticketResponse.ok || !ticket?.token) throw new Error(ticket?.error ?? "無法準備封面上傳。");
  const { createClient } = await import("@/lib/supabase/client"); const { error } = await createClient().storage.from("content-covers").uploadToSignedUrl(ticket.storagePath, ticket.token, blob, { contentType: "image/webp" }); if (error) throw error;
  return ticket.ticket as string;
}
