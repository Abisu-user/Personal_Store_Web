-- Keep system administration separate from adult-content administration.
-- This explicitly promotes the account selected by the site owner.

update public.profiles as profile
set role = 'admin',
    updated_at = now()
from auth.users as account
where profile.id = account.id
  and lower(account.email) = lower('99135ddd@gmail.com');

notify pgrst, 'reload schema';
