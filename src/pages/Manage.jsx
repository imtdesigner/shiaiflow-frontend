import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BackToDashboard, Message, entryName, useTournament,
} from '../components/TournamentShell';
import { listEntriesFor } from '../lib/api';
import {
  getPin, listRunFights, setPin, startTournament, subscribeFights,
} from '../lib/runApi';
import { slotLabel } from '../lib/tournament/ko.js';
import { courtQueue, currentFight } from '../lib/tournament/run.js';
import './TournamentPages.css';

const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

/**
 * Manage: start the tournament and watch every shiaijo live — the fight on
 * the court, what comes next, progress. One PIN per tournament for editors
 * and tables; they join at /join/<tournament> with it.
 */
function Manage() {
  const {
    tournamentId, tournament, categories, reload: reloadTournament, error: loadError, loading,
  } = useTournament();
  const [fights, setFights] = useState([]);
  const [entries, setEntries] = useState([]);
  const [pin, setPinState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const drawn = useMemo(() => categories.filter((c) => !['registration', 'cancelled'].includes(c.status)), [categories]);
  const notDrawn = categories.filter((c) => c.status === 'registration');
  const byId = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const courts = Array.from({ length: tournament?.shiaijo_count ?? 2 }, (_, i) => i + 1);
  const running = tournament?.status === 'running';
  const joinUrl = `${window.location.origin}/join/${tournamentId}`;

  const reload = useCallback(async () => {
    const ids = drawn.map((c) => c.id);
    try {
      const [fs, ens, p] = await Promise.all([listRunFights(ids), listEntriesFor(ids), getPin(tournamentId)]);
      setFights(fs);
      setEntries(ens);
      setPinState(p);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [drawn, tournamentId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => subscribeFights(`manage-${tournamentId}`, reload), [tournamentId, reload]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await fn(); await reloadTournament(); await reload(); if (ok) setMsg({ type: 'success', text: ok }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };

  const name = (f, side) => {
    const id = side === 'red' ? f.red_entry_id : f.white_entry_id;
    const e = entries.find((x) => x.id === id);
    if (e) return entryName(e);
    const code = side === 'red' ? f.red_code : f.white_code;
    return code ? slotLabel(code, byId[f.category_id]?.pool_size === 1) : '—';
  };

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Manage tournament</h2>
      <p className="tp-subtitle">{tournament?.name}</p>
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      <div className="tp-card">
        <h3>
          Status <span className={`tp-badge ${running ? 'ok' : ''}`}>{tournament?.status}</span>
        </h3>
        {notDrawn.length > 0 && (
          <Message type="info">
            Not drawn yet: {notDrawn.map((c) => c.name).join(', ')}. <Link to={`/tournament/${tournamentId}/drawings`}>Draw</Link>
          </Message>
        )}
        <div className="tp-actions">
          {!running && (
            <button type="button" className="tp-btn" disabled={busy || drawn.length === 0}
              onClick={() => run(() => startTournament(tournament, categories), 'Tournament started. Every shiaijo has its order of fights.')}>
              Start tournament
            </button>
          )}
          <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/fights`}>Fight plan</Link>
          <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/shiaijo`}>Shiaijo plan</Link>
        </div>
        <p className="tp-muted">
          Starting freezes the order on every shiaijo. Categories drawn later are added at the end of their courts.
        </p>
      </div>

      <div className="tp-card">
        <h3>PIN for editors and tables</h3>
        <p className="tp-muted" style={{ marginTop: 0 }}>
          One PIN for this tournament. Before the start it lets editors change the tournament; after the start the same
          PIN opens the scoretables (each table picks its shiaijo) and Manage. Share <strong>{joinUrl}</strong>.
        </p>
        <div className="tp-actions">
          <strong style={{ fontSize: '1.4rem', letterSpacing: '0.2em' }}>{pin ?? '—'}</strong>
          <button type="button" className="tp-btn secondary small" disabled={busy}
            onClick={() => run(() => setPin(tournamentId, randomPin()))}>
            {pin ? 'New PIN' : 'Create PIN'}
          </button>
          {courts.map((n) => (
            <Link key={n} className="tp-btn small" to={`/tournament/${tournamentId}/score?court=${n}`}>Scoretable {n}</Link>
          ))}
        </div>
      </div>

      <div className="tp-pools">
        {courts.map((n) => {
          const queue = courtQueue(fights, drawn, n);
          const now = currentFight(queue);
          const done = queue.filter((f) => f.status === 'finished').length;
          const next = queue.filter((f) => f.status !== 'finished' && f.id !== now?.id).slice(0, 3);
          return (
            <div className="tp-pool" key={n}>
              <h4>Shiaijo {n} <span className="tp-muted">· {done}/{queue.length} done</span></h4>
              {now ? (
                <p>
                  <span className={`tp-badge ${now.status === 'running' ? 'ok' : ''}`}>{now.status === 'running' ? 'fighting' : 'next'}</span>
                  {' '}<strong>{now.label}</strong> {byId[now.category_id]?.name}<br />
                  <span className="aka">{name(now, 'red')}</span> – <span className="shiro">{name(now, 'white')}</span>
                </p>
              ) : <p className="tp-muted">{queue.length && done === queue.length ? 'All fights done.' : 'Waiting.'}</p>}
              {next.length > 0 && (
                <ol>
                  {next.map((f) => <li key={f.id}><strong>{f.label}</strong> {name(f, 'red')} – {name(f, 'white')}</li>)}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Manage;
