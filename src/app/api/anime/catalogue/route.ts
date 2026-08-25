import { NextRequest, NextResponse } from "next/server";
import { getCatalogue, getCatalogueTaxonomy, getDiscoveryHome, type CatalogueFilters } from "@/lib/anime/anilist-catalogue";
import { getSecurityContext } from "@/lib/security/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const seasons = new Set(["WINTER", "SPRING", "SUMMER", "FALL"]);
const formats = new Set(["TV", "MOVIE", "OVA", "ONA", "SPECIAL"]);
const statuses = new Set(["RELEASING", "FINISHED", "NOT_YET_RELEASED"]);
const sorts = new Set(["POPULARITY_DESC", "SCORE_DESC", "START_DATE_DESC", "NEXT_AIRING_EPISODE_DESC", "TITLE_ROMAJI", "FAVOURITES_DESC"]);
const safeValue = (value: string | null, accepted: Set<string>) => value && accepted.has(value) ? value : undefined;
const positive = (value: string | null, fallback: number) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; };

export async function GET(request: NextRequest) {
  if (!(await getSecurityContext())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  if (params.get("view") === "home") {
    try { return NextResponse.json(await getDiscoveryHome(), { headers: { "Cache-Control": "private, max-age=900" } }); }
    catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "無法取得探索動漫。" }, { status: 503 }); }
  }
  if (params.get("resource") === "taxonomy") {
    try { return NextResponse.json(await getCatalogueTaxonomy(), { headers: { "Cache-Control": "private, max-age=3600" } }); }
    catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "無法取得動漫分類。" }, { status: 503 }); }
  }
  const season = safeValue(params.get("season"), seasons) as CatalogueFilters["season"];
  const format = safeValue(params.get("format"), formats) as CatalogueFilters["format"];
  const status = safeValue(params.get("status"), statuses) as CatalogueFilters["status"];
  const sort = safeValue(params.get("sort"), sorts) as CatalogueFilters["sort"];
  const clean = (value: string | null) => value?.trim().slice(0, 80) || undefined;
  const filters: CatalogueFilters = { page: positive(params.get("page"), 1), perPage: Math.min(30, positive(params.get("perPage"), 20)), season, seasonYear: params.get("seasonYear") ? positive(params.get("seasonYear"), new Date().getFullYear()) : undefined, genre: clean(params.get("genre")), tag: clean(params.get("tag")), format, status, sort };
  try {
    return NextResponse.json(await getCatalogue(filters), { headers: { "Cache-Control": "private, max-age=900" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "無法取得動漫資料。" }, { status: 503 });
  }
}
