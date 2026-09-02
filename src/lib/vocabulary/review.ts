import type { ReviewRating, VocabularyAttemptResult, VocabularyCard, VocabularyStatus } from "@/lib/vocabulary/types";

const intervals = [1, 3, 7, 14, 30];

export function calculateReview(card: Pick<VocabularyCard, "masteryLevel" | "currentIntervalDays" | "consecutiveCorrect" | "learningStatus">, rating: ReviewRating, now = new Date()) {
  const oldMastery = card.masteryLevel;
  const oldInterval = card.currentIntervalDays;
  const isWrong = rating === "again";
  // 熟練度是使用者明確的學習判定，而不是一般表單可任意改動的數字。
  // 0 保留給從未測驗；五個學習按鈕穩定對應 1～5。
  const mastery = rating === "again" ? 1 : rating === "difficult" ? 2 : rating === "good" ? 3 : rating === "easy" ? 4 : 5;
  const consecutive = isWrong ? 0 : card.consecutiveCorrect + 1;
  const interval = rating === "again" ? 0 : rating === "difficult" ? 1 : rating === "mastered" ? 30 : intervals[Math.min(intervals.length - 1, Math.max(0, consecutive - 1))];
  const next = new Date(now);
  next.setDate(next.getDate() + (rating === "again" ? 0 : interval));
  const status: VocabularyStatus = rating === "mastered" || mastery >= 5 ? "mastered" : consecutive >= 2 ? "reviewing" : "learning";
  return { oldMastery, oldInterval, mastery, interval, consecutive, status, nextReviewAt: next.toISOString(), answerResult: !isWrong };
}

export const masteryLabels = ["尚未測驗", "完全不熟", "不熟", "普通", "熟悉", "已掌握"] as const;

type AdaptiveCard = Pick<VocabularyCard, "masteryLevel" | "currentLevel" | "currentIntervalDays" | "consecutiveCorrect" | "consecutiveWrong" | "learningStatus" | "totalAttempts" | "correctCount" | "wrongCount" | "recentResults">;
export type AdaptiveAttempt = { answerResult: boolean; durationMs?: number | null; occurrenceIndex?: number | null; mode?: "review" | "quiz" | null };

export function masteryLevelFor(totalAttempts: number, correctAttempts: number, consecutiveCorrect: number) {
  if (totalAttempts <= 0) return 0;
  if (correctAttempts <= 0) return 1;
  const rate = correctAttempts / totalAttempts;
  if (rate < 0.4) return 2;
  if (rate < 0.7) return 3;
  if (rate < 1) return 4;
  return totalAttempts >= 5 && consecutiveCorrect >= 5 ? 5 : 4;
}

function intervalFor(level: number, correct: boolean) {
  if (!correct) return 0;
  return [0, 1, 2, 4, 10, 30][level] ?? 1;
}

/**
 * The server is the only authority that derives mastery. UI submits an answer
 * outcome, never a user-chosen difficulty. Keeping the last 10 results gives
 * recent failures a direct effect on both scheduling and question weighting.
 */
export function calculateAdaptiveReview(card: AdaptiveCard, attempt: AdaptiveAttempt, now = new Date()) {
  const answerResult = attempt.answerResult;
  const totalAttempts = Math.max(card.totalAttempts ?? 0, card.correctCount + card.wrongCount, 0) + 1;
  const correctAttempts = Math.max(card.correctCount, 0) + (answerResult ? 1 : 0);
  const wrongAttempts = Math.max(card.wrongCount, 0) + (answerResult ? 0 : 1);
  const consecutiveCorrect = answerResult ? Math.max(card.consecutiveCorrect, 0) + 1 : 0;
  const consecutiveWrong = answerResult ? 0 : Math.max(card.consecutiveWrong, 0) + 1;
  const level = masteryLevelFor(totalAttempts, correctAttempts, consecutiveCorrect);
  const interval = intervalFor(level, answerResult);
  const next = new Date(now);
  next.setDate(next.getDate() + interval);
  const recentResult: VocabularyAttemptResult = { correct: answerResult, answeredAt: now.toISOString(), durationMs: Math.max(0, Math.round(attempt.durationMs ?? 0)) || null, occurrenceIndex: attempt.occurrenceIndex ?? null, mode: attempt.mode ?? null };
  const recentResults = [...(Array.isArray(card.recentResults) ? card.recentResults : []), recentResult].slice(-10);
  const status: VocabularyStatus = level === 5 ? "mastered" : totalAttempts >= 2 ? "reviewing" : "learning";
  return {
    oldMastery: card.masteryLevel,
    oldInterval: card.currentIntervalDays,
    mastery: level,
    interval,
    consecutiveCorrect,
    consecutiveWrong,
    totalAttempts,
    correctAttempts,
    wrongAttempts,
    correctRate: Number(((correctAttempts / totalAttempts) * 100).toFixed(2)),
    recentResults,
    status,
    nextReviewAt: next.toISOString(),
  };
}

/** Higher weight means more likely to be selected in smart test mode. */
export function adaptiveQuestionWeight(card: Pick<VocabularyCard, "totalAttempts" | "currentLevel" | "masteryLevel" | "recentResults" | "lastAnsweredAt" | "lastAnswerCorrect">, now = new Date()) {
  const attempts = Math.max(0, card.totalAttempts ?? 0);
  const level = card.currentLevel ?? card.masteryLevel ?? 0;
  let weight = attempts === 0 ? 9 : [0, 12, 8, 4.5, 2.2, 0.22][level] ?? 4;
  const recent = (card.recentResults ?? []).slice(-5);
  const recentWrong = recent.filter((item) => !item.correct).length;
  weight *= 1 + recentWrong * 0.42;
  if (recent.length >= 3 && recent.slice(-3).every((item) => !item.correct)) weight *= 1.8;
  if (card.lastAnswerCorrect === false) weight *= 1.35;
  const last = card.lastAnsweredAt ? new Date(card.lastAnsweredAt).getTime() : 0;
  const daysSince = last ? Math.max(0, (now.getTime() - last) / 86_400_000) : 14;
  // Long-unseen mastered words are still checked occasionally, without
  // competing with weak words until roughly a month has passed.
  weight *= 1 + Math.min(daysSince, 60) / (level === 5 ? 24 : 70);
  return Math.max(0.05, weight);
}

export function selectWeightedCards<T extends VocabularyCard>(cards: T[], count: number, now = new Date()) {
  const pool = [...cards];
  const selected: T[] = [];
  while (pool.length && selected.length < count) {
    const total = pool.reduce((sum, card) => sum + adaptiveQuestionWeight(card, now), 0);
    let cursor = Math.random() * total;
    let chosenIndex = pool.length - 1;
    for (let index = 0; index < pool.length; index += 1) {
      cursor -= adaptiveQuestionWeight(pool[index], now);
      if (cursor <= 0) { chosenIndex = index; break; }
    }
    selected.push(pool.splice(chosenIndex, 1)[0]);
  }
  return selected;
}
