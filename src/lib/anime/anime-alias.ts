import OpenCC from "opencc-js";

const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });
const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });

export type AnimeAlias = {
  id?: string;
  alias: string;
  language: string;
  source: string;
  scope: "global" | "user";
  isVerified: boolean;
};

/** Search keys are script-insensitive; the original alias is never changed. */
export function normalizeAnimeAlias(value: string) {
  return toSimplified(value.normalize("NFKC").trim().toLocaleLowerCase())
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

export function traditionalAnimeTitle(value: string) {
  return toTraditional(value);
}

export function animeAliasLanguage(value: string): string {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) return "ja";
  if (/\p{Script=Han}/u.test(value))
    return toTraditional(value) === value ? "zh-Hant" : "zh-Hans";
  return "und";
}

type TitleInput = {
  title?: string | null;
  customTitle?: string | null;
  titleIsCustom?: boolean | null;
  externalSource?: string | null;
  aliases?: AnimeAlias[];
  titleChinese?: string | null;
  titleEnglish?: string | null;
  originalTitle?: string | null;
  titleUserPreferred?: string | null;
  titleJapanese?: string | null;
};

const clean = (value: string | null | undefined) => value?.trim() || null;

export function resolveAnimeDisplayTitle(input: TitleInput): string {
  const original = clean(input.title);
  const custom = clean(input.customTitle);
  if (custom) return custom;
  const metadataTitles = [input.titleChinese, input.titleEnglish, input.originalTitle, input.titleJapanese]
    .map(clean).filter(Boolean);
  const legacyCustom = input.titleIsCustom == null && original &&
    (input.externalSource === "manual" || !metadataTitles.some((item) => item === original));
  if (input.titleIsCustom === true || legacyCustom) return original!;

  const aliases = input.aliases ?? [];
  const pick = (predicate: (item: AnimeAlias) => boolean) =>
    aliases.find((item) => predicate(item) && clean(item.alias))?.alias ?? null;
  const userChinese = pick((item) => item.scope === "user" && item.language === "zh-Hant");
  const verifiedTraditional = pick((item) => item.isVerified && item.language === "zh-Hant");
  const verifiedSimplified = pick((item) => item.isVerified && item.language === "zh-Hans");
  return clean(userChinese) ?? clean(verifiedTraditional) ??
    (verifiedSimplified ? traditionalAnimeTitle(verifiedSimplified) : null) ??
    clean(input.titleChinese) ?? clean(input.titleEnglish) ??
    clean(input.originalTitle) ?? clean(input.titleUserPreferred) ??
    original ?? clean(input.titleJapanese) ?? "未命名動漫";
}

export function animeAliasMatchRank(query: string, alias: string) {
  const needle = normalizeAnimeAlias(query);
  const key = normalizeAnimeAlias(alias);
  if (!needle || !key) return 0;
  if (alias.trim().normalize("NFKC").toLocaleLowerCase() === query.trim().normalize("NFKC").toLocaleLowerCase()) return 5;
  if (key === needle) return 4;
  if (key.startsWith(needle)) return 3;
  if (needle.length >= 2 && key.includes(needle)) return 1;
  return 0;
}
