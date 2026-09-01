import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateReview } from "@/lib/vocabulary/review";

const reviewSchema = z.object({ cardId: z.string().uuid(), rating: z.enum(["again", "difficult", "good", "easy", "mastered"]), answerResult: z.boolean().optional() });
const bodySchema = z.union([reviewSchema, z.object({ reviews: z.array(reviewSchema).min(1).max(200) })]);

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請選擇複習評分。" }, { status: 400 });
  try {
    const admin = createAdminClient();
    const reviews = "reviews" in parsed.data ? parsed.data.reviews : [parsed.data];
    const outcomes: { cardId: string; nextReviewAt: string }[] = [];
    for (const review of reviews) {
      const { data: card, error } = await admin.from("vocabulary_cards")
      .select("id,mastery_level,current_interval_days,consecutive_correct,learning_status,review_count,correct_count,wrong_count")
        .eq("id", review.cardId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!card) return NextResponse.json({ error: "找不到單字。" }, { status: 404 });
      const result = calculateReview({ masteryLevel: card.mastery_level, currentIntervalDays: card.current_interval_days, consecutiveCorrect: card.consecutive_correct, learningStatus: card.learning_status }, review.rating);
      const answerResult = review.answerResult ?? result.answerResult;
      const { error: updateError } = await admin.from("vocabulary_cards").update({
      mastery_level: result.mastery, current_interval_days: result.interval, consecutive_correct: result.consecutive, learning_status: result.status,
      review_count: card.review_count + 1, correct_count: card.correct_count + (answerResult ? 1 : 0), wrong_count: card.wrong_count + (answerResult ? 0 : 1),
      last_reviewed_at: new Date().toISOString(), next_review_at: result.nextReviewAt,
      }).eq("id", card.id).eq("user_id", context.userId);
      if (updateError) throw updateError;
      const { error: logError } = await admin.from("vocabulary_review_logs").insert({ user_id: context.userId, card_id: card.id, rating: review.rating, answer_result: answerResult, old_mastery: result.oldMastery, new_mastery: result.mastery, old_interval: result.oldInterval, new_interval: result.interval });
      if (logError) throw logError;
      outcomes.push({ cardId: card.id, nextReviewAt: result.nextReviewAt });
    }
    return NextResponse.json({ ok: true, processed: outcomes.length, outcomes });
  } catch { return NextResponse.json({ error: "無法記錄複習結果。" }, { status: 503 }); }
}
