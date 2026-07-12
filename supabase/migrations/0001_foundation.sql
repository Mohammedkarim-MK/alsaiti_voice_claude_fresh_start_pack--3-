-- Alsaiti Voice — Phase 1 foundation schema
-- Multi-tenant workspaces + team + leads, with Row-Level Security.
-- Apply by pasting into the Supabase SQL editor, or `supabase db push`.

create extension if not exists "pgcrypto";

-- One profile per auth user ------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  created_at timestamptz not null default now()
);

-- A workspace = a business account ----------------------------------------
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  industry   text,
  timezone   text default 'Europe/London',
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Team membership ----------------------------------------------------------
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'agent' check (role in ('owner','admin','agent')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Leads (statuses & sources exactly per the product spec) ------------------
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  service      text,
  phone        text,
  email        text,
  urgency      text default 'Medium'        check (urgency in ('High','Medium','Low')),
  source       text default 'Manual import' check (source  in ('Voice call','Website chat','Contact form','Manual import','API','CRM')),
  status       text default 'New'           check (status  in ('New','Contacted','Qualified','Booked','Won','Lost','Spam')),
  score        int  default 50              check (score between 0 and 100),
  summary      text,
  notes        text,
  assignee     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists leads_workspace_created_idx on public.leads (workspace_id, created_at desc);

-- Membership check (SECURITY DEFINER so it bypasses RLS and avoids recursion)
create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

-- Row-Level Security -------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.workspaces         enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.leads              enable row level security;

create policy "profiles self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "workspaces read"   on public.workspaces for select using (owner_id = auth.uid() or public.is_member(id));
create policy "workspaces insert" on public.workspaces for insert with check (owner_id = auth.uid());
create policy "workspaces update" on public.workspaces for update using (owner_id = auth.uid());
create policy "workspaces delete" on public.workspaces for delete using (owner_id = auth.uid());

create policy "members read"   on public.workspace_members for select using (public.is_member(workspace_id));
create policy "members manage" on public.workspace_members for all
  using      (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

create policy "leads member access" on public.leads
  for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- keep leads.updated_at fresh ---------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- On signup: create the profile + first workspace + owner membership -------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  insert into public.workspaces (name, owner_id)
    values (coalesce(new.raw_user_meta_data->>'business_name','My workspace'), new.id)
    returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (ws, new.id, 'owner');
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
