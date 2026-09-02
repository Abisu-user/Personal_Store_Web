-- Keep the original review columns for backwards compatibility, while adding
-- explicit adaptive-learning state. Existing learning data is preserved.
alter table public.vocabulary_cards
  add column if not exists total_attempts integer not null default 0 check (total_attempts >= 0),
  add column if not exists correct_rate numeric(5,2) not null default 0 check (correct_rate >= 0 and correct_rate <= 100),
  add column if not exists current_level smallint not null default 0 check (current_level between 0 and 5),
  add column if not exists consecutive_wrong integer not null default 0 check (consecutive_wrong >= 0),
  add column if not exists recent_results jsonb not null default '[]'::jsonb,
  add column if not exists last_answer_correct boolean,
  add column if not exists last_answered_at timestamptz;

alter table public.vocabulary_review_logs
  add column if not exists answer_duration_ms integer check (answer_duration_ms is null or answer_duration_ms >= 0),
  add column if not exists occurrence_index integer check (occurrence_index is null or occurrence_index >= 1),
  add column if not exists study_mode text check (study_mode is null or study_mode in ('review', 'quiz'));

-- Backfill without resetting existing progress. review_count was the former
-- total-attempt field; correct/wrong counts take precedence when available.
update public.vocabulary_cards
set
  total_attempts = greatest(coalesce(review_count, 0), coalesce(correct_count, 0) + coalesce(wrong_count, 0)),
  correct_rate = case
    when greatest(coalesce(review_count, 0), coalesce(correct_count, 0) + coalesce(wrong_count, 0)) = 0 then 0
    else round((coalesce(correct_count, 0)::numeric / greatest(coalesce(review_count, 0), coalesce(correct_count, 0) + coalesce(wrong_count, 0))::numeric) * 100, 2)
  end,
  current_level = case
    when greatest(coalesce(review_count, 0), coalesce(correct_count, 0) + coalesce(wrong_count, 0)) = 0 then 0
    when coalesce(correct_count, 0) = 0 then 1
    when (coalesce(correct_count, 0)::numeric / greatest(coalesce(review_count, 0), coalesce(correct_count, 0) + coalesce(wrong_count, 0))::numeric) < .4 then 2
    when (coalesce(correct_count, 0)::numeric / greatest(coalesce(review_count, 0), coalesce(correct_count, 0) + coalesce(wrong_count, 0))::numeric) < .7 then 3
    when (coalesce(correct_count, 0)::numeric / greatest(coalesce(review_count, 0), coalesce(correct_count, 0) + coalesce(wrong_count, 0))::numeric) < 1 then 4
    when greatest(coalesce(review_count, 0), coalesce(correct_count, 0) + coalesce(wrong_count, 0)) >= 5 and coalesce(consecutive_correct, 0) >= 5 then 5
    else 4
  end;

update public.vocabulary_cards
set mastery_level = current_level
where mastery_level is distinct from current_level;

-- Preserve the useful part of older review history for the new recent-results
-- correction instead of treating every existing card as a blank start.
with ranked_logs as (
  select
    card_id,
    answer_result,
    reviewed_at,
    row_number() over (partition by card_id order by reviewed_at desc) as rank
  from public.vocabulary_review_logs
), recent_logs as (
  select
    card_id,
    jsonb_agg(jsonb_build_object('correct', answer_result, 'answeredAt', reviewed_at, 'durationMs', null, 'occurrenceIndex', null, 'mode', null) order by reviewed_at) as results,
    (array_agg(answer_result order by reviewed_at desc))[1] as last_correct,
    max(reviewed_at) as last_answered_at
  from ranked_logs
  where rank <= 10
  group by card_id
)
update public.vocabulary_cards cards
set
  recent_results = recent_logs.results,
  last_answer_correct = recent_logs.last_correct,
  last_answered_at = recent_logs.last_answered_at
from recent_logs
where cards.id = recent_logs.card_id;

create index if not exists vocabulary_cards_adaptive_selection_idx
  on public.vocabulary_cards (user_id, current_level, last_answered_at)
  where deleted_at is null and learning_status <> 'paused';

create index if not exists vocabulary_review_logs_card_recent_idx
  on public.vocabulary_review_logs (user_id, card_id, reviewed_at desc);
