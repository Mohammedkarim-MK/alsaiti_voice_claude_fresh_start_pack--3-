-- Website contact-form submissions — captured server-side so marketing enquiries are never lost.
-- Writes happen only via the contact-submit Edge Function (service role, bypasses RLS).
-- Any signed-in user may READ them (single-tenant demo: the owner reviews enquiries).

create table if not exists public.contact_submissions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text,
  last_name  text,
  business   text,
  email      text,
  phone      text,
  whatsapp   text,
  industry   text,
  system     text,
  message    text,
  source     text not null default 'website_form',
  user_agent text
);

alter table public.contact_submissions enable row level security;

-- No INSERT/UPDATE/DELETE policy → only the service role (the Edge Function) can write. Locked down.
drop policy if exists contact_submissions_read on public.contact_submissions;
create policy contact_submissions_read on public.contact_submissions
  for select to authenticated using (true);

create index if not exists contact_submissions_created_idx on public.contact_submissions (created_at desc);
