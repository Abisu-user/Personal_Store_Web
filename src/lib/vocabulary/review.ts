import type { ReviewRating, VocabularyCard, VocabularyStatus } from "@/lib/vocabulary/types";

const intervals = [1, 3, 7, 14, 30];

export function calculateReview(card: Pick<VocabularyCard, "masteryLevel" | "currentIntervalDays" | "consecutiveCorrect" | "learningStatus">, rating: ReviewRating, now = new Date()) {
  const oldMastery = card.masteryLevel;
  const oldInterval = card.currentIntervalDays;
  const isWrong = rating === "again";
  const mastery = rating === "again" ? Math.max(0, oldMastery - 1) : rating === "difficult" ? Math.max(1, oldMastery) : rating === "good" ? Math.min(5, oldMastery + 1) : Math.min(5, oldMastery + (rating === "mastered" ? 2 : 1));
  const consecutive = isWrong ? 0 : card.consecutiveCorrect + 1;
  const interval = rating === "again" ? 0 : rating === "difficult" ? 1 : rating === "mastered" ? 30 : intervals[Math.min(intervals.length - 1, Math.max(0, consecutive - 1))];
  const next = new Date(now);
  next.setDate(next.getDate() + (rating === "again" ? 0 : interval));
  const status: VocabularyStatus = rating === "mastered" || mastery >= 5 ? "mastered" : mastery === 0 ? "new" : consecutive >= 2 ? "reviewing" : "learning";
  return { oldMastery, oldInterval, mastery, interval, consecutive, status, nextReviewAt: next.toISOString(), answerResult: !isWrong };
}
