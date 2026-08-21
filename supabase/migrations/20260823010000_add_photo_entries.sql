-- Run in its own transaction: PostgreSQL cannot use a new enum value until commit.
alter type public.entry_kind add value if not exists 'photo';
