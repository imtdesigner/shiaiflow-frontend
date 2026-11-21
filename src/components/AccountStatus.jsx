import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { myAccount } from '../lib/api';
import { fmtDate } from '../lib/format.js';

const ORG = ['dojo', 'regional', 'continental'];

/** Verification status of an account, in words: { cls, text, note?, resend? }. */
export function accountStatus(p) {
  if (p.verified_at) return { cls: 'success', text: `Verified by the app admins on ${fmtDate(p.verified_at)}.` };
  const org = ORG.includes(p.role);
  if (!org && !p.needs_review) {
    return { cls: 'info', text: 'Individual account — no verification needed. Your tournaments show as personal tournaments.' };
  }
  if (p.review_state === 'needs_info') {
    return { cls: 'error', note: p.review_note, resend: true,
      text: 'The app admins need more information before they can verify your account. Correct your data below, save, and press Send again.' };
  }
  if (p.review_state === 'rejected') {
    return { cls: 'error', note: p.review_note, resend: true,
      text: 'The app admins could not verify your account. Correct your data and press Send again, or change the account to an individual one.' };
  }
  if (org) return { cls: 'info', text: 'Waiting for verification by the app admins. Until then you can set up tournaments, but not publish the signup or start them.' };
  return { cls: 'info', text: 'Former dojo / federation account, now individual: the app admins approve it again before you can publish the signup or start a tournament.' };
}

/** Dashboard banner while a dojo / federation account is not verified. */
export function AccountBanner() {
  const [acc, setAcc] = useState(null);
  useEffect(() => { myAccount().then(setAcc).catch(() => {}); }, []);
  if (!acc || acc.verified_at || !(ORG.includes(acc.role) || acc.needs_review)) return null;
  const s = accountStatus(acc);
  return (
    <div className={`account-banner ${s.cls}`}>
      <span>{s.text.replace(' below', ' in your profile')}</span>
      {s.note && <q>{s.note}</q>}
      <Link to="/profile">Profile</Link>
    </div>
  );
}
