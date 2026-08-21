"use client";

import { ChangeEvent, useEffect, useState } from "react";

export type CoverCrop = { x: number; y: number; zoom: number };
export type CoverSelection = { file: File; crop: CoverCrop } | null;

export function CoverImageField({ initialUrl, onChange }: { initialUrl?: string | null; onChange: (value: CoverSelection) => void }) {
  const [preview, setPreview] = useState(initialUrl ?? "");
  const [crop, setCrop] = useState<CoverCrop>({ x: 50, y: 50, zoom: 100 });
  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    const url = URL.createObjectURL(file); setPreview(url); onChange({ file, crop: { x: 50, y: 50, zoom: 100 } });
  }
  function change(key: keyof CoverCrop, value: number) { const next = { ...crop, [key]: value }; setCrop(next); const input = document.querySelector<HTMLInputElement>("[data-cover-file]"); const file = input?.files?.[0]; if (file) onChange({ file, crop: next }); }
  return <fieldset className="content-cover-field"><legend>封面圖片（選填）</legend><input accept="image/jpeg,image/png,image/webp" data-cover-file onChange={choose} type="file" />
    {preview && <><div aria-label="封面裁切預覽" className="content-cover-preview" style={{ backgroundImage: `url("${preview}")`, backgroundPosition: `${crop.x}% ${crop.y}%`, backgroundSize: `${crop.zoom}%` }} />
      <div className="cover-crop-controls"><label>水平<input max="100" min="0" onChange={(event) => change("x", Number(event.target.value))} type="range" value={crop.x} /></label><label>垂直<input max="100" min="0" onChange={(event) => change("y", Number(event.target.value))} type="range" value={crop.y} /></label><label>放大<input max="180" min="100" onChange={(event) => change("zoom", Number(event.target.value))} type="range" value={crop.zoom} /></label></div></>}
  </fieldset>;
}

export async function uploadCover(selection: CoverSelection) {
  if (!selection) return null;
  const { file, crop } = selection;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const url = URL.createObjectURL(file); const element = new Image(); element.onload = () => { URL.revokeObjectURL(url); resolve(element); }; element.onerror = reject; element.src = url; });
  const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 900;
  const context = canvas.getContext("2d"); if (!context) throw new Error("無法處理封面圖片。");
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * (crop.zoom / 100);
  const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) * (crop.x / 100), (canvas.height - height) * (crop.y / 100), width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .92)); if (!blob) throw new Error("無法處理封面圖片。");
  const ticketResponse = await fetch("/api/content-covers/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mimeType: "image/webp", byteSize: blob.size }) });
  const ticket = await ticketResponse.json().catch(() => null); if (!ticketResponse.ok || !ticket?.token) throw new Error(ticket?.error ?? "無法準備封面上傳。");
  const { createClient } = await import("@/lib/supabase/client"); const { error } = await createClient().storage.from("content-covers").uploadToSignedUrl(ticket.storagePath, ticket.token, blob, { contentType: "image/webp" }); if (error) throw error;
  return ticket.ticket as string;
}
