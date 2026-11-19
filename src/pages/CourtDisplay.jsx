import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { entryName } from '../components/TournamentShell';
import {
  getTournament, listCategories, listEntriesFor, listEventsFor, resolveTournament,
} from '../lib/api';
import { listRunFights, subscribeFights } from '../lib/runApi';
import { isUuid } from '../lib/tournament/days.js';
import { slotLabel } from '../lib/tournament/ko.js';
import { courtQueue, currentFight, koRoundLabel } from '../lib/tournament/run.js';
import { boutTotals, scoringOptions } from '../lib/tournament/scoring.js';
import './CourtDisplay.css';

/** How long a just-finished fight stays on the big board (before the next one starts). */
const SHOW_RESULT_MS = 20000;

/**
 * /<tournament>/court/<n>: big read-only screen for the monitor next to a
 * shiaijo (owner, 2026-11-19). Anyone with the link, no login. Shows the
 * fight in progress (names, clubs, points, hansoku, encho — no timer, it is
 * not allowed on the court display), the result of the fight that just ended
 * for a short while, the last result and the next 3 fights. Default: shiro
 * left, aka right (as the shinpan see it); a button swaps the sides for this
 * screen (remembered in this browser).
 */
export default function CourtDisplay() {
  const { tournamentId: key, court: courtParam } = useParams();
  const court = Number(courtParam) || 1;
  const [tid, setTid] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [categories, setCategories] = useState([]);
  const [fights, setFights] = useState([]);
  const [entries, setEntries] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const flipKey = tid ? `sf-display-flip-${tid}-${court}` : null;
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    resolveTournament(key, isUuid(key))
      .then((r) => (r.id ? setTid(r.id) : setError('No published tournament with this link.')))
      .catch(() => setError('No published tournament with this link.'));
  }, [key]);

  useEffect(() => {
    if (!flipKey) return;
    try { setFlipped(localStorage.getItem(flipKey) === '1'); } catch { /* private mode */ }
  }, [flipKey]);
  const flip = () => {
    setFlipped((f) => {
      try { localStorage.setItem(flipKey, f ? '0' : '1'); } catch { /* private mode */ }
      return !f;
    });
  };

  const drawn = useMemo(() => categories.filter((c) => !['registration', 'cancelled'].includes(c.status)), [categories]);
  const byCat = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  const load = useCallback(async () => {
    if (!tid) return;
    try {
      const [t, cats] = await Promise.all([getTournament(tid), listCategories(tid)]);
      const ids = cats.filter((c) => !['registration', 'cancelled'].includes(c.status)).map((c) => c.id);
      const [fs, ens] = await Promise.all([listRunFights(ids), listEntriesFor(ids)]);
      const queue = courtQueue(fs.filter((f) => f.shiaijo === court), cats, court);
      const shown = [currentFight(queue), queue.filter((f) => f.status === 'finished').sort(byFinish).at(-1)]
        .filter(Boolean).map((f) => f.id);
      const evs = await listEventsFor(shown);
      setTournament(t); setCategories(cats); setFights(fs); setEntries(ens); setEvents(evs);
      setError('');
    } catch {
      setError('This tournament is not published, or it does not exist.');
    }
  }, [tid, court]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => (tid ? subscribeFights(`display-${tid}-${court}`, load) : undefined), [tid, court, load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const queue = useMemo(() => courtQueue(fights, drawn, court), [fights, drawn, court]);
  const current = currentFight(queue);
  const last = queue.filter((f) => f.status === 'finished').sort(byFinish).at(-1) ?? null;
  // right after a fight ends its result stays big until the next fight starts (at most SHOW_RESULT_MS)
  const showLast = last && (!current || current.status !== 'running')
    && now - new Date(last.finished_at).getTime() < SHOW_RESULT_MS;
  const big = showLast ? last : current;
  const next = queue.filter((f) => f.status !== 'finished' && f.id !== current?.id).slice(0, 3);

  const entryOf = (f, side) => entries.find((e) => e.id === (side === 'red' ? f.red_entry_id : f.white_entry_id));
  const name = (f, side) => {
    const e = entryOf(f, side);
    if (e) return entryName(e);
    const code = side === 'red' ? f.red_code : f.white_code;
    return code ? slotLabel(code, byCat[f.category_id]?.pool_size === 1) : '—';
  };
  const club = (f, side) => {
    const e = entryOf(f, side);
    return e?.team?.club ?? e?.competitor?.club ?? '';
  };
  const roundOf = (f) => (f.phase === 'pool' ? 'Pool' : f.phase === 'ipponshobu' ? 'Ipponshobu'
    : koRoundLabel(byCat[f.category_id], f.ko_no));
  const marks = (f, side) => {
    if (f.fusen === side) return ['O', 'O'];
    const opts = scoringOptions(byCat[f.category_id]);
    const t = boutTotals({ events: events.filter((e) => e.match_id === f.id) }, opts);
    if (f.decision === side && t.red.ippons.length === t.white.ippons.length) return opts.ipponShobu ? ['H'] : ['H', 'H'];
    return t[side].ippons;
  };
  const hansoku = (f, side) => boutTotals({ events: events.filter((e) => e.match_id === f.id) }, scoringOptions(byCat[f.category_id]))[side].hansoku;

  // shiro left, aka right by default; flipped = aka left
  const order = flipped ? ['red', 'white'] : ['white', 'red'];

  if (error) return <div className="cd-page cd-empty"><p>{error}</p><Link to="/">ShiaiFlow</Link></div>;
  if (!tournament) return <div className="cd-page cd-empty"><p>Loading…</p></div>;

  const side = (f, s) => {
    const winner = f.status === 'finished' && f.winner_entry_id
      && f.winner_entry_id === (s === 'red' ? f.red_entry_id : f.white_entry_id);
    const h = hansoku(f, s);
    return (
      <div className={`cd-side ${s} ${winner ? 'won' : ''}`}>
        <div className="cd-colour">{s === 'red' ? 'AKA' : 'SHIRO'}</div>
        <div className="cd-name">{name(f, s)}</div>
        <div className="cd-club">{club(f, s)}</div>
        <div className="cd-marks">
          {marks(f, s).map((m, i) => <span key={i} className="cd-mark">{m}</span>)}
        </div>
        <div className="cd-hansoku">{h > 0 ? '▲'.repeat(h) : ''}</div>
        {winner && <div className="cd-winner">WINNER</div>}
      </div>
    );
  };

  const line = (f) => (
    <>
      <span className="cd-label">{f.label}</span>
      <span className="cd-cat">{byCat[f.category_id]?.name} · {roundOf(f)}</span>
      <span className={`cd-who ${order[0]}`}>{name(f, order[0])}</span>
      <span className="cd-vs">–</span>
      <span className={`cd-who ${order[1]}`}>{name(f, order[1])}</span>
    </>
  );

  return (
    <div className="cd-page">
      <header className="cd-head">
        <span className="cd-court">SHIAIJO {court}</span>
        <span className="cd-tournament">{tournament.name}</span>
        <span className="cd-tools">
          <button type="button" onClick={flip} title="Swap aka and shiro on this screen">⇄ Sides</button>
          <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} title="Full screen">⛶</button>
        </span>
      </header>

      {big ? (
        <main className="cd-board">
          <div className="cd-fight">
            <span className="cd-label">{big.label}</span>
            <span>{byCat[big.category_id]?.name} · {roundOf(big)}</span>
            {big.is_encho && big.status !== 'finished' && <span className="cd-encho">ENCHO</span>}
            {showLast && <span className="cd-final">RESULT</span>}
            {big.status === 'finished' && !big.winner_entry_id && <span className="cd-final">HIKIWAKE</span>}
            {big.status === 'scheduled' && <span className="cd-soon">next fight</span>}
          </div>
          <div className="cd-sides">
            {side(big, order[0])}
            {side(big, order[1])}
          </div>
        </main>
      ) : (
        <main className="cd-board cd-empty">
          <p>{queue.length && queue.every((f) => f.status === 'finished') ? 'All fights on this shiaijo are finished.' : 'Waiting for the next fight…'}</p>
        </main>
      )}

      <footer className="cd-foot">
        {last && !showLast && (
          <div className="cd-last">
            <h3>Last result</h3>
            <div className="cd-row">
              {line(last)}
              <span className="cd-score">{marks(last, order[0]).join('') || '–'} : {marks(last, order[1]).join('') || '–'}</span>
            </div>
          </div>
        )}
        <div className="cd-next">
          <h3>Next</h3>
          {next.length === 0 ? <p className="cd-muted">Nothing left on this shiaijo.</p> : next.map((f) => (
            <div key={f.id} className="cd-row">{line(f)}</div>
          ))}
        </div>
      </footer>
    </div>
  );
}

function byFinish(a, b) {
  return new Date(a.finished_at ?? 0) - new Date(b.finished_at ?? 0);
}
