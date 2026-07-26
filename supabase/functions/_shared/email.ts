// Transactional email — whichever provider has a key set. The key lives ONLY in the Edge
// Function environment, never in the browser. Mirrors _shared/tts.ts: if no provider is
// configured we say so honestly rather than pretending a message was sent.

function env(k: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).Deno?.env.get(k) || undefined;
}

export interface SendResult { provider: string; id?: string }

export function emailProvider(): 'resend' | 'sendgrid' | null {
  if (env('RESEND_API_KEY')) return 'resend';
  if (env('SENDGRID_API_KEY')) return 'sendgrid';
  return null;
}

/** The From address. Must be on a domain you have verified with the provider. */
export function fromAddress(): string {
  return env('ALERT_FROM_EMAIL') || 'Alsaiti Growth <alerts@alsaitigrowth.com>';
}

async function resend(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromAddress(), to: [to], subject, html, text }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`resend ${r.status}: ${body.slice(0, 200)}`);
  let id: string | undefined;
  try { id = JSON.parse(body).id; } catch { /* id is optional */ }
  return { provider: 'resend', id };
}

async function sendgrid(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const from = fromAddress();
  const m = from.match(/^(.*)<(.+)>$/);
  const email = (m ? m[2] : from).trim();
  const name = m ? m[1].trim().replace(/^"|"$/g, '') : undefined;
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('SENDGRID_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: name ? { email, name } : { email },
      subject,
      content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
    }),
  });
  if (!r.ok) throw new Error(`sendgrid ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { provider: 'sendgrid', id: r.headers.get('x-message-id') || undefined };
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const p = emailProvider();
  if (p === 'resend') return resend(to, subject, html, text);
  if (p === 'sendgrid') return sendgrid(to, subject, html, text);
  throw new Error('no_email_provider');
}

/* ---- the lead alert itself -------------------------------------------------------------- */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export interface LeadForEmail {
  name?: string; service?: string; urgency?: string; source?: string;
  phone?: string; email?: string; summary?: string; score?: number;
}

export function leadAlert(lead: LeadForEmail, appUrl: string): { subject: string; html: string; text: string } {
  const urgent = String(lead.urgency || '').toLowerCase() === 'high';
  const who = lead.name || 'New enquiry';
  const subject = `${urgent ? '🔴 Urgent lead' : 'New lead'}: ${who}${lead.service ? ' — ' + lead.service : ''}`;

  const rows: [string, unknown][] = [
    ['Name', lead.name], ['Needs', lead.service], ['Urgency', lead.urgency],
    ['Phone', lead.phone], ['Email', lead.email], ['Source', lead.source], ['Score', lead.score],
  ];
  const text = [
    urgent ? 'URGENT LEAD' : 'NEW LEAD', '',
    ...rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`),
    lead.summary ? `\nSummary: ${lead.summary}` : '',
    appUrl ? `\nOpen your dashboard: ${appUrl}` : '',
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#F7F2E7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#22322A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid rgba(20,35,28,.11);border-radius:16px;overflow:hidden">
<tr><td style="padding:20px 24px;background:${urgent ? '#9E4029' : '#1C6B4E'};color:#fff">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">${urgent ? 'Urgent lead' : 'New lead'}</div>
  <div style="font-size:20px;font-weight:700;margin-top:4px">${esc(who)}</div>
</td></tr>
<tr><td style="padding:18px 24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
    ${rows.filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<tr><td style="padding:7px 0;color:#5E6B5A;width:110px">${esc(k)}</td><td style="padding:7px 0;font-weight:600">${esc(v)}</td></tr>`)
      .join('')}
  </table>
  ${lead.summary ? `<div style="margin-top:14px;padding:12px 14px;background:#F3EEDF;border-radius:10px;font-size:13.5px;line-height:1.55">${esc(lead.summary)}</div>` : ''}
  ${appUrl ? `<div style="margin-top:20px"><a href="${esc(appUrl)}" style="display:inline-block;background:#1C6B4E;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px">Open your dashboard</a></div>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid rgba(20,35,28,.11);color:#5E6B5A;font-size:11.5px">
  Captured by your Alsaiti Growth AI receptionist.
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, text };
}
