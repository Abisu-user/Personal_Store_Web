-- User-managed Bookmark Overview shortcuts. This is intentionally separate
-- from the legacy favorite/pinned fields and preserves ordering per account.

create table if not exists public.bookmark_overview_shortcuts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, entry_id)
);

create index if not exists bookmark_overview_shortcuts_owner_order_idx
  on public.bookmark_overview_shortcuts (owner_id, sort_order, created_at);

drop trigger if exists vault_app_bookmark_overview_shortcuts_updated_at
  on public.bookmark_overview_shortcuts;
create trigger vault_app_bookmark_overview_shortcuts_updated_at
before update on public.bookmark_overview_shortcuts
for each row execute procedure public.vault_app_set_updated_at();

create or replace function public.vault_validate_bookmark_overview_shortcut()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.entries
    where id = new.entry_id
      and owner_id = new.owner_id
      and kind = 'bookmark'
  ) then
    raise exception using errcode = '23503', message = 'BOOKMARK_SHORTCUT_OWNERSHIP_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists vault_validate_bookmark_overview_shortcut_row
  on public.bookmark_overview_shortcuts;
create trigger vault_validate_bookmark_overview_shortcut_row
before insert or update on public.bookmark_overview_shortcuts
for each row execute procedure public.vault_validate_bookmark_overview_shortcut();

-- Only the API service role may read or mutate shortcut membership. The API
-- supplies target_user_id from the authenticated server context, never from
-- the browser request body.
alter table public.bookmark_overview_shortcuts enable row level security;
revoke all on table public.bookmark_overview_shortcuts from public, anon, authenticated;
grant select, insert, update, delete on table public.bookmark_overview_shortcuts to service_role;

-- Replace only shortcuts currently exposable to this request. Existing
-- shortcuts hidden behind a locked folder remain untouched, so locking a
-- folder never silently removes the user's shortcut preference.
create or replace function public.vault_update_bookmark_overview_shortcuts(
  target_user_id uuid,
  target_selected_entry_ids uuid[],
  target_exposable_entry_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_ids uuid[] := coalesce(target_selected_entry_ids, array[]::uuid[]);
  exposable_ids uuid[] := coalesce(target_exposable_entry_ids, array[]::uuid[]);
  selected_count integer;
begin
  if target_user_id is null
    or cardinality(selected_ids) > 100
    or cardinality(exposable_ids) > 100
    or cardinality(selected_ids) <> (select count(distinct selected.value) from unnest(selected_ids) as selected(value))
    or cardinality(exposable_ids) <> (select count(distinct exposable.value) from unnest(exposable_ids) as exposable(value))
    or exists (select 1 from unnest(selected_ids) as selected(value) where not (selected.value = any(exposable_ids)))
  then
    raise exception using errcode = '22023', message = 'INVALID_BOOKMARK_SHORTCUT_SELECTION';
  end if;

  if exists (
    select 1
    from unnest(exposable_ids) as exposable(value)
    left join public.entries entry on entry.id = exposable.value
    where entry.id is null
      or entry.owner_id <> target_user_id
      or entry.kind <> 'bookmark'
      or entry.deleted_at is not null
      or entry.is_archived
  ) then
    raise exception using errcode = '42501', message = 'BOOKMARK_SHORTCUT_FORBIDDEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bookmark-shortcuts:' || target_user_id::text, 0)
  );

  delete from public.bookmark_overview_shortcuts shortcut
  where shortcut.owner_id = target_user_id
    and shortcut.entry_id = any(exposable_ids)
    and not (shortcut.entry_id = any(selected_ids));

  insert into public.bookmark_overview_shortcuts (owner_id, entry_id, sort_order)
  select target_user_id, ordered.entry_id, (ordered.position - 1)::integer
  from unnest(selected_ids) with ordinality ordered(entry_id, position)
  on conflict (owner_id, entry_id) do update
  set sort_order = excluded.sort_order,
      updated_at = now();

  get diagnostics selected_count = row_count;
  return selected_count;
end;
$$;

revoke all on function public.vault_validate_bookmark_overview_shortcut() from public, anon, authenticated;
revoke all on function public.vault_update_bookmark_overview_shortcuts(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.vault_update_bookmark_overview_shortcuts(uuid, uuid[], uuid[]) to service_role;

notify pgrst, 'reload schema';
