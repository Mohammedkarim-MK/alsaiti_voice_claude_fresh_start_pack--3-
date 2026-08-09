-- Re-assert the foreign keys that point at public.leads and public.conversations.
--
-- Why this is needed at all, and why it is not redundant with the CREATE TABLE statements that
-- declare the same constraints:
--
-- `drop table public.leads cascade` does not only drop leads. It silently drops every foreign key
-- on OTHER tables that referenced it — lead_activities.lead_id, appointments.lead_id, and six more
-- — while leaving those tables themselves perfectly intact. Re-running the schema afterwards does
-- not put them back, because every table here is created with `create table if not exists`: the
-- surviving table already exists, so the whole statement is skipped, and the constraint declared
-- inside it never runs. The tables come back looking correct and the referential integrity does
-- not, which is the worst combination — nothing errors, and orphaned rows quietly become possible.
--
-- So the bundle could restore a dropped table but not a schema that had ever had a table dropped
-- out from under it. This migration closes that gap: it compares the foreign keys that SHOULD
-- exist against pg_constraint and adds only the ones that are actually missing. Safe to run on a
-- healthy database, where it does nothing at all.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- child table,        column,    parent table,     on delete
      ('crm_sync_records',   'lead_id', 'leads',          'cascade'),
      ('call_sessions',      'lead_id', 'leads',          'set null'),
      ('lead_activities',    'lead_id', 'leads',          'cascade'),
      ('conversations',      'lead_id', 'leads',          'set null'),
      ('consent_events',     'lead_id', 'leads',          'set null'),
      ('lead_fields',        'lead_id', 'leads',          'cascade'),
      ('appointments',       'lead_id', 'leads',          'set null'),
      ('usage_ledger',       'lead_id', 'leads',          'set null'),
      ('messages',           'conversation_id', 'conversations', 'cascade')
    ) as t(child, col, parent, on_delete)
  loop
    -- Skip anything not present on this database rather than failing: a partially-built schema
    -- should still get whatever repairs it can.
    if to_regclass('public.' || r.child) is null or to_regclass('public.' || r.parent) is null then
      continue;
    end if;

    -- Match on the referencing column and the referenced table, not on a constraint name.
    -- PostgreSQL generates these names, and a name-based check would re-add a duplicate
    -- constraint whenever the generated name differed.
    if exists (
      select 1
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype   = 'f'
         and c.conrelid  = ('public.' || r.child)::regclass
         and c.confrelid = ('public.' || r.parent)::regclass
         and a.attname   = r.col
    ) then
      continue;
    end if;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s',
      r.child, r.child || '_' || r.col || '_fkey', r.col, r.parent, r.on_delete
    );
    raise notice 'restored missing foreign key public.%.% -> public.%', r.child, r.col, r.parent;
  end loop;
end $$;
