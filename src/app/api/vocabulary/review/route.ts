import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAdaptiveReview } from "@/lib/vocabulary/review";

const reviewSchema = z.object({ cardId: z.string().uuid(), answerResult: z.boolean().optional(), rating: z.enum(["again", "difficult", "good", "easy", "mastered"]).optional(), durationMs: z.number().int().min(0).max(3_600_000).optional().nullable(), occurrenceIndex: z.number().int().min(1).max(500).optional().nullable(), mode: z.enum(["review", "quiz"]).optional().nullable() }).refine((value) => value.answerResult !== undefined || value.rating !== undefined, { message: "請提供答題結果。" });
const bodySchema = z.union([reviewSchema, z.object({ reviews: z.array(reviewSchema).min(1).max(200) })]);

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請選擇複習評分。" }, { status: 400 });
  try {
    const admin = createAdminClient();
    const reviews = "reviews" in parsed.data ? parsed.data.reviews : [parsed.data];
    const ids = [...new Set(reviews.map((review) => review.cardId))];
    const { data: cards, error: cardsError } = await admin.from("vocabulary_cards")
      .select("id,mastery_level,current_level,current_interval_days,consecutive_correct,consecutive_wrong,learning_status,review_count,total_attempts,correct_count,wrong_count,recent_results")
      .eq("user_id", context.userId).is("deleted_at", null).in("id", ids);
    if (cardsError) throw cardsError;
    if ((cards?.length ?? 0) !== ids.length) return NextResponse.json({ error: "找不到單字。" }, { status: 404 });

    const byCard = new Map((cards ?? []).map((card) => [card.id, card]));
    const grouped = new Map<string, typeof reviews>();
    reviews.forEach((review) => grouped.set(review.cardId, [...(grouped.get(review.cardId) ?? []), review]));
    const reviewedAt = new Date().toISOString();
    const outcomes: { cardId: string; nextReviewAt: string; oldLevel: number; newLevel: number; answerResult: boolean }[] = [];
    const updates: Record<string, unknown>[] = [];
    const logs: Record<string, unknown>[] = [];

    for (const [cardId, cardReviews] of grouped) {
      const card = byCard.get(cardId)!;
      let state = { masteryLevel: card.mastery_level, currentLevel: card.current_level ?? card.mastery_level, currentIntervalDays: card.current_interval_days, consecutiveCorrect: card.consecutive_correct, consecutiveWrong: card.consecutive_wrong ?? 0, learningStatus: card.learning_status, reviewCount: card.review_count ?? 0, totalAttempts: card.total_attempts ?? card.review_count ?? 0, correctCount: card.correct_count ?? 0, wrongCount: card.wrong_count ?? 0, recentResults: Array.isArray(card.recent_results) ? card.recent_results : [] };
      let latest: ReturnType<typeof calculateAdaptiveReview> | null = null;
      let latestAnswer = false;
      for (const review of cardReviews) {
        const answerResult = review.answerResult ?? review.rating !== "again";
        const result = calculateAdaptiveReview(state, { answerResult, durationMs: review.durationMs, occurrenceIndex: review.occurrenceIndex, mode: review.mode });
        latest = result; latestAnswer = answerResult;
        state = { masteryLevel: result.mastery, currentLevel: result.mastery, currentIntervalDays: result.interval, consecutiveCorrect: result.consecutiveCorrect, consecutiveWrong: result.consecutiveWrong, learningStatus: result.status, reviewCount: state.reviewCount + 1, totalAttempts: result.totalAttempts, correctCount: result.correctAttempts, wrongCount: result.wrongAttempts, recentResults: result.recentResults };
        outcomes.push({ cardId, nextReviewAt: result.nextReviewAt, oldLevel: result.oldMastery, newLevel: result.mastery, answerResult });
        logs.push({ user_id: context.userId, card_id: cardId, rating: answerResult ? "good" : "again", answer_result: answerResult, old_mastery: result.oldMastery, new_mastery: result.mastery, old_interval: result.oldInterval, new_interval: result.interval, answer_duration_ms: review.durationMs ?? null, occurrence_index: review.occurrenceIndex ?? null, study_mode: review.mode ?? null });
      }
      if (!latest) continue;
      updates.push({ id: cardId, mastery_level: latest.mastery, current_level: latest.mastery, current_interval_days: latest.interval, consecutive_correct: latest.consecutiveCorrect, consecutive_wrong: latest.consecutiveWrong, learning_status: latest.status, review_count: state.reviewCount, total_attempts: latest.totalAttempts, correct_count: latest.correctAttempts, wrong_count: latest.wrongAttempts, correct_rate: latest.correctRate, recent_results: latest.recentResults, last_answer_correct: latestAnswer, last_answered_at: reviewedAt, last_reviewed_at: reviewedAt, next_review_at: latest.nextReviewAt });
    }
    await Promise.all(updates.map(async (update) => { const { id, ...values } = update; const { error } = await admin.from("vocabulary_cards").update(values).eq("id", id).eq("user_id", context.userId); if (error) throw error; }));
    const { error: logError } = await admin.from("vocabulary_review_logs").insert(logs);
    if (logError) console.error("[vocabulary.review] log persistence failed", { code: logError.code, message: logError.message });
    return NextResponse.json({ ok: true, processed: outcomes.length, outcomes, logWarning: Boolean(logError), cardUpdates: updates.map((update) => ({ cardId: update.id, masteryLevel: update.mastery_level, currentLevel: update.current_level, currentIntervalDays: update.current_interval_days, consecutiveCorrect: update.consecutive_correct, consecutiveWrong: update.consecutive_wrong, learningStatus: update.learning_status, reviewCount: update.review_count, totalAttempts: update.total_attempts, correctCount: update.correct_count, wrongCount: update.wrong_count, correctRate: update.correct_rate, recentResults: update.recent_results, lastAnswerCorrect: update.last_answer_correct, lastAnsweredAt: update.last_answered_at, lastReviewedAt: update.last_reviewed_at, nextReviewAt: update.next_review_at })) });
  } catch (error) { console.error("[vocabulary.review] failed", { message: error instanceof Error ? error.message : String(error) }); return NextResponse.json({ error: "無法記錄複習結果。" }, { status: 503 }); }
}
