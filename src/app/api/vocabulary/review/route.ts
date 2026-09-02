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
    const outcomes: { cardId: string; nextReviewAt: string; oldLevel: number; newLevel: number }[] = [];
    for (const review of reviews) {
      const { data: card, error } = await admin.from("vocabulary_cards")
      .select("id,mastery_level,current_level,current_interval_days,consecutive_correct,consecutive_wrong,learning_status,review_count,total_attempts,correct_count,wrong_count,recent_results")
        .eq("id", review.cardId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!card) return NextResponse.json({ error: "找不到單字。" }, { status: 404 });
      // Rating is accepted only for older clients. New clients submit the
      // factual outcome, and mastery is derived exclusively on the server.
      const answerResult = review.answerResult ?? review.rating !== "again";
      const result = calculateAdaptiveReview({ masteryLevel: card.mastery_level, currentLevel: card.current_level ?? card.mastery_level, currentIntervalDays: card.current_interval_days, consecutiveCorrect: card.consecutive_correct, consecutiveWrong: card.consecutive_wrong ?? 0, learningStatus: card.learning_status, totalAttempts: card.total_attempts ?? card.review_count ?? 0, correctCount: card.correct_count, wrongCount: card.wrong_count, recentResults: Array.isArray(card.recent_results) ? card.recent_results : [] }, { answerResult, durationMs: review.durationMs, occurrenceIndex: review.occurrenceIndex, mode: review.mode });
      const { error: updateError } = await admin.from("vocabulary_cards").update({
      mastery_level: result.mastery, current_level: result.mastery, current_interval_days: result.interval, consecutive_correct: result.consecutiveCorrect, consecutive_wrong: result.consecutiveWrong, learning_status: result.status,
      review_count: (card.review_count ?? 0) + 1, total_attempts: result.totalAttempts, correct_count: result.correctAttempts, wrong_count: result.wrongAttempts, correct_rate: result.correctRate, recent_results: result.recentResults,
      last_answer_correct: answerResult, last_answered_at: new Date().toISOString(), last_reviewed_at: new Date().toISOString(), next_review_at: result.nextReviewAt,
      }).eq("id", card.id).eq("user_id", context.userId);
      if (updateError) throw updateError;
      const { error: logError } = await admin.from("vocabulary_review_logs").insert({ user_id: context.userId, card_id: card.id, rating: answerResult ? "good" : "again", answer_result: answerResult, old_mastery: result.oldMastery, new_mastery: result.mastery, old_interval: result.oldInterval, new_interval: result.interval, answer_duration_ms: review.durationMs ?? null, occurrence_index: review.occurrenceIndex ?? null, study_mode: review.mode ?? null });
      if (logError) throw logError;
      outcomes.push({ cardId: card.id, nextReviewAt: result.nextReviewAt, oldLevel: result.oldMastery, newLevel: result.mastery });
    }
    return NextResponse.json({ ok: true, processed: outcomes.length, outcomes });
  } catch { return NextResponse.json({ error: "無法記錄複習結果。" }, { status: 503 }); }
}
