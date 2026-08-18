-- One name for the third tier.
--
-- It had three. public.plans seeded it as 'scale', stripe-billing accepted 'business', and the
-- pricing page renders the i18n key 'plan_full' ("Full Automation", the name that is actually
-- live and that the voice assistant already quotes).
--
-- That is not cosmetic. Checkout would send plan='business', the webhook writes it verbatim to
-- workspaces.plan, and plan_limit() joins public.plans on code — which has no 'business' row.
-- Every limit resolves to NULL, so usage_summary shows no caps and invite_member's seat check
-- passes without bound. A paying customer on the top tier would silently receive unlimited
-- seats and unmetered usage, and nothing would error.
--
-- Standardising on 'full' rather than 'scale' or 'business': it matches plan_full, the key the
-- page already renders in all three languages, so the customer-facing name and the internal code
-- finally agree.

update public.plans set code = 'full' where code = 'scale';

-- Any workspace already pointing at an old code follows it, so no live account is left holding
-- a plan that no longer exists.
update public.workspaces set plan = 'full' where plan in ('scale', 'business');

-- Anything that reached the database with a code we do not recognise goes back to demo rather
-- than sitting on a plan with no limits attached — which is the failure this migration exists
-- to close, and it should not survive the migration that fixes it.
update public.workspaces w
   set plan = 'demo'
 where w.plan is not null
   and not exists (select 1 from public.plans p where p.code = w.plan);
