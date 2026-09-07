-- Adult content uses explicit, default-deny account permissions.  A missing
-- row is intentionally equivalent to no access.

create table if not exists public.adult_content_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  adult_content_access boolean not null default false,
  adult_content_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adult_content_admin_requires_access
    check (not adult_content_admin or adult_content_access)
);

drop trigger if exists vault_app_adult_content_permissions_updated_at
  on public.adult_content_permissions;
create trigger vault_app_adult_content_permissions_updated_at
before update on public.adult_content_permissions
for each row execute procedure public.vault_app_set_updated_at();

create index if not exists adult_content_permissions_access_idx
  on public.adult_content_permissions (adult_content_access, adult_content_admin);

alter table public.adult_content_permissions enable row level security;
revoke all on table public.adult_content_permissions from anon, authenticated;
grant select, insert, update, delete on table public.adult_content_permissions to service_role;

-- The email is used only once to resolve the existing auth user.  Runtime
-- authorization always uses the authenticated user's UUID.
insert into public.adult_content_permissions (
  user_id,
  adult_content_access,
  adult_content_admin
)
select id, true, true
from auth.users
where lower(email) = lower('99135ddd@gmail.com')
on conflict (user_id) do update
set adult_content_access = true,
    adult_content_admin = true;

-- Server-only, bounded account search for the adult permission manager.
-- Browser roles cannot query auth.users or execute this function.
create or replace function public.search_adult_permission_accounts(
  search_term text default '',
  result_limit integer default 20
)
returns table (
  user_id uuid,
  email text,
  username text,
  display_name text,
  adult_content_access boolean,
  adult_content_admin boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    users.id,
    users.email::text,
    profiles.username::text,
    profiles.display_name,
    coalesce(permissions.adult_content_access, false),
    coalesce(permissions.adult_content_admin, false)
  from auth.users as users
  left join public.profiles as profiles on profiles.id = users.id
  left join public.adult_content_permissions as permissions
    on permissions.user_id = users.id
  where users.deleted_at is null
    and (
      btrim(coalesce(search_term, '')) = ''
      or users.email ilike '%' || btrim(search_term) || '%'
      or profiles.username::text ilike '%' || btrim(search_term) || '%'
      or profiles.display_name ilike '%' || btrim(search_term) || '%'
    )
  order by
    coalesce(permissions.adult_content_admin, false) desc,
    coalesce(permissions.adult_content_access, false) desc,
    lower(users.email)
  limit least(greatest(result_limit, 1), 50);
$$;

revoke all on function public.search_adult_permission_accounts(text, integer) from public;
grant execute on function public.search_adult_permission_accounts(text, integer) to service_role;

notify pgrst, 'reload schema';
