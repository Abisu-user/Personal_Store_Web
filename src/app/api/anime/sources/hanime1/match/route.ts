import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { matchHAnime1Batch } from "@/lib/anime/hanime1-service";
import { getSecurityContext } from "@/lib/security/activity";
import { hasAdultContentAccess } from "@/lib/security/adult-content";
import type { ExternalAnime } from "@/lib/anime/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const nullableText = z.string().trim().max(500).nullable().optional();
const itemSchema = z.object({
  id: z.string().trim().min(1).max(500),
  source: z.enum(["anilist", "jikan", "bangumi"]),
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
const payloadSchema = z.object({ items: z.array(itemSchema).min(1).max(24) });

export async function POST(request: NextRequest) {
  const security = await getSecurityContext();
  if (!security) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAdultContentAccess(security.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "無法確認成人作品來源。" }, { status: 400 });
  const matches = await matchHAnime1Batch(parsed.data.items as ExternalAnime[]);
  return NextResponse.json({
    matches: parsed.data.items.map((anime) => ({
      id: anime.id,
      availability: matches.get(anime.id),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
