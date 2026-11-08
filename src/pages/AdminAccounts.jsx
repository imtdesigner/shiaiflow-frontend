import { useCallback, useEffect, useState } from 'react';
import { Message } from '../components/TournamentShell';
import { amIAdmin, listOrganizationAccounts, setAccountVerified } from '../lib/api';
import './TournamentPages.css';

const KIND = { dojo: 'Dojo', regional: 'National / regional federation', continental: 'Continental federation', person: 'Former dojo / federation, now individual' };

/**
 * App admins verify dojo and federation accounts: check that the organization
 * is real and that its email and data match its website, then verify.
 * Unverified organizations can set up tournaments but not publish or start them.
 */
function AdminAccounts() {
  const [admin, setAdmin] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const reload = useCallback(async () => {
    try { setAccounts(await listOrganizationAccounts()); } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, []);

  useEffect(() => { amIAdmin().then((a) => { setAdmin(a); if (a) reload(); }); }, [reload]);

  const toggle = async (acc, verified) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await setAccountVerified(acc.id, verified);
      await reload();
      setMsg({ type: 'success', text: `${acc.name || acc.email} ${verified ? 'verified' : 'is no longer verified'}.` });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  if (admin === null) return <div className="tp-page">Loading…</div>;
  if (!admin) return <div className="tp-page"><Message type="error">This page is for the app admins.</Message></div>;

  const pending = accounts.filter((a) => !a.verified_at).length;
  return (
    <div className="tp-page">
      <h2>Accounts to verify</h2>
      <p className="tp-subtitle">Dojos, federations and former ones turned individual — {pending} waiting for approval</p>
      <Message type={msg.type || 'info'}>{msg.text}</Message>
      {accounts.length === 0 ? <p className="tp-muted">No accounts to verify yet.</p> : (
        <div className="tp-card">
          <table className="tp-table">
            <thead>
              <tr><th>Organization</th><th>Login email</th><th>Website</th><th>Place</th><th>Responsible person</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name || '—'}</strong><div className="tp-muted">{KIND[a.role]}</div></td>
                  <td>{a.email}</td>
                  <td>{a.website ? <a href={a.website} target="_blank" rel="noreferrer">{a.website}</a> : '—'}</td>
                  <td>{[a.city, a.country].filter(Boolean).join(', ') || '—'}</td>
                  <td>{a.contact_name || '—'}{a.contact_email && <div className="tp-muted">{a.contact_email}</div>}</td>
                  <td>
                    {a.verified_at
                      ? <span className="tp-badge ok">verified {new Date(a.verified_at).toLocaleDateString()}</span>
                      : <span className="tp-badge warn">waiting</span>}
                  </td>
                  <td>
                    {a.verified_at
                      ? <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => toggle(a, false)}>Withdraw</button>
                      : <button type="button" className="tp-btn small" disabled={busy} onClick={() => toggle(a, true)}>Verify</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminAccounts;
