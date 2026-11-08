// Signup form setup (owner, 2026-11-08): the organizer switches optional
// fields on. Stored as tournaments.signup_fields:
//   { email: 'off'|'optional'|'required', dojo_email: same,
//     consents: { data_use, news_media, social_media, photos: 'off'|'ask'|'required' },
//     add_another: boolean }
// Name, club and what the category rules need (gender, birth, grade) are
// always asked. Exam application: later.

export const CONSENTS = [
  { key: 'data_use', label: 'Use of my data for the tournament', short: 'D' },
  { key: 'news_media', label: 'Results and names in news media', short: 'N' },
  { key: 'social_media', label: 'Posts on social media', short: 'S' },
  { key: 'photos', label: 'Photos and video of me', short: 'P' },
];

/** Settings with defaults: email optional (as before), the rest off. */
export function signupSettings(t) {
  const f = t?.signup_fields ?? {};
  return {
    email: f.email ?? 'optional',
    dojo_email: f.dojo_email ?? 'off',
    consents: Object.fromEntries(CONSENTS.map((c) => [c.key, f.consents?.[c.key] ?? 'off'])),
    add_another: !!f.add_another,
  };
}

/** Consents asked on the form (ask or required). */
export const askedConsents = (settings) => CONSENTS.filter((c) => settings.consents[c.key] !== 'off');

/** Problems of one person's form against the settings (same checks as public_register). */
export function signupProblems(settings, person) {
  const out = [];
  if (!String(person.last_name ?? '').trim()) out.push('last name');
  if (settings.email === 'required' && !String(person.email ?? '').trim()) out.push('email');
  if (settings.dojo_email === 'required' && !String(person.dojo_email ?? '').trim()) out.push('dojo email');
  for (const c of CONSENTS) {
    if (settings.consents[c.key] === 'required' && !person.consents?.[c.key]) out.push(`consent: ${c.label.toLowerCase()}`);
  }
  return out;
}

/** "D N · P" style summary of given consents for the registration list. */
export function consentLetters(consents) {
  if (!consents) return '';
  return CONSENTS.filter((c) => c.key in consents).map((c) => (consents[c.key] ? c.short : '·')).join(' ');
}
