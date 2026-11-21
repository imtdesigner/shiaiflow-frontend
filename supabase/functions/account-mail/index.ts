// Sends the queued account emails (public.account_mail) through Resend.
// Woken by the DB trigger users_queue_account_mail (pg_net, no body). Anyone
// may call it, but it only sends rows the database queued and claims each row
// once (sent_at), so a call can never send anything new.
//   waiting                       → the app admins (new dojo / federation to verify)
//   verified / needs_info / rejected → the account (login email + responsible person)
// Secrets: RESEND_API_KEY (required), MAIL_FROM (optional).
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP = 'https://app.shiaiflow.com';
const FROM = Deno.env.get('MAIL_FROM') ?? 'ShiaiFlow <noreply@shiaiflow.com>';
const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const KIND: Record<string, string> = {
  dojo: 'Dojo', regional: 'National / regional federation', continental: 'Continental federation',
  person: 'Former dojo / federation, now individual',
};
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const page = (body: string) => `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px">${body}<p style="color:#888;font-size:13px;margin-top:2em">ShiaiFlow · kendo tournaments</p></div>`;
const button = (href: string, text: string) => `<p><a href="${href}" style="display:inline-block;background:#711921;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">${text}</a></p>`;

type Account = { id: string; email: string; name: string; role: string; city: string | null; country: string | null; website: string | null; contact_name: string | null; contact_email: string | null; review_note: string | null; needs_review: boolean };

async function adminEmails(): Promise<string[]> {
  const { data } = await supa.from('app_admins').select('user_id');
  const out: string[] = [];
  for (const a of data ?? []) {
    const { data: u } = await supa.auth.admin.getUserById(a.user_id);
    if (u?.user?.email) out.push(u.user.email);
  }
  return out;
}

function compose(event: string, acc: Account, admins: string[]) {
  const name = acc.name || acc.email;
  const own = [acc.email, acc.contact_email].filter((e, i, a) => e && a.indexOf(e) === i) as string[];
  if (event === 'waiting') {
    return {
      to: admins,
      subject: `Account to verify: ${name}`,
      html: page(`<p>A ${esc(KIND[acc.role] ?? acc.role).toLowerCase()} account is waiting for verification.</p>
        <p><strong>${esc(name)}</strong><br>${esc([acc.city, acc.country].filter(Boolean).join(', '))}<br>
        Website: ${acc.website ? `<a href="${esc(acc.website)}">${esc(acc.website)}</a>` : '—'}<br>
        Responsible person: ${esc(acc.contact_name ?? '—')}${acc.contact_email ? ` (${esc(acc.contact_email)})` : ''}<br>
        Login email: ${esc(acc.email)}</p>${button(`${APP}/admin/accounts`, 'Open accounts to verify')}`),
    };
  }
  if (event === 'verified') {
    return {
      to: own,
      subject: 'Your ShiaiFlow account is verified',
      html: page(`<p>Hello ${esc(acc.contact_name || name)},</p>
        <p>the app admins verified <strong>${esc(name)}</strong>. You can now publish the signup of your tournaments and start them.</p>
        ${button(`${APP}/dashboard`, 'Open ShiaiFlow')}`),
    };
  }
  const info = event === 'needs_info';
  return {
    to: own,
    subject: info ? 'ShiaiFlow: more information needed for your account' : 'ShiaiFlow: your account was not verified',
    html: page(`<p>Hello ${esc(acc.contact_name || name)},</p>
      <p>${info ? `the app admins need more information to verify <strong>${esc(name)}</strong>:` : `the app admins could not verify <strong>${esc(name)}</strong>:`}</p>
      <blockquote style="margin:0;padding:8px 12px;border-left:3px solid #711921;background:#faf8f3">${esc(acc.review_note || '—').replace(/\n/g, '<br>')}</blockquote>
      <p>Correct your data in your profile and press <em>Send again</em>${info ? '' : ', or change the account to an individual one'}. Until then you can set up tournaments, but not publish the signup or start them.</p>
      ${button(`${APP}/profile`, 'Open your profile')}`),
  };
}

async function send(mail: { to: string[]; subject: string; html: string }) {
  const key = Deno.env.get('RESEND_API_KEY') ?? Deno.env.get('resend_api_key'); // the secret was saved in lower case
  if (!key) throw new Error('RESEND_API_KEY is not set');
  if (!mail.to.length) throw new Error('no recipient');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, ...mail }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

Deno.serve(async () => {
  const since = new Date(Date.now() - 2 * 86400_000).toISOString();
  const { data: rows } = await supa.from('account_mail').select('id, user_id, event')
    .is('sent_at', null).gte('created_at', since).order('id').limit(20);
  let admins: string[] | null = null;
  let sent = 0;
  for (const r of rows ?? []) {
    // claim the row first: two calls at once never send it twice
    const { data: claimed } = await supa.from('account_mail').update({ sent_at: new Date().toISOString() })
      .eq('id', r.id).is('sent_at', null).select('id');
    if (!claimed?.length) continue;
    try {
      const { data: acc } = await supa.from('users')
        .select('id, email, name, role, city, country, website, contact_name, contact_email, review_note, needs_review')
        .eq('id', r.user_id).single();
      if (r.event === 'waiting' && !admins) admins = await adminEmails();
      await send(compose(r.event, acc as Account, admins ?? []));
      sent += 1;
    } catch (e) {
      await supa.from('account_mail').update({ error: String(e).slice(0, 500) }).eq('id', r.id);
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
