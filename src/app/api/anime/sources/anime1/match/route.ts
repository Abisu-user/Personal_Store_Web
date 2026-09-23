import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnime1Index } from "@/lib/anime/anime1-index";
import { matchAnime1 } from "@/lib/anime/anime-title-matcher";
import { getSecurityContext } from "@/lib/security/activity";
import type { ExternalAnime } from "@/lib/anime/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const nullableText = z.string().trim().max(500).nullable().optional();
const itemSchema = z.object({
  id: z.string().regex(/^\d{1,12}$/),
  source: z.literal("anilist"),
  title: z.string().trim().min(1).max(500),
  titleChinese: nullableText,
  titleJapanese: nullableText,
  titleEnglish: nullableText,
  originalTitle: nullableText,
  titleUserPreferred: nullableText,
  synonyms: z.array(z.string().trim().min(1).max(500)).max(40).optional(),
  releaseYear: z.number().int().min(1900).max(2200).nullable().optional(),
  season: z.string().trim().max(30).nullable().optional(),
});
const payloadSchema = z.object({ items: z.array(itemSchema).min(1).max(30) });

export async function POST(request: NextRequest) {
  if (!(await getSecurityContext())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "無法確認外部來源。" }, { status: 400 });
  const index = await getAnime1Index();
  const matches = parsed.data.items.map((anime) => ({ id: anime.id, availability: matchAnime1(anime as ExternalAnime, index.rows, index.sourceAvailable) }));
  return NextResponse.json({ matches, stale: index.stale }, { headers: { "Cache-Control": "private, no-store" } });
}
