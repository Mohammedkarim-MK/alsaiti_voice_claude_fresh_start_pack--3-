-- Service-role helpers for the billing function.
--
-- stripe-billing runs as the service role so it can write stripe_customer_id, which 0016/0018
-- deliberately locked away from every client. But the existing permission helpers all read
-- auth.uid(), which is NULL for the service role — can_admin() would return false for everyone
-- and nobody could ever check out.
--
-- The wrong fix is to relax can_admin(). These take the user id as an argument instead, so the
-- check is identical, explicit, and impossible to reach from a browser: both are revoked from
-- anon and authenticated, so only a caller holding the service key can use them.

-- Same rule as can_admin(), asked about a named user rather than the current session.
create or replace function public.can_admin_as(p_user uuid, p_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
     where m.workspace_id = p_workspace
       and m.user_id = p_user
       and m.role in ('owner','admin')
  );
$$;
revoke all on function public.can_admin_as(uuid, uuid) from anon, authenticated;

-- Attach a Stripe customer to a workspace from the billing function.
--
-- admin_link_stripe() already exists but requires is_platform_admin(), which is right for a
-- human clicking a button in the console and wrong here: the customer is being created by the
-- workspace's own admin during checkout, and there is no platform administrator in the request.
-- Refusing any caller with a session is what keeps this out of reach of the browser.
create or replace function public.admin_link_stripe_service(p_workspace uuid, p_customer_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(trim(p_customer_id), '') = '' then
    raise exception 'stripe customer id is required' using errcode = '22023';
  end if;

  /* Never overwrite an existing customer. A second customer id for the same workspace silently
     breaks the webhook, which matches payments on stripe_customer_id — the customer pays and
     nothing unlocks, with no error anywhere. */
  update public.workspaces
     set stripe_customer_id = p_customer_id
   where id = p_workspace and stripe_customer_id is null;

  return jsonb_build_object('ok', true,
    'stripe_customer_id', (select stripe_customer_id from public.workspaces where id = p_workspace));
end; $$;
revoke all on function public.admin_link_stripe_service(uuid, text) from anon, authenticated;
