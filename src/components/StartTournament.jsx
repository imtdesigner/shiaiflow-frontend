import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEntriesFor, tournamentOrganizers } from '../lib/api';
import { myRole, startTournament } from '../lib/runApi';
import { Message } from './TournamentShell';

/**
 * "Start tournament" with a short readiness check per category: drawn or not,
 * how many entries are marked present. Shown in Registration (after the
 * check-in on the day) and in Manage. Owner / organizer only; a dojo /
 * federation account waiting for verification cannot start.
 */
export default function StartTournament({ tournament, categories, onStarted }) {
  const [counts, setCounts] = useState(null);
  const [role, setRole] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const live = categories.filter((c) => c.status !== 'cancelled');
  const drawn = live.filter((c) => c.status !== 'registration');
  const notDrawn = live.filter((c) => c.status === 'registration');
  const key = live.map((c) => `${c.id}:${c.status}`).join();

  useEffect(() => {
    if (!tournament?.id) return;
    myRole(tournament.id).then(setRole).catch(() => setRole(null));
    tournamentOrganizers([tournament.id]).then((o) => setWaiting(!!o[tournament.id] && !o[tournament.id].verified)).catch(() => {});
  }, [tournament?.id]);

  useEffect(() => {
    if (!drawn.length) { setCounts(new Map()); return; }
    listEntriesFor(drawn.map((c) => c.id)).then((ens) => {
      const m = new Map();
      for (const e of ens) {
        const c = m.get(e.category_id) ?? { total: 0, present: 0 };
        c.total += 1; if (e.checked_in) c.present += 1;
        m.set(e.category_id, c);
      }
      setCounts(m);
    }).catch(() => setCounts(new Map()));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tournament || !['owner', 'organizer'].includes(role)) return null;

  if (tournament.status === 'running') {
    return (
      <div className="tp-card">
        <h3>Tournament <span className="tp-badge ok">running</span></h3>
        <p className="tp-muted" style={{ marginTop: 0 }}>Scoretables and court displays are live. Corrections and court overview in Manage.</p>
        <div className="tp-actions"><Link className="tp-btn secondary" to={`/tournament/${tournament.id}/manage`}>Manage</Link></div>
      </div>
    );
  }

  const start = async () => {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await startTournament(tournament, categories);
      setMsg({ type: 'success', text: 'Tournament started. Every shiaijo has its order of fights.' });
      await onStarted?.();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div id="g-start" className="tp-card">
      <h3>Start the tournament</h3>
      <Message type={msg.type || 'info'}>{msg.text}</Message>
      <table className="tp-table">
        <thead><tr><th>Category</th><th>Draw</th><th>Present</th></tr></thead>
        <tbody>
          {live.map((c) => {
            const n = counts?.get(c.id);
            const done = c.status !== 'registration';
            return (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{done ? <span className="tp-badge ok">drawn</span> : <span className="tp-badge warn">not drawn</span>}</td>
                <td>{done && n ? <span className={`tp-badge ${n.present === n.total ? 'ok' : 'warn'}`}>{n.present} / {n.total}</span> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {notDrawn.length > 0 && (
        <p className="tp-muted">
          Not drawn: {notDrawn.map((c) => c.name).join(', ')} — they can still be drawn after the start and are added at the end of their courts.
          {' '}<Link to={`/tournament/${tournament.id}/drawings`}>Drawings</Link>
        </p>
      )}
      <p className="tp-muted">
        Starting freezes the order of fights on every shiaijo and opens the scoretables. Absent entries should be replaced or
        withdrawn first in Drawings → Adjust the draw.
      </p>
      {waiting && <Message type="info">The organizer's account is waiting for approval by the app admins — the tournament can be started once it is approved.</Message>}
      <div className="tp-actions">
        <button type="button" className="tp-btn" disabled={busy || drawn.length === 0 || waiting}
          onClick={() => { if (window.confirm('Start the tournament now? The order of fights on every shiaijo is frozen.')) start(); }}>
          {busy ? 'Starting…' : 'Start tournament'}
        </button>
      </div>
    </div>
  );
}
