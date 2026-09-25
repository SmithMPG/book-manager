-- The FA list — run in the SQL editor after creating everyone's login.
--
-- Demo-period onboarding, no email ever sent:
--   1. Authentication -> Users -> Add user -> Create new user, for each
--      person below: their email, a temporary password, "Auto Confirm
--      User" ticked. Give them the temporary password.
--   2. Run this file. It adds each person to `users`, matched to their
--      login by email. Anyone without a login yet is skipped — create
--      it and re-run; people already added are just updated.
--   3. On first sign-in, password_set = false sends them to the "set
--      your password" screen (components/auth.js), so they choose their
--      own and the temporary one stops working.
--
-- Also in the dashboard: Authentication -> Sign In / Providers -> Email
-- -> "Allow new users to sign up" OFF. Only admins create logins.
--
-- Resetting a forgotten password (no email, so it's done here): give
-- them a new temporary password and send them back through the
-- set-password screen —
--   update auth.users set encrypted_password = crypt('Temp-pass-123', gen_salt('bf'))
--     where email = 'someone@liblink.co.za';
--   update users set password_set = false where email = 'someone@liblink.co.za';
-- Don't delete and recreate their login: deleting it also deletes their
-- users row and all their clients/cases/activities.

-- "users update own" let anyone update ANY column of their own row —
-- including is_admin, i.e. any FA could make themselves an admin. RLS
-- picks the rows; column grants pick the columns. Only these are the
-- person's own to change; everything else is the dashboard's.
revoke update on users from authenticated;
grant update (phone, password_set) on users to authenticated;

insert into users (id, email, name, surname, is_admin, branch, password_set)
select a.id, t.email, t.name, t.surname, t.is_admin, t.branch, false
from (values
  ('ameeth.maharaj@liblink.co.za',        'Ameeth',        'Maharaj',     true,  'Bryanston Academy'),
  ('christabell.swart@liblink.co.za',     'Christabell',   'Swart',       false, 'Bryanston Academy'),
  ('bongiwe.nzimande@liblink.co.za',      'Bongiwe',       'Nzimande',    false, 'Bryanston Academy'),
  ('darlington.monaheng@liblink.co.za',   'Darlington',    'Monaheng',    false, 'Bryanston Academy'),
  ('matthew.smith@liblink.co.za',         'Matthew',       'Smith',       true,  'Bryanston Academy'),
  ('lehlogonolo.mabusela@liblink.co.za',  'Lehlogonolo',   'Mabusela',    false, 'Bryanston Academy'),
  ('tebatso.moyo@liblink.co.za',          'Tebatso',       'Moyo',        false, 'Bryanston Academy'),
  ('zilungile.mbali@liblink.co.za',       'Zilungile',     'Mbali',       false, 'Bryanston Academy'),
  ('keoagile.koitsioe@liblink.co.za',     'Keoagile',      'Koitsioe',    false, 'Bryanston Academy'),
  ('nosipho.mchunu@liblink.co.za',        'Nosipho',       'Mchunu',      false, 'Bryanston Academy'),
  ('marcel.myburg@liblink.co.za',         'Marcel',        'Myburg',      false, 'Bryanston Academy'),
  ('sisamkele.nofotyela@liblink.co.za',   'Sisamkele',     'Nofotyela',   false, 'Bryanston Academy'),
  ('keoagile.molotsi@liblink.co.za',      'Keoagile',      'Molotsi',     false, 'Bryanston Academy'),
  ('remiero.padayachee@liblink.co.za',    'Remiero',       'Padayachee',  false, 'Bryanston Academy'),
  ('joshua-ethan.levinge@liblink.co.za',  'Joshua',        'Levinge',     false, 'Bryanston Academy')
) as t(email, name, surname, is_admin, branch)
join auth.users a on lower(a.email) = t.email
on conflict (id) do update set
  name = excluded.name, surname = excluded.surname,
  is_admin = excluded.is_admin, branch = excluded.branch;

-- Check who's in (everyone on the list above should appear):
--   select name, surname, email, is_admin, password_set from users order by surname;
