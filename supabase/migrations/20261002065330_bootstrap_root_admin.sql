-- Bootstraps root admin access for shashank.bawane@gmail.com.
--
-- PRIMARY_ROOT_EMAIL in admin.functions.ts only ever *protected* this
-- email from being demoted/deleted — it never actually granted the role
-- in the first place. Without a matching user_roles row, this account
-- gets "Forbidden" when visiting the Admin Portal, same as anyone else.
-- This migration inserts that row directly if the account already
-- exists, and is safe to re-run (ON CONFLICT DO NOTHING).

INSERT INTO public.user_roles (user_id, email, role)
SELECT id, email, 'root'
FROM auth.users
WHERE lower(email) = 'shashank.bawane@gmail.com'
ON CONFLICT (email, role) DO NOTHING;
