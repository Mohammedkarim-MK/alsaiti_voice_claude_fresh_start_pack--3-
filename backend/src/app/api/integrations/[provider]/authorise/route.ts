// POST /api/integrations/:provider/authorise
// Returns { authorizationUrl } — the browser then navigates to the provider's REAL consent screen.
// Wire makePorts() (Supabase + vault) and requireBusinessMember() (authn/z + permission), then
// remove the 501 stub.

import { NextRequest, NextResponse } from 'next/server';
import { startAuthorisation } from '@/lib/oauth';
import type { CrmProvider } from '@/lib/oauth/types';
// import { makePorts } from '@/lib/oauth/ports';        // your Supabase + vault adapters
// import { requireBusinessMember } from '@/lib/auth';    // returns { user, businessId } or 401/403

export async function POST(req: NextRequest, ctx: { params: { provider: string } }) {
  try {
    const provider = ctx.params.provider as CrmProvider;
    const body = (await req.json().catch(() => ({}))) as { returnPath?: string };

    // const { user, businessId } = await requireBusinessMember(req); // verify membership + integration-manage permission
    // const ports = makePorts();
    // const { authorizationUrl } = await startAuthorisation(ports, {
    //   provider, businessId, userId: user.id, returnPath: body.returnPath,
    // });
    // return NextResponse.json({ authorizationUrl });

    void startAuthorisation; void provider; void body;
    return NextResponse.json(
      { error: 'not_implemented', hint: 'Wire makePorts() + requireBusinessMember(), then uncomment the block above.' },
      { status: 501 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'authorise_failed' }, { status: 400 });
  }
}
