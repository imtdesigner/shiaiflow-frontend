import { useCallback, useEffect, useState } from 'react';
import { Message } from '../components/TournamentShell';
import { accountWaiting, amIAdmin, listAllAccounts, setAccountReview, setAccountVerified } from '../lib/api';
import './TournamentPages.css';
import { fmtDate } from '../lib/format.js';

const KIND = { dojo: 'Dojo', regional: 'National / regional federation', continental: 'Continental federation', person: 'Former dojo / federation, now individual' };

/**
 * App admins verify dojo and federation accounts: check that the organization
 * is real and that its email and data match its website, then verify.
 * Unverified organizations can set up tournaments but not publish or start them.
 * Instead of verifying, an admin can ask for more information or reject, with a
 * note the account sees in its profile and gets by email; the account corrects
 * its data and sends it again. Below, every account grouped by kind.
 */
function AdminAccounts() {
  const [admin, setAdmin] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [answer, setAnswer] = useState(null); // { id, state, note } while writing a note

  const reload = useCallback(async () => {
    try { setAccounts(await listAllAccounts()); } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, []);

  useEffect(() => { amIAdmin().then((a) => { setAdmin(a); if (a) reload(); }); }, [reload]);

  const toggle = async (acc, verified) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await setAccountVerified(acc.id, verified);
      await reload();
      setMsg({ type: 'success', text: `${acc.name || acc.email} ${verified ? 'verified — they get an email' : 'is no longer verified'}.` });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const sendAnswer = async (acc) => {
    if (!answer.note.trim()) { setMsg({ type: 'error', text: 'Write a short note for the account.' }); return; }
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await setAccountReview(acc.id, answer.state, answer.note.trim());
      setAnswer(null);
      await reload();
      setMsg({ type: 'success', text: `${acc.name || acc.email}: ${answer.state === 'rejected' ? 'rejected' : 'more information asked'} — they get an email.` });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  if (admin === null) return <div className="tp-page">Loading…</div>;
  if (!admin) return <div className="tp-page"><Message type="error">This page is for the app admins.</Message></div>;

  const orgRow = (a) => (
                <tr key={a.id}>
                  <td><strong>{a.name || '—'}</strong><div className="tp-muted">{KIND[a.role]}</div></td>
                  <td>{a.email}</td>
                  <td>{a.website ? <a href={a.website} target="_blank" rel="noreferrer">{a.website}</a> : '—'}</td>
                  <td>{[a.city, a.country].filter(Boolean).join(', ') || '—'}</td>
                  <td>{a.contact_name || '—'}{a.contact_email && <div className="tp-muted">{a.contact_email}</div>}</td>
                  <td>
                    {a.verified_at
                      ? <span className="tp-badge ok">verified {fmtDate(a.verified_at)}</span>
                      : a.review_state
                        ? <span className="tp-badge warn" title={a.review_note ?? ''}>{a.review_state === 'rejected' ? 'rejected' : 'more info asked'}</span>
                        : <span className="tp-badge warn">waiting</span>}
                    {!a.verified_at && a.review_note && <div className="tp-muted" style={{ maxWidth: '16rem' }}>“{a.review_note}”</div>}
                  </td>
                  <td>
                    {answer?.id === a.id ? (
                      <div style={{ display: 'grid', gap: '0.4rem', minWidth: '16rem' }}>
                        <strong>{answer.state === 'rejected' ? 'Reject' : 'Ask for more information'}</strong>
                        <textarea rows={3} autoFocus value={answer.note} onChange={(e) => setAnswer({ ...answer, note: e.target.value })}
                          placeholder={answer.state === 'rejected' ? 'Why — e.g. the website does not show this dojo' : 'What is missing — e.g. a website or an official email of the dojo'} />
                        <div className="tp-actions" style={{ marginTop: 0 }}>
                          <button type="button" className={`tp-btn small ${answer.state === 'rejected' ? 'danger' : ''}`} disabled={busy} onClick={() => sendAnswer(a)}>Send</button>
                          <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => setAnswer(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="tp-actions" style={{ marginTop: 0, flexWrap: 'nowrap' }}>
                        {a.verified_at
                          ? <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => toggle(a, false)}>Withdraw</button>
                          : <button type="button" className="tp-btn small" disabled={busy} onClick={() => toggle(a, true)}>Verify</button>}
                        {!a.verified_at && (
                          <>
                            <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => setAnswer({ id: a.id, state: 'needs_info', note: '' })}>Ask info</button>
                            <button type="button" className="tp-btn danger small" disabled={busy} onClick={() => setAnswer({ id: a.id, state: 'rejected', note: '' })}>Reject</button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
  );

  const ORG = ['dojo', 'regional', 'continental'];
  const toReview = accounts.filter((a) => !a.verified_at && (ORG.includes(a.role) || a.needs_review));
  const reviewed = new Set(toReview.map((a) => a.id));
  const rest = accounts.filter((a) => !reviewed.has(a.id));
  const groups = [
    { title: 'Dojos', list: rest.filter((a) => a.role === 'dojo') },
    { title: 'National / regional federations', list: rest.filter((a) => a.role === 'regional') },
    { title: 'Continental federations', list: rest.filter((a) => a.role === 'continental') },
  ];
  const people = rest.filter((a) => !ORG.includes(a.role));
  const pending = toReview.filter(accountWaiting).length;
  const orgHead = <tr><th>Organization</th><th>Login email</th><th>Website</th><th>Place</th><th>Responsible person</th><th>Status</th><th /></tr>;

  return (
    <div className="tp-page">
      <h2>Accounts</h2>
      <p className="tp-subtitle">{accounts.length} accounts — {pending} waiting for approval</p>
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      <div className="tp-card">
        <h3>To verify <span className={`tp-badge ${pending ? 'warn' : 'ok'}`}>{toReview.length}</span></h3>
        {toReview.length === 0 ? <p className="tp-muted">Nothing waiting.</p> : (
          <table className="tp-table"><thead>{orgHead}</thead><tbody>{toReview.map(orgRow)}</tbody></table>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.title} className="tp-card">
          <h3>{g.title} <span className="tp-badge">{g.list.length}</span></h3>
          {g.list.length === 0 ? <p className="tp-muted">None yet.</p> : (
            <table className="tp-table"><thead>{orgHead}</thead><tbody>{g.list.map(orgRow)}</tbody></table>
          )}
        </div>
      ))}

      <div className="tp-card">
        <h3>Individuals <span className="tp-badge">{people.length}</span></h3>
        {people.length === 0 ? <p className="tp-muted">None yet.</p> : (
          <table className="tp-table">
            <thead><tr><th>Name</th><th>Email</th><th>Place</th><th>Dojo</th><th>Joined</th></tr></thead>
            <tbody>
              {people.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name || '—'}</strong>{a.verified_at && a.needs_review && <div className="tp-muted">former dojo / federation, approved</div>}</td>
                  <td>{a.email}</td>
                  <td>{[a.city, a.country].filter(Boolean).join(', ') || '—'}</td>
                  <td>{a.dojo_name || '—'}</td>
                  <td>{a.created_at ? fmtDate(a.created_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminAccounts;
