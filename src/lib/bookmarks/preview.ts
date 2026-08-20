import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type LinkPreview = { hostname: string; title: string | null; description: string | null; imageUrl: string | null; faviconUrl: string | null };

const cache = new Map<string, { expiresAt: number; preview: LinkPreview }>();
const maxHeadBytes = 256_000;
const previewTtlMs = 5 * 60 * 1000;

function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 100 && b >= 64 && b <= 127 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 198 && (b === 18 || b === 19) || a >= 224);
  }
  const normalized = address.toLowerCase();
  return !(normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.") || normalized.startsWith("::ffff:169.254."));
}

async function publicUrl(value: string) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Unsupported link target");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("Private link target");
  return url;
}

function clean(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const decoded = value.replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
  return decoded ? decoded.slice(0, maxLength) : null;
}

function attribute(tag: string, name: string) {
  const result = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return result?.[1] ?? result?.[2] ?? result?.[3] ?? null;
}

function metadata(html: string, names: string[]) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = (attribute(tag, "property") ?? attribute(tag, "name") ?? "").toLowerCase();
    if (names.includes(name)) return clean(attribute(tag, "content"), 500);
  }
  return null;
}

function imageFromLink(html: string) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attribute(tag, "rel") ?? "").toLowerCase();
    if (rel.split(/\s+/).includes("image_src")) return clean(attribute(tag, "href"), 2000);
  }
  return null;
}

function imageFromJsonLd(html: string) {
  for (const tag of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    const raw = tag.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    try {
      const data = JSON.parse(raw) as unknown;
      const values = Array.isArray(data) ? data : [data];
      for (const value of values) {
        if (!value || typeof value !== "object") continue;
        const image = (value as { image?: unknown }).image;
        if (typeof image === "string") return clean(image, 2000);
        if (image && typeof image === "object" && typeof (image as { url?: unknown }).url === "string") return clean((image as { url: string }).url, 2000);
      }
    } catch { /* Some sites emit incomplete JSON-LD; normal metadata remains available. */ }
  }
  return null;
}

function titleFromHtml(html: string) {
  const matched = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return clean(matched?.[1], 300);
}

function resolveHttpUrl(value: string | null, base: URL) {
  if (!value) return null;
  try { const resolved = new URL(value, base); return /^https?:$/.test(resolved.protocol) ? resolved.toString() : null; } catch { return null; }
}

function youtubeVideoId(source: URL) {
  const hostname = source.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname === "youtu.be") return source.pathname.split("/").filter(Boolean)[0] ?? null;
  if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(hostname)) return null;
  if (source.pathname === "/watch") return source.searchParams.get("v");
  const matched = /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(source.pathname);
  return matched?.[1] ?? null;
}

async function getYoutubePreview(source: URL): Promise<LinkPreview | null> {
  const videoId = youtubeVideoId(source);
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
  const fallback: LinkPreview = {
    hostname: "youtube.com",
    title: "YouTube 影片",
    description: null,
    imageUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    faviconUrl: "https://www.youtube.com/favicon.ico",
  };
  try {
    const oembed = new URL("https://www.youtube.com/oembed");
    oembed.searchParams.set("url", source.toString());
    oembed.searchParams.set("format", "json");
    const response = await fetch(oembed, { signal: AbortSignal.timeout(3500), headers: { Accept: "application/json" } });
    if (!response.ok) return fallback;
    const data = await response.json() as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
    return {
      hostname: "youtube.com",
      title: clean(typeof data.title === "string" ? data.title : null, 300) ?? fallback.title,
      description: clean(typeof data.author_name === "string" ? `YouTube · ${data.author_name}` : null, 500),
      imageUrl: typeof data.thumbnail_url === "string" && /^https:\/\//.test(data.thumbnail_url) ? data.thumbnail_url : fallback.imageUrl,
      faviconUrl: fallback.faviconUrl,
    };
  } catch { return fallback; }
}

async function readDocumentHead(response: Response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    received += next.value.byteLength;
    chunks.push(next.value);
    const text = new TextDecoder().decode(next.value);
    if (/<\/head\s*>/i.test(text) || received > maxHeadBytes) { await reader.cancel(); break; }
  }
  const bytes = new Uint8Array(received); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function fetchHtml(start: URL) {
  let target = start;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7", "User-Agent": "facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) return null;
      target = await publicUrl(new URL(location, target).toString());
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) return null;
    const html = await readDocumentHead(response);
    return html ? { html, url: target } : null;
  }
  return null;
}

export async function getLinkPreview(value: string): Promise<LinkPreview> {
  const source = await publicUrl(value);
  const cached = cache.get(source.toString());
  if (cached && cached.expiresAt > Date.now()) return cached.preview;
  const youtubePreview = await getYoutubePreview(source);
  if (youtubePreview) { cache.set(source.toString(), { preview: youtubePreview, expiresAt: Date.now() + previewTtlMs }); return youtubePreview; }
  const fallback: LinkPreview = { hostname: source.hostname.replace(/^www\./, ""), title: null, description: null, imageUrl: null, faviconUrl: new URL("/favicon.ico", source).toString() };
  try {
    const page = await fetchHtml(source);
    if (!page) return fallback;
    const preview: LinkPreview = {
      hostname: page.url.hostname.replace(/^www\./, ""),
      title: metadata(page.html, ["og:title", "twitter:title"]) ?? titleFromHtml(page.html),
      description: metadata(page.html, ["og:description", "twitter:description", "description"]),
      imageUrl: resolveHttpUrl(metadata(page.html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) ?? imageFromLink(page.html) ?? imageFromJsonLd(page.html), page.url),
      faviconUrl: new URL("/favicon.ico", page.url).toString(),
    };
    cache.set(source.toString(), { preview, expiresAt: Date.now() + previewTtlMs });
    return preview;
  } catch { return fallback; }
}
