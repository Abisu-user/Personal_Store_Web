import type { ReviewRating, VocabularyCard, VocabularyStatus } from "@/lib/vocabulary/types";

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
