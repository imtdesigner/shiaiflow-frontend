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

/**
 * /<tournament>/court/<n>: big read-only screen for the monitor next to a
 * shiaijo (owner, 2026-11-19). Anyone with the link, no login. Full-width
 * bands: last result, the fight in progress (each fighter in one row: name,
 * points, hansoku; encho — no timer, it is not allowed on the court display),
 * the next 3 fights. Default: shiro
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

  const queue = useMemo(() => courtQueue(fights, drawn, court), [fights, drawn, court]);
  const current = currentFight(queue);
  const last = queue.filter((f) => f.status === 'finished').sort(byFinish).at(-1) ?? null;
  const next = queue.filter((f) => f.status !== 'finished' && f.id !== current?.id).slice(0, 3);

  const entryOf = (f, side) => entries.find((e) => e.id === (side === 'red' ? f.red_entry_id : f.white_entry_id));
  const name = (f, side) => {
    const e = entryOf(f, side);
    if (e) return entryName(e);
    const code = side === 'red' ? f.red_code : f.white_code;
    return code ? slotLabel(code, byCat[f.category_id]?.pool_size === 1) : '—';
  };
  const roundOf = (f) => (f.phase === 'pool' ? 'Pool' : f.phase === 'ipponshobu' ? 'Ipponshobu'
    : koRoundLabel(byCat[f.category_id], f.ko_no));
  const totalsOf = (f) => boutTotals({ events: events.filter((e) => e.match_id === f.id) }, scoringOptions(byCat[f.category_id]));
  const marks = (f, side) => {
    if (f.fusen === side) return ['O', 'O'];
    const t = totalsOf(f);
    if (f.decision === side && t.red.ippons.length === t.white.ippons.length) return scoringOptions(byCat[f.category_id]).ipponShobu ? ['H'] : ['H', 'H'];
    return t[side].ippons;
  };
  const won = (f, s) => f.status === 'finished' && !!f.winner_entry_id
    && f.winner_entry_id === (s === 'red' ? f.red_entry_id : f.white_entry_id);

  // shiro left, aka right by default; flipped = aka left
  const order = flipped ? ['red', 'white'] : ['white', 'red'];

  if (error) return <div className="cd-page cd-empty"><p>{error}</p><Link to="/">ShiaiFlow</Link></div>;
  if (!tournament) return <div className="cd-page cd-empty"><p>Loading…</p></div>;

  /** One fighter in one row: name, then points and hansoku towards the middle (mirrored on the right). */
  const fighter = (f, s, right) => {
    const h = totalsOf(f)[s].hansoku;
    return (
      <div className={`cd-fighter ${s} ${right ? 'right' : ''}`}>
        <span className="cd-name">{name(f, s)}</span>
        <span className="cd-marks">
          {marks(f, s).map((m, i) => <span key={i} className="cd-mark">{m}</span>)}
          {h > 0 && <span className="cd-hansoku">{'▲'.repeat(h)}</span>}
        </span>
      </div>
    );
  };

  const fightInfo = (f) => (
    <span className="cd-info"><span className="cd-label">{f.label}</span> {byCat[f.category_id]?.name} · {roundOf(f)}</span>
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

      <section className="cd-band cd-last">
        <h3>Last result</h3>
        {last ? (
          <div className="cd-row">
            {fightInfo(last)}
            <span className={`cd-who left ${order[0]} ${won(last, order[0]) ? 'won' : ''}`}>{name(last, order[0])}</span>
            <span className="cd-score">
              {marks(last, order[0]).join(' ') || '–'}<span className="cd-vs">:</span>{marks(last, order[1]).join(' ') || '–'}
              {!last.winner_entry_id && <span className="cd-draw">hikiwake</span>}
            </span>
            <span className={`cd-who ${order[1]} ${won(last, order[1]) ? 'won' : ''}`}>{name(last, order[1])}</span>
          </div>
        ) : <p className="cd-muted">No fight finished yet.</p>}
      </section>

      <main className="cd-band cd-board">
        {current ? (
          <>
            <div className="cd-fight">
              {fightInfo(current)}
              {current.is_encho && <span className="cd-encho">ENCHO</span>}
              {current.status === 'scheduled' && <span className="cd-soon">next fight</span>}
            </div>
            <div className="cd-fighters">
              {fighter(current, order[0], false)}
              {fighter(current, order[1], true)}
            </div>
          </>
        ) : (
          <p className="cd-wait">{queue.length && queue.every((f) => f.status === 'finished') ? 'All fights on this shiaijo are finished.' : 'Waiting for the next fight…'}</p>
        )}
      </main>

      <section className="cd-band cd-next">
        <h3>Next</h3>
        {next.length === 0 ? <p className="cd-muted">Nothing left on this shiaijo.</p> : next.map((f) => (
          <div key={f.id} className="cd-row">
            {fightInfo(f)}
            <span className={`cd-who left ${order[0]}`}>{name(f, order[0])}</span>
            <span className="cd-vs">–</span>
            <span className={`cd-who ${order[1]}`}>{name(f, order[1])}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function byFinish(a, b) {
  return new Date(a.finished_at ?? 0) - new Date(b.finished_at ?? 0);
}
