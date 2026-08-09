-- Remove the scaffolding the previous tool left behind.
--
-- The project was created on 5 July 2026 by an earlier build tool, which created thirteen tables
-- and then never used them: every one held zero rows and had never been sequentially scanned.
-- Four of them — leads, conversations, notifications, messages — share a name with tables this
-- schema needs, so `create table if not exists` silently skipped ours and the following
-- `alter`/`create index` statements failed against a table with entirely different columns.
--
-- Numbered 0000 so it runs before everything else. Dropping all thirteen rather than only the
-- four that collide: the other nine are unreferenced by any code here, and leaving them would
-- mislead the next person into thinking they mean something.
--
-- Verified empty before running (supabase inspect db table-stats, 9 August 2026):
--   leads 0 · chat_widgets 0 · conversations 0 · activity_logs 0 · voice_settings 0
--   business_members 0 · billing_plans 0 · businesses 0 · notifications 0 · messages 0
--   integrations 0 · phone_connections 0 · assistant_settings 0
--
-- CASCADE is required because they reference each other. It is safe here only because they are
-- empty; on a table with data this would be a destructive operation needing its own review.
--
-- Which is why the emptiness is re-checked at run time rather than trusted from the note above.
-- Four of these names — leads, conversations, notifications, messages — are also OUR table names,
-- created moments later by 0001 and 0007. An unguarded `drop table public.leads cascade` is
-- therefore harmless exactly once, on a freshly-scaffolded project, and catastrophic every time
-- after that: run it against a live database and every real lead is gone, with 0001 helpfully
-- recreating the table empty so nothing even looks broken. RUN_THIS_IN_SQL_EDITOR.sql tells its
-- reader the bundle is safe to re-run, and this file has to be able to keep that promise.
--
-- So: drop only what is genuinely still empty. On a live database every count is non-zero and
-- this whole migration becomes a no-op, which is the correct behaviour.

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'activity_logs', 'messages', 'conversations', 'chat_widgets', 'notifications',
    'voice_settings', 'assistant_settings', 'phone_connections', 'integrations',
    'leads', 'business_members', 'billing_plans', 'businesses'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;                                   -- never existed, or already dropped
    end if;

    execute format('select count(*) from public.%I', t) into n;

    if n = 0 then
      execute format('drop table public.%I cascade', t);
      raise notice 'dropped empty scaffolding table public.%', t;
    else
      -- Deliberately not an exception: on a live database this is the expected path for all
      -- thirteen, and the migration must still succeed.
      raise notice 'KEPT public.% — it holds % row(s), so it is real data, not scaffolding', t, n;
    end if;
  end loop;
end $$;

-- Their helper functions and triggers go too, or they linger referencing tables that no longer
-- exist and confuse the next schema dump.
drop function if exists public.handle_new_user()      cascade;
drop function if exists public.update_updated_at()    cascade;
drop function if exists public.handle_updated_at()    cascade;
