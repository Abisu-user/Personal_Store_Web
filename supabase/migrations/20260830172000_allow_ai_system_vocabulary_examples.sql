-- AI-produced examples can be either personal-card drafts or system-catalog
-- supplements. Both remain explicitly marked as unverified AI content.
alter table public.vocabulary_examples
  drop constraint if exists vocabulary_examples_origin_shape_check;

alter table public.vocabulary_examples
  add constraint vocabulary_examples_origin_shape_check check (
    (example_kind = 'system' and card_id is null and dictionary_entry_id is not null)
    or (example_kind = 'user' and card_id is not null)
    or (
      example_kind = 'ai'
      and (
        card_id is not null
        or (card_id is null and dictionary_entry_id is not null)
      )
    )
  );
