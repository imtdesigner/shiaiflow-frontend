import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { entryName } from '../components/TournamentShell';
import {
  getTournament, listBouts, listCategories, listEntriesFor, listEventsFor, resolveTournament,
} from '../lib/api';
import { listRunFights, subscribeFights } from '../lib/runApi';
import { isUuid } from '../lib/tournament/days.js';
import { slotLabel } from '../lib/tournament/ko.js';
import { courtQueue, currentFight, koRoundLabel } from '../lib/tournament/run.js';
import { boutTotals, firstPointSide, scoringOptions } from '../lib/tournament/scoring.js';
import { POSITION_LABELS, teamBoard } from '../lib/tournament/team.js';
import './CourtDisplay.css';

/**
 * /<tournament>/court/<n>: big read-only screen for the monitor next to a
 * shiaijo (owner, 2026-11-19). Anyone with the link, no login. Full-width
 * bands: last result, the fight in progress (each fighter in one row: name,
 * points, hansoku; encho — no timer, it is not allowed on the court display),
 * the next 3 fights. Team matches: last / next show team against team; the
 * match in progress shows every position bout once both lineups are known
 * (3 or 5 + daihyosen), before that team against team. Default: shiro
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
  const [bouts, setBouts] = useState([]);
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
      const [evs, bs] = await Promise.all([listEventsFor(shown), listBouts(shown)]);
      setTournament(t); setCategories(cats); setFights(fs); setEntries(ens); setEvents(evs); setBouts(bs);
      setError('');
    } catch {
      setError('This tournament is not published, or it does not exist.');
    }
  }, [tid, court]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => (tid ? subscribeFights(`display-${tid}-${court}`, load) : undefined), [tid, court, load]);
  // safety net: if the realtime connection drops (venue wifi), still refresh every 30 s
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // keep the TV / laptop screen on (Screen Wake Lock; asked again when the page is shown again)
  useEffect(() => {
    let lock = null;
    const ask = async () => {
      if (document.visibilityState !== 'visible' || !navigator.wakeLock) return;
      try { lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed: battery saver etc. */ }
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => { document.removeEventListener('visibilitychange', ask); lock?.release().catch(() => {}); };
  }, []);

  // hide the mouse pointer after 3 s without movement
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = setTimeout(() => setIdle(true), 3000);
    const move = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 3000); };
    window.addEventListener('pointermove', move);
    return () => { clearTimeout(t); window.removeEventListener('pointermove', move); };
  }, []);

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
  // a "record" is what the marks are read from: a fight, or one bout of a team match
  const recOf = (f) => ({ events: events.filter((e) => e.match_id === f.id && !e.bout_id), decision: f.decision, fusen: f.fusen, cat: byCat[f.category_id] });
  const boutRec = (f, row) => ({ events: row.events, decision: row.bout?.decision, fusen: row.bout?.fusen, cat: byCat[f.category_id] });
  const totalsOf = (r) => boutTotals({ events: r.events }, scoringOptions(r.cat));
  const marks = (r, side) => {
    if (r.fusen === side) return ['O', 'O'];
    const t = totalsOf(r);
    if (r.decision === side && t.red.ippons.length === t.white.ippons.length) return scoringOptions(r.cat).ipponShobu ? ['H'] : ['H', 'H'];
    return t[side].ippons;
  };
  // the first point of the fight is circled (only the scorer's first ippon), the rest are letters
  const firstSide = (r) => (r.fusen || r.decision ? null : firstPointSide({ events: r.events }, scoringOptions(r.cat)));
  const markList = (r, s, size = 'big') => marks(r, s).map((m, i) => (
    <span key={i} className={`cd-mark ${i === 0 && firstSide(r) === s ? 'first' : ''} ${size}`}>{m}</span>
  ));
  const isTeam = (f) => byCat[f.category_id]?.kind === 'team';
  const boardOf = (f) => teamBoard(byCat[f.category_id]?.team_size, bouts.filter((b) => b.match_id === f.id),
    events.filter((e) => e.match_id === f.id && e.bout_id), scoringOptions(byCat[f.category_id]));
  const personName = (c) => (c ? (c.display_name || `${c.last_name}${c.first_name ? ` ${c.first_name}` : ''}`) : '—');
  const hikiwake = (f) => f.status === 'finished' && !f.winner_entry_id;
  const won = (f, s) => f.status === 'finished' && !!f.winner_entry_id
    && f.winner_entry_id === (s === 'red' ? f.red_entry_id : f.white_entry_id);

  // shiro left, aka right by default; flipped = aka left
  const order = flipped ? ['red', 'white'] : ['white', 'red'];

  if (error) return <div className="cd-page cd-empty"><p>{error}</p><Link to="/">ShiaiFlow</Link></div>;
  if (!tournament) return <div className="cd-page cd-empty"><p>Loading…</p></div>;

  /** One fighter in one row: name, hansoku right by it, then the points towards the middle (mirrored on the right). */
  const fighter = (f, s, right) => {
    const r = recOf(f);
    const h = totalsOf(r)[s].hansoku;
    // two lines: surname, then first name (a team: its name); font from the room left next to the points (vw)
    const c = entryOf(f, s)?.competitor;
    const lines = c && !c.display_name && c.first_name ? [c.last_name, c.first_name] : [name(f, s)];
    const room = 39 - marks(r, s).length * 8.7 - (h ? 3.5 : 0);
    const longest = Math.max(...lines.map((l) => l.length), 1);
    const size = Math.max(3, Math.min(5, room / (0.62 * longest)));
    return (
      <div className={`cd-fighter ${s} ${right ? 'right' : ''}`}>
        <span className="cd-name" style={{ fontSize: `${size}vw` }}>
          {lines.map((l) => <span key={l} className="cd-name-line">{l}</span>)}
        </span>
        {h > 0 && <span className="cd-hansoku">{'▲'.repeat(h)}</span>}
        <span className="cd-marks">{markList(r, s)}</span>
      </div>
    );
  };

  /** Team match in progress with both lineups: one row per position, the running bout highlighted. */
  const teamRows = (f, board) => (
    <div className="cd-team">
      <div className="cd-team-row head">
        {[order[0], order[1]].map((s, i) => (
          <div key={s} className={`cd-team-side ${s} ${i ? 'right' : ''}`}><span className="cd-team-name">{name(f, s)}</span></div>
        ))}
        <span className="cd-pos score">
          {order.map((s) => board.totals[s === 'red' ? 'redWins' : 'whiteWins']).join(' : ')}
          <small>{order.map((s) => board.totals[s === 'red' ? 'redIppons' : 'whiteIppons']).join(' : ')} ippons</small>
        </span>
      </div>
      {board.rows.map((row) => {
        const r = boutRec(f, row);
        const draw = row.status === 'finished' && row.result.draw;
        return (
          <div key={row.position} className={`cd-team-row ${row.status}`}>
            {[order[0], order[1]].map((s, i) => {
              const h = totalsOf(r)[s].hansoku;
              return (
                <div key={s} className={`cd-team-side ${s} ${i ? 'right' : ''}`}>
                  <span className="cd-member">{personName(row.bout?.[s])}</span>
                  {h > 0 && <span className="cd-hansoku small">{'▲'.repeat(h)}</span>}
                  <span className="cd-marks">{markList(r, s, 'mid')}</span>
                </div>
              );
            })}
            <span className="cd-pos">
              {POSITION_LABELS[row.position]}
              {(draw || row.bout?.is_encho) && <b>{draw ? 'X' : 'E'}</b>}
            </span>
          </div>
        );
      })}
    </div>
  );

  const fightInfo = (f) => (
    <>
      <span className="cd-label">{f.label}</span>
      <span className="cd-info">{byCat[f.category_id]?.name} · {roundOf(f)}</span>
    </>
  );

  return (
    <div className={`cd-page ${idle ? 'idle' : ''}`}>
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
            {isTeam(last) ? (
              <span className="cd-score">
                {(() => {
                  const t = boardOf(last).totals;
                  const w = (s) => (s === 'red' ? t.redWins : t.whiteWins);
                  const ip = (s) => (s === 'red' ? t.redIppons : t.whiteIppons);
                  return <>{w(order[0])}<span className="cd-vs">{hikiwake(last) ? 'X' : ':'}</span>{w(order[1])}<span className="cd-ippons">({ip(order[0])}:{ip(order[1])})</span></>;
                })()}
              </span>
            ) : (
              <span className="cd-score">
                <span className="cd-score-side left">{markList(recOf(last), order[0], 'small')}</span>
                <span className="cd-vs">{hikiwake(last) ? 'X' : last.is_encho ? 'E' : ':'}</span>
                <span className="cd-score-side">{markList(recOf(last), order[1], 'small')}</span>
              </span>
            )}
            <span className={`cd-who ${order[1]} ${won(last, order[1]) ? 'won' : ''}`}>{name(last, order[1])}</span>
          </div>
        ) : <p className="cd-muted">No fight finished yet.</p>}
      </section>

      <main className="cd-band cd-board">
        {current ? (
          <>
            <div className="cd-fight">
              {fightInfo(current)}
              {current.status === 'scheduled' && <span className="cd-soon">next fight</span>}
            </div>
            {isTeam(current) && boardOf(current).ready ? teamRows(current, boardOf(current)) : (
            <div className="cd-fighters">
              {fighter(current, order[0], false)}
              {fighter(current, order[1], true)}
              {(hikiwake(current) || current.is_encho) && (
                <span className="cd-mid">{hikiwake(current) ? 'X' : 'E'}</span>
              )}
            </div>
            )}
            {isTeam(current) && !boardOf(current).ready && <p className="cd-note">Lineups are shown once both teams have confirmed them.</p>}
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
