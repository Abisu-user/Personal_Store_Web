import type { VocabularyCard } from "./types";
import { selectWeightedCards } from "./review";

export type StudyMode = "review" | "quiz";
export type StudyTimerMode = "none" | "countup" | "countdown";
export type StudyOrder = "sequential" | "random" | "jlpt";
export type StudyFilters = { language: string; query: string; deckId: string | null; mastery: number | null; kana: string | null };
export type QuizResult = { card: VocabularyCard; correct: boolean; answer: string; durationMs: number; occurrenceIndex: number };
export type QuizProgress = { index: number; answer: string; checked: boolean | null; skipped: boolean; results: QuizResult[]; startedAt: number; saveState: "idle" | "saving" | "saved" | "error"; saveError: string };
export type StudySession = { id: string; mode: StudyMode; cards: VocabularyCard[]; timerMode: StudyTimerMode; countdownMinutes: number; direction: "native" | "reverse"; order: StudyOrder; filters: StudyFilters; count: number; quizMode: "smart" | "equal"; includeMastered: boolean; hints: Record<string, string>; phase: "testing" | "saving" | "result"; elapsed: number; progress?: QuizProgress; savePromise?: Promise<void> };
export const hiragana = (value: string) => value.normalize("NFKC").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
/** Session is a memory-store record, not React state. Keep writes at this boundary. */
export function rememberQuizProgress(session: StudySession, progress: QuizProgress) {
  session.progress = progress;
  if (progress.index === session.cards.length && progress.saveState === "idle") session.phase = "saving";
}
/** Shared by every mount of the same quiz; retries only after a failed save. */
export function persistQuizSession(session: StudySession, save: () => Promise<void>) {
  if (session.progress?.saveState === "saved") return Promise.resolve();
  if (session.savePromise) return session.savePromise;
  if (!session.progress) throw new Error("測驗作答紀錄不存在。");
  session.phase = "saving";
  session.progress = { ...session.progress, saveState: "saving" };
  session.savePromise = Promise.resolve().then(save).then(() => {
    session.phase = "result";
    session.progress = { ...session.progress!, saveState: "saved", saveError: "" };
  }).catch((cause: unknown) => {
    session.progress = { ...session.progress!, saveState: "error", saveError: cause instanceof Error ? cause.message : "測驗結果暫時無法儲存，請再試一次。" };
  }).finally(() => { session.savePromise = undefined; });
  return session.savePromise;
}
export const quizMeaning = (card: VocabularyCard) => card.primaryTranslation || card.meanings[0]?.meaning || "";
const meaningKey = (value: string) => value.normalize("NFKC").split(/[、,，;；/／]/).map((s) => s.replace(/\s/g, "")).filter(Boolean).sort().join(";");
export function firstKana(card: VocabularyCard) {
  for (const value of [card.reading, card.kana, card.pronunciation, card.word]) {
    const normalized = hiragana(value || "").trim();
    if (/^[ぁ-ゖ]/.test(normalized)) return normalized.charAt(0);
  }
  return "";
}
export function ambiguousHints(cards: VocabularyCard[]) {
  const groups = new Map<string, Set<string>>();
  for (const card of cards) {
    if (card.language !== "ja") continue;
    const key = meaningKey(quizMeaning(card));
    if (!key) continue;
    const group = groups.get(key) || new Set<string>();
    group.add(hiragana(card.word).trim());
    groups.set(key, group);
  }
  return Object.fromEntries(cards.filter((card) => card.language === "ja" && (groups.get(meaningKey(quizMeaning(card)))?.size || 0) > 1).map((card) => [card.id, firstKana(card)]));
}
export function eligibleStudyCards(cards: VocabularyCard[], filters: StudyFilters, includeMastered: boolean) {
  return cards.filter((card) => !card.deletedAt && card.learningStatus !== "paused" && (includeMastered || card.currentLevel !== 5)
    && (filters.language === "all" || card.language === filters.language)
    && (!filters.deckId || card.deckIds.includes(filters.deckId))
    && (filters.mastery === null || card.currentLevel === filters.mastery)
    && (!filters.kana || firstKana(card) === filters.kana)
    && `${card.word} ${card.reading || ""} ${quizMeaning(card)} ${card.notes || ""} ${card.tags.map((tag) => tag.name).join(" ")}`.toLowerCase().includes(filters.query.trim().toLowerCase()));
}
export function shuffleCards<T>(cards: T[]) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function drawQuizCards(cards: VocabularyCard[], count: number, mode: "smart" | "equal", order: StudyOrder, previous: VocabularyCard[] = []) {
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  const previousIds = new Set(previous.map((card) => card.id));
  const fresh = unique.filter((card) => !previousIds.has(card.id));
  const take = (pool: VocabularyCard[], size: number) => mode === "smart" ? selectWeightedCards(pool, size) : shuffleCards(pool).slice(0, size);
  const size = Math.min(count, unique.length);
  // Prefer unseen words, but fill from the full eligible pool when necessary.
  let result = take(fresh, size);
  if (result.length < size) result.push(...take(unique.filter((card) => previousIds.has(card.id)), size - result.length));
  result = shuffleCards(result);
  if (order === "jlpt") result.sort((a, b) => (Number(b.jlptLevel?.slice(1)) || 0) - (Number(a.jlptLevel?.slice(1)) || 0));
  if (result.length > 1 && result.every((card, i) => card.id === previous[i]?.id)) {
    const j = order === "jlpt" ? result.findIndex((card, i) => i > 0 && card.jlptLevel === result[0].jlptLevel) : 1;
    if (j > 0) [result[0], result[j]] = [result[j], result[0]];
  }
  return result;
}
