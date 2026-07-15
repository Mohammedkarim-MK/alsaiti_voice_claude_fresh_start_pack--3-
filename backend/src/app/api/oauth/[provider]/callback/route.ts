// GET /api/oauth/:provider/callback?code&state[&error]
// The provider redirects here after consent. Validates state, exchanges the code server-side,
// stores tokens in the vault, loads account identity, then redirects back to the wizard.
// The card becomes 'connected' only after POST /api/integrations/:id/test passes.

import { NextRequest, NextResponse } from 'next/server';
import { handleCallback } from '@/lib/oauth';
import type { CrmProvider } from '@/lib/oauth/types';
// import { makePorts } from '@/lib/oauth/ports';

export async function GET(req: NextRequest, ctx: { params: { provider: string } }) {
  const provider = ctx.params.provider as CrmProvider;
  const url = new URL(req.url);
  const appUrl = process.env.APP_URL || '';

  // const ports = makePorts();
  // try {
  //   const { redirectTo } = await handleCallback(ports, {
  //     provider,
  //     code: url.searchParams.get('code') || undefined,
  //     state: url.searchParams.get('state') || undefined,
  //     error: url.searchParams.get('error') || undefined,
  //   });
  //   return NextResponse.redirect(redirectTo);
  // } catch (e: any) {
  //   return NextResponse.redirect(`${appUrl}/integrations?error=${encodeURIComponent(e.message)}`);
  // }

  void handleCallback; void provider; void url;
  return NextResponse.redirect(`${appUrl}/integrations?error=callback_not_wired`);
}
