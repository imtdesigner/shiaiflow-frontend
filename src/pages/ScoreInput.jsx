import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BackToDashboard, Message, entryName, useTournament,
} from '../components/TournamentShell';
import { listBouts, listEntriesFor, listEventsFor } from '../lib/api';
import {
  addDaihyosen, boutOf, confirmLineups, finishBout, finishFight, listEvents, listMatchBouts,
  listRunFights, listTeamMembers, myRole, previousLineup, reopenBout, reopenFight,
  listFightingSpirit, proposeFightingSpirit, sendScoreOp, setFightFields, startBout, startEncho, startFight, subscribeFights,
} from '../lib/runApi';
import { createOutbox, eventsWithOps, fightsWithOps } from '../lib/outbox.js';
import { DaihyosenPanel, LineupPanel, personName } from '../components/TeamLineup';
import {
  POSITION_LABELS, boutRows, defaultLineup, teamMatchStep,
} from '../lib/tournament/team.js';
import { slotLabel } from '../lib/tournament/ko.js';
import { fightMarks } from '../lib/tournament/poolView.js';
import { SpiritPopup } from '../components/FightingSpirit';
import { lastFightOnCourt } from '../lib/tournament/results.js';
import { COURT_SCREEN, courtScreenUrl } from '../components/TableDevice';
import PoolStandings, { poolMembers, usePoolData } from '../components/PoolStandings';
import {
  courtQueue, currentFight, fightRules, fightSeconds, fightStatus, koRound, phaseLabel, waitingForFighter,
} from '../lib/tournament/run.js';
import { boutResult, canSosai, scoringOptions } from '../lib/tournament/scoring.js';
import './TournamentPages.css';
import './Scoreinput.css';

const POINTS = ['M', 'K', 'D', 'T'];
const POINT_NAME = { M: 'Men', K: 'Kote', D: 'Do', T: 'Tsuki' };
const ORDER = ['senpo', 'jiho', 'chuken', 'fukusho', 'taisho', 'daihyosen'];
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Scorekeeping manager for one shiaijo: the current fight, score buttons, the shared
 * timer (hajime / yame; stops on every point), and what to do at time up —
 * finish, hikiwake, encho or hantei by the category's rules. Several screens
 * can follow the same court (realtime). Managers can reopen finished fights.
 */
function ScoreInput() {
  const { tournamentId, tournament, categories, error: loadError, loading } = useTournament();
  const [params, setParams] = useSearchParams();
  const [role, setRole] = useState(null);
  const [fights, setFights] = useState([]);
  const [entries, setEntries] = useState([]);
  const [events, setEvents] = useState([]);
  const [bouts, setBouts] = useState([]); // team match: position bouts of the current match
  // a point waits for the table's confirmation (after the chief referee's call): the time keeps running until then
  const [pending, setPending] = useState(null); // { side, type }
  const [loadedFor, setLoadedFor] = useState(null); // fight whose events / bouts are loaded
  const [teamInfo, setTeamInfo] = useState(null); // team match: { red, white: { name, members } } + lineup defaults
  const [pickedId, setPickedId] = useState(null);
  const [manualTimeUp, setManualTimeUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [now, setNow] = useState(Date.now());
  const stopping = useRef(null);
  // Score and timer clicks show at once and go to a queue on this device (lib/outbox.js):
  // sent in order, kept through a network drop or a page reload, sent again when back online.
  const outboxRef = useRef(null);
  const [box, setBox] = useState({ size: 0, sending: false, offline: false, error: null });
  const waiting = () => (outboxRef.current?.size() ?? 0) > 0;
  const ops = () => outboxRef.current?.pending() ?? [];
  const cacheKey = `sf-st-cache-${tournamentId}`;

  const manager = role === 'owner' || role === 'organizer';
  const court = Number(params.get('court') ?? 1);
  const drawn = useMemo(() => categories.filter((c) => !['registration', 'cancelled'].includes(c.status)), [categories]);
  const byId = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  useEffect(() => {
    myRole(tournamentId).then(setRole).catch(() => setRole(null));
  }, [tournamentId]);

  const reload = useCallback(async () => {
    const ids = drawn.map((c) => c.id);
    try {
      const [fs, ens] = await Promise.all([listRunFights(ids), listEntriesFor(ids)]);
      setFights(fightsWithOps(fs, ops()));
      setEntries(ens);
      try { localStorage.setItem(cacheKey, JSON.stringify({ fights: fs, entries: ens })); } catch { /* full */ }
    } catch (e) {
      // no connection: carry on with what this device saw last
      try {
        const c = JSON.parse(localStorage.getItem(cacheKey) ?? 'null');
        if (c) { setFights(fightsWithOps(c.fights, ops())); setEntries(c.entries); return; }
      } catch { /* nothing cached */ }
      setMsg({ type: 'error', text: e.message });
    }
  }, [drawn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);
  // live changes: only the fights (entries do not change during a fight)
  const reloadFights = useCallback(async () => {
    try { setFights(fightsWithOps(await listRunFights(drawn.map((c) => c.id)), ops())); } catch { /* offline: keep what is on screen */ }
  }, [drawn]); // eslint-disable-line react-hooks/exhaustive-deps

  const queue = useMemo(() => courtQueue(fights, drawn, court), [fights, drawn, court]);
  const fight = useMemo(() => {
    const picked = pickedId && queue.find((f) => f.id === pickedId);
    if (picked && picked.status !== 'finished') return picked;
    return currentFight(queue);
  }, [queue, pickedId]);

  const isTeamFight = !!fight && byId[fight.category_id]?.kind === 'team';
  // the fight on screen now: answers for an earlier fight (a slow request) are dropped
  const shownId = useRef(null);
  shownId.current = fight?.id ?? null;
  const reloadEvents = useCallback(async () => {
    if (!fight) { setEvents([]); setBouts([]); return; }
    const id = fight.id;
    const key = `sf-st-events-${id}`;
    try {
      const [evs, bs] = await Promise.all([listEvents(id), isTeamFight ? listMatchBouts(id) : []]);
      if (shownId.current !== id) return;
      setEvents(eventsWithOps(evs, ops(), id)); setBouts(bs); setLoadedFor(id);
      try { localStorage.setItem(key, JSON.stringify({ evs, bs })); } catch { /* full */ }
    } catch (e) {
      try {
        const c = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (c && shownId.current === id) { setEvents(eventsWithOps(c.evs, ops(), id)); setBouts(c.bs); setLoadedFor(id); return; }
      } catch { /* nothing cached */ }
      setMsg({ type: 'error', text: e.message });
    }
  }, [fight?.id, isTeamFight]); // eslint-disable-line react-hooks/exhaustive-deps
  // another fight on screen: start empty, never with the previous fight's score
  useEffect(() => { setEvents([]); setBouts([]); setPending(null); }, [fight?.id]);

  // team match: both teams' members (lineup choices, names) and the proposed lineups
  useEffect(() => {
    setTeamInfo(null);
    if (!isTeamFight || !fight) return;
    const teamOf = (id) => entries.find((e) => e.id === id)?.team;
    const red = teamOf(fight.red_entry_id);
    const white = teamOf(fight.white_entry_id);
    if (!red || !white) return;
    let gone = false;
    (async () => {
      try {
        const [ms, prevRed, prevWhite] = await Promise.all([
          listTeamMembers([red.id, white.id]),
          previousLineup(fight, fight.red_entry_id), previousLineup(fight, fight.white_entry_id),
        ]);
        const size = byId[fight.category_id]?.team_size;
        const of = (t) => ms.filter((m) => m.team_id === t.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        if (gone) return;
        setTeamInfo({
          red: { name: red.name, members: of(red) },
          white: { name: white.name, members: of(white) },
          defaults: { red: defaultLineup(size, of(red), prevRed), white: defaultLineup(size, of(white), prevWhite) },
        });
      } catch (e) { setMsg({ type: 'error', text: e.message }); }
    })();
    return () => { gone = true; };
  }, [fight?.id, fight?.red_entry_id, fight?.white_entry_id, isTeamFight, entries]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reloadEvents(); setManualTimeUp(false); }, [reloadEvents]);

  // realtime: other screens on this court (and the manager) see the same
  useEffect(() => subscribeFights(tournamentId, () => {
    if (waiting()) return; // our own clicks are still being saved
    reloadFights(); reloadEvents();
  }, 150), [tournamentId, reloadFights, reloadEvents]);

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const category = fight ? byId[fight.category_id] : null;
  const opts = scoringOptions(category);
  const round = category ? koRound(category, fight.ko_no) : null;
  // A team match is scored bout by bout: `unit` is what the score buttons act on —
  // the fight itself, or the current position bout / daihyosen of a team match.
  const team = isTeamFight;
  const step = !team ? null
    : loadedFor !== fight.id ? { step: 'loading' }
      : teamMatchStep(category, fight.phase, bouts, events, opts);
  const teamBout = step?.step === 'bout' ? step.bout : null;
  const unit = !fight ? null : !team ? fight
    : teamBout ? { ...fight, status: teamBout.status, is_encho: teamBout.is_encho, decision: teamBout.decision, fusen: teamBout.fusen } : null;
  const unitEvents = team ? events.filter((e) => e.bout_id === teamBout?.id) : events;
  const rules = !category ? null
    : !team ? fightRules(category, fight.phase, round)
      : teamBout?.position === 'daihyosen' ? fightRules(category, 'daihyosen', round)
        : { ...fightRules(category, fight.phase === 'ko' ? 'ko' : 'pool', round), tie: 'hikiwake', hantei: false, ipponshobu: false }; // a bout in a team match may end hikiwake
  const useTimer = tournament?.use_timer ?? true;
  const limitSec = !unit || !rules ? null
    : unit.is_encho ? rules.enchoSeconds
      : rules.ipponshobu ? null
        : fightSeconds(category, fight.phase === 'ipponshobu' ? 'pool' : fight.phase, round);
  const elapsed = fight ? fight.timer_elapsed_ms + (fight.timer_started_at ? now - new Date(fight.timer_started_at).getTime() : 0) : 0;
  const remaining = limitSec == null ? null : limitSec * 1000 - elapsed;
  const timeUp = useTimer ? remaining != null && remaining <= 0 : manualTimeUp;
  const bout = unit ? boutOf(unit, unitEvents) : { events: [] };
  const status = unit && rules ? fightStatus(bout, rules, { encho: unit.is_encho, timeUp }, opts) : null;
  const totals = unit ? boutResult(bout, opts).totals : null; // FIK marks: points, then Ht / O for the winner
  useEffect(() => { setManualTimeUp(false); }, [teamBout?.id]);

  const run = async (fn) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await outboxRef.current?.flush();
      if (waiting()) throw new Error('No connection — the score is saved on this device and sent when the connection is back. Starting or finishing a fight needs the connection.');
      const out = await fn(); await reload(); await reloadEvents(); return out;
    }
    catch (e) { setMsg({ type: 'error', text: e.message }); return null; }
    finally { setBusy(false); }
  };

  // time up while running → stop the clock once
  useEffect(() => {
    if (!fight?.timer_started_at || remaining == null || remaining > 0 || stopping.current === fight.id) return;
    stopping.current = fight.id;
    const f = fight;
    const ms = Math.round(f.timer_elapsed_ms + (Date.now() - new Date(f.timer_started_at).getTime()));
    patchFight(f.id, { timer_elapsed_ms: ms, timer_started_at: null });
    outboxRef.current?.push({ kind: 'timer', matchId: f.id, startedAt: null, elapsedMs: ms });
    stopping.current = null;
  }, [fight, remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchFight = (id, fields) => setFights((fs) => fs.map((f) => (f.id === id ? { ...f, ...fields } : f)));

  // the queue for this tournament: created once, sends what an earlier visit left, refreshes when empty
  const refreshRef = useRef(() => {});
  refreshRef.current = () => { reload(); reloadEvents(); };
  useEffect(() => {
    let had = 0;
    const ob = createOutbox({
      key: `sf-outbox-${tournamentId}`, storage: localStorage, send: sendScoreOp,
      onChange: (st) => {
        setBox(st);
        if (st.error) setMsg({ type: 'error', text: `Not saved: ${st.error}` });
        if (had > 0 && st.size === 0 && !st.sending) refreshRef.current();
        had = st.size;
      },
    });
    outboxRef.current = ob;
    setBox({ size: ob.size(), sending: false, offline: false, error: null });
    ob.flush();
    const online = () => ob.flush();
    window.addEventListener('online', online);
    return () => { window.removeEventListener('online', online); ob.stop(); };
  }, [tournamentId]);

  /** Stop the clock on screen and queue the stop (absolute value, so it can be sent later). */
  const stopClock = (f) => {
    if (!f.timer_started_at) return;
    const ms = Math.round(f.timer_elapsed_ms + (Date.now() - new Date(f.timer_started_at).getTime()));
    patchFight(f.id, { timer_elapsed_ms: ms, timer_started_at: null });
    outboxRef.current?.push({ kind: 'timer', matchId: f.id, startedAt: null, elapsedMs: ms });
  };

  const confirmPoint = () => { const p = pending; setPending(null); if (p) point(p.side, p.type); };

  const point = (side, type) => {
    const f = fight;
    const boutId = teamBout?.id ?? null;
    stopClock(f); // yame on every point
    const clientId = crypto.randomUUID();
    setEvents((ev) => [...ev, { id: clientId, client_id: clientId, bout_id: boutId, side, type }]);
    outboxRef.current?.push({ kind: 'event', matchId: f.id, clientId, side, type, boutId });
  };

  const hajime = () => {
    const f = fight;
    const startedAt = new Date().toISOString();
    patchFight(f.id, { timer_started_at: startedAt });
    outboxRef.current?.push({ kind: 'timer', matchId: f.id, startedAt, elapsedMs: f.timer_elapsed_ms });
  };

  const yame = () => {
    const f = fight;
    stopClock(f);
  };

  const undo = () => {
    const id = fight.id;
    const boutId = teamBout?.id ?? null;
    const mine = (e) => (e.bout_id ?? null) === boutId;
    const i = events.map(mine).lastIndexOf(true);
    if (i < 0) return;
    const last = events[i];
    setEvents((ev) => ev.filter((e) => e !== last));
    outboxRef.current?.push(last.client_id
      ? { kind: 'delete', matchId: id, clientId: last.client_id }
      : { kind: 'delete', matchId: id, eventId: last.id });
  };

  const finish = (extra = {}) => run(async () => {
    if (teamBout) { await finishBout(fight, teamBout, extra); return; } // next bout follows
    if (Object.keys(extra).length) await setFightFields(fight, extra);
    const res = fightStatus({ ...bout, ...extra }, rules, { encho: fight.is_encho, timeUp: true }, opts);
    const out = await finishFight(fight, res, category);
    setPickedId(null);
    if (out?.message) setMsg({ type: 'info', text: out.message });
  });

  const name = (f, side) => {
    const id = side === 'red' ? f.red_entry_id : f.white_entry_id;
    const e = entries.find((x) => x.id === id);
    if (e) return entryName(e);
    const code = side === 'red' ? f.red_code : f.white_code;
    return code ? slotLabel(code, byId[f.category_id]?.pool_size === 1) : '—';
  };
  const club = (f, side) => {
    const e = entries.find((x) => x.id === (side === 'red' ? f.red_entry_id : f.white_entry_id));
    return e?.team?.club ?? e?.competitor?.club ?? '';
  };
  const roundOf = (f) => phaseLabel(byId[f.category_id], f);

  // team match: last bout that can be reopened by a manager (not an empty-position fusen)
  const lastBout = team ? [...bouts].filter((b) => b.status === 'finished' && b.red_competitor_id && b.white_competitor_id)
    .sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position)).at(-1) ?? null : null;
  /** Team match so far: every position with its fighters and result, the current one marked. */
  const TeamProgress = () => {
    if (!bouts.length) return null;
    return (
      <table className="tp-table st-team">
        <tbody>
          {[...bouts].sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position)).map((b) => {
            const res = boutResult({ events: events.filter((e) => e.bout_id === b.id), decision: b.decision, fusen: b.fusen, encho: !!b.is_encho }, opts);
            const t = res.totals;
            const mark = (side) => t[side].ippons.join(' ');
            const draw = b.status === 'finished' && res.draw;
            return (
              <tr key={b.id} className={b.id === teamBout?.id ? 'current' : b.status}>
                <td className="st-team-pos">{POSITION_LABELS[b.position]}</td>
                <td className="st-team-red">{memberName(b.red_competitor_id) ?? '—'}</td>
                <td className="st-sym-h">{'▲'.repeat(t.red.shown)}</td>
                <td className="st-sym-pts red">{mark('red')}</td>
                <td className="st-sym-mid">{draw ? 'X' : ':'}</td>
                <td className="st-sym-pts">{mark('white')}</td>
                <td className="st-sym-h">{'▲'.repeat(t.white.shown)}</td>
                <td>{memberName(b.white_competitor_id) ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const upcoming = queue.filter((f) => f.status !== 'finished' && f.id !== fight?.id);
  const finished = queue.filter((f) => f.status === 'finished').slice(-6).reverse();

  // points of the finished fights in the list (ippons and hansoku only)
  const finishedKey = finished.map((f) => `${f.id}:${f.finished_at ?? ''}`).join();
  const [done, setDone] = useState({ events: [], bouts: [] });
  useEffect(() => {
    const ids = finishedKey ? finishedKey.split(',').map((k) => k.split(':')[0]) : [];
    if (!ids.length) { setDone({ events: [], bouts: [] }); return; }
    Promise.all([listEventsFor(ids), listBouts(ids)])
      .then(([events, bouts]) => setDone({ events, bouts }))
      .catch(() => {});
  }, [finishedKey]);
  const resultOf = (f) => fightMarks(byId[f.category_id], f, done.events, done.bouts);

  // pools fought on this shiaijo (at least one fight started): a button each, standings in a popup
  const courtPoolIds = [...new Set(queue.filter((f) => f.phase === 'pool' && f.status !== 'scheduled').map((f) => f.pool_id))];
  const courtPoolCats = [...new Set(queue.filter((f) => courtPoolIds.includes(f.pool_id)).map((f) => f.category_id))];
  const poolData = usePoolData(courtPoolCats, fights);
  const courtPools = courtPoolIds.map((id) => poolData.pools.find((p) => p.id === id)).filter(Boolean);
  const [shownPool, setShownPool] = useState(null);
  const entryNameById = (id) => { const e = entries.find((x) => x.id === id); return e ? entryName(e) : '—'; };
  const courts = Array.from({ length: tournament?.shiaijo_count ?? 2 }, (_, i) => i + 1);

  // Fighting spirit: after the table's last fight of a category on this shiaijo, ask once
  const spiritOn = tournament?.fighting_spirit !== false && tournament?.status === 'running';
  const doneCats = spiritOn ? drawn.filter((c) => lastFightOnCourt(fights, c.id, court)).map((c) => c.id) : [];
  const doneKey = doneCats.join();
  const [proposals, setProposals] = useState(null);
  const laterKey = `sf-spirit-later-${tournamentId}-${court}`;
  const [later, setLater] = useState(() => { try { return JSON.parse(sessionStorage.getItem(laterKey) ?? '[]'); } catch { return []; } });
  useEffect(() => {
    if (!doneKey) { setProposals([]); return; }
    listFightingSpirit(doneKey.split(',')).then(setProposals).catch(() => {});
  }, [doneKey, court]);
  const spiritCat = proposals && fight?.status !== 'running'
    ? drawn.find((c) => doneCats.includes(c.id) && !later.includes(c.id) && !proposals.some((p) => p.category_id === c.id && p.shiaijo === court))
    : null;
  const spiritLater = (id) => {
    const next = [...later, id];
    setLater(next);
    try { sessionStorage.setItem(laterKey, JSON.stringify(next)); } catch { /* private mode */ }
  };

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  // team match: the fighter of this bout (club line = the team)
  const memberName = (id) => personName([...(teamInfo?.red.members ?? []), ...(teamInfo?.white.members ?? [])]
    .find((m) => m.competitor_id === id)?.competitor);
  const unitName = (side) => (teamBout ? memberName(side === 'red' ? teamBout.red_competitor_id : teamBout.white_competitor_id) : name(fight, side));
  const unitClub = (side) => (teamBout ? name(fight, side) : club(fight, side));

  const sideBlock = (side) => (
    <div className={`st-side ${side}`}>
      <div className="st-name">{unitName(side)}</div>
      <div className="st-club">{unitClub(side)}</div>
      <div className="st-marks">
        {totals[side].ippons.join(' ') || '·'}
        {totals[side].shown > 0 && <span className="st-hansoku">{'▲'.repeat(totals[side].shown)}</span>}
      </div>
      {unit.status === 'running' && !status?.over && (
        <div className="st-buttons">
          {POINTS.map((p) => (
            <button key={p} type="button" className={`st-btn ippon ${side} ${pending?.side === side && pending.type === p ? 'pending' : ''}`}
              onClick={() => setPending({ side, type: p })}>{p}</button>
          ))}
          <button type="button" className={`st-btn hansoku ippon ${side}`} onClick={() => point(side, 'hansoku')}>▲ Hansoku</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="tp-page st-page">
      <BackToDashboard />
      <div className="st-head">
        <h2>Shiaijo {court}</h2>
        <span className={`st-net ${box.offline ? 'off' : box.size ? 'wait' : 'on'}`}
          title={box.offline ? 'No connection — clicks are kept on this device and sent when it is back' : box.size ? 'Saving…' : 'Connected, everything saved'}>
          {box.offline ? `● Offline — ${box.size} click${box.size === 1 ? '' : 's'} waiting` : box.size ? `● Saving ${box.size}…` : '● Online'}
        </span>
        <select value={court} onChange={(e) => { setParams({ court: e.target.value }); setPickedId(null); }}>
          {courts.map((n) => <option key={n} value={n}>Shiaijo {n}</option>)}
        </select>
        <span className="tp-muted">{tournament?.name}</span>
        {tournament && (
          <a className="tp-btn secondary small st-screen-link" href={courtScreenUrl(tournament, court)} target={`sf-court-${court}`} rel="noreferrer"
            title="Open in a second window, drag it to the TV next to the shiaijo, full screen (F11)">{COURT_SCREEN} ↗</a>
        )}
      </div>
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      {tournament?.status !== 'running' && (
        <Message type="info">
          The tournament has not been started yet. {manager && <Link to={`/tournament/${tournamentId}/manage`}>Start it in Manage</Link>}
        </Message>
      )}

      {!fight ? (
        <div className="tp-card"><p className="tp-muted">No fight ready on this shiaijo{upcoming.length ? ' — waiting for fighters from earlier fights.' : '.'}</p></div>
      ) : (
        <div className="tp-card st-fight">
          <div className="st-fight-head">
            <strong>{fight.label}</strong> · {category?.name} · {roundOf(fight)}
            {team && <> · {name(fight, 'red')} – {name(fight, 'white')}</>}
            {teamBout && <span className="tp-badge">{POSITION_LABELS[teamBout.position]}</span>}
            {unit?.is_encho && teamBout?.position !== 'daihyosen' && <span className="tp-badge warn">encho</span>}
            {unit?.status === 'scheduled' && <span className="tp-muted"> · not started</span>}
          </div>
          {waitingForFighter(fight) && (
            <div className="st-waiting">
              <p><strong>Waiting:</strong> {name(fight, 'red')} – {name(fight, 'white')} — the fighter comes from a fight that is not finished yet.</p>
              <p className="tp-muted">This is the next fight on this shiaijo. Wait for it, or start a later fight on purpose with Take next below.</p>
            </div>
          )}

          {team && <TeamProgress />}
          {team && !waitingForFighter(fight) && step.step === 'lineup' && teamInfo && (
            <LineupPanel teamSize={category.team_size} teams={teamInfo} defaults={teamInfo.defaults} busy={busy}
              onConfirm={(l) => run(() => confirmLineups(fight, boutRows(category.team_size, l.red, l.white)))} />
          )}
          {team && step.step === 'daihyosen' && teamInfo && (
            <DaihyosenPanel teams={teamInfo} busy={busy}
              defaults={{ red: bouts.find((b) => b.position === 'taisho')?.red_competitor_id ?? null, white: bouts.find((b) => b.position === 'taisho')?.white_competitor_id ?? null }}
              onStart={(p) => run(() => addDaihyosen(fight, p.red, p.white))} />
          )}
          {team && step.step === 'finish' && (
            <div className="tp-actions st-actions">
              <button type="button" className="tp-btn" disabled={busy} onClick={() => run(async () => {
                const out = await finishFight(fight, { winner: step.winner }, category);
                setPickedId(null);
                if (out?.message) setMsg({ type: 'info', text: out.message });
              })}>
                Finish team match — {step.winner ? `${name(fight, step.winner)} wins` : 'draw (hikiwake)'}
              </button>
              {manager && lastBout && (
                <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => run(() => reopenBout(lastBout))}>
                  Correct: reopen {POSITION_LABELS[lastBout.position]}
                </button>
              )}
            </div>
          )}

          {unit && !waitingForFighter(fight) && (<>
          <div className="st-board">
            {sideBlock('red')}
            <div className="st-center">
              {useTimer ? (
                <>
                  <div className={`st-clock ${timeUp ? 'up' : ''}`}>{remaining == null ? mmss(elapsed) : mmss(remaining)}</div>
                  {unit.status === 'running' && !status?.over && !timeUp && (
                    fight.timer_started_at
                      ? <button type="button" className="st-btn big" onClick={yame}>Yame</button>
                      : <button type="button" className="st-btn big go" onClick={hajime}>Hajime</button>
                  )}
                </>
              ) : (
                unit.status === 'running' && !status?.over && (
                  <button type="button" className={`st-btn big ${manualTimeUp ? 'go' : ''}`} onClick={() => setManualTimeUp(!manualTimeUp)}>
                    {manualTimeUp ? 'Time up ✓' : 'Time up'}
                  </button>
                )
              )}
              {unit.status === 'running' && (
                <button type="button" className="st-btn small" disabled={unitEvents.length === 0} onClick={undo}>Undo last</button>
              )}
            </div>
            {sideBlock('white')}
          </div>

          {pending && unit.status === 'running' && !status?.over && (
            <div className={`st-confirm ${pending.side}`}>
              <span><strong>{POINT_NAME[pending.type]} ({pending.type})</strong> for {pending.side === 'red' ? 'red' : 'white'} — {unitName(pending.side)}?</span>
              <button type="button" className="st-btn go" onClick={confirmPoint}>✓ Confirm</button>
              <button type="button" className="st-btn" onClick={() => setPending(null)}>✕ Cancel</button>
              <span className="st-confirm-note">The time keeps running until you confirm.</span>
            </div>
          )}


          <div className="tp-actions st-actions">
            {unit.status === 'scheduled' && (
              <>
                <button type="button" className="tp-btn" disabled={busy || !fight.red_entry_id || !fight.white_entry_id}
                  onClick={() => run(() => (teamBout ? startBout(fight, teamBout, queue) : startFight(fight, queue)))}>
                  {teamBout ? `Start ${POSITION_LABELS[teamBout.position]}` : 'Start fight'}
                </button>
                {!teamBout && (
                  <>
                    <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => run(async () => { await startFight(fight, queue); await finishFightFusen('red'); })}>Red wins OO</button>
                    <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => run(async () => { await startFight(fight, queue); await finishFightFusen('white'); })}>White wins OO</button>
                  </>
                )}
              </>
            )}
            {unit.status === 'running' && status?.next === 'finish' && (
              <button type="button" className="tp-btn" disabled={busy} onClick={() => finish()}>
                Finish — {unitName(status.winner)} wins
              </button>
            )}
            {unit.status === 'running' && status?.next === 'hikiwake' && (
              <button type="button" className="tp-btn" disabled={busy} onClick={() => finish()}>Finish — hikiwake</button>
            )}
            {unit.status === 'running' && (status?.next === 'encho') && (
              <button type="button" className="tp-btn" disabled={busy} onClick={() => run(() => startEncho(fight))}>Encho</button>
            )}
            {unit.status === 'running' && (status?.next === 'hantei' || (rules?.hantei && unit.is_encho && timeUp && status?.draw)) && (
              <>
                <button type="button" className="tp-btn" disabled={busy} onClick={() => finish({ decision: 'red' })}>Hantei — red</button>
                <button type="button" className="tp-btn" disabled={busy} onClick={() => finish({ decision: 'white' })}>Hantei — white</button>
              </>
            )}
            {unit.status === 'running' && !status?.over && canSosai(bout, opts) && (
              <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => point('red', 'sosai')}
                title="1–1 and both commit their 2nd hansoku at the same time: both ▲ stay, no point (FIK Art. 20)">▲▲ Sosai (both)</button>
            )}
            {unit.status === 'running' && !status?.over && (
              <>
                <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => finish({ fusen: 'red' })}
                  title="Injury or kiken of white: red gets two points (one in encho), white keeps the points scored">Red wins OO</button>
                <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => finish({ fusen: 'white' })}
                  title="Injury or kiken of red: white gets two points (one in encho), red keeps the points scored">White wins OO</button>
              </>
            )}
          </div>
          </>)}
          {team && !waitingForFighter(fight) && step.step === 'lineup' && fight.status === 'scheduled' && (
            <div className="tp-actions st-actions">
              <span className="tp-muted">Team did not come:</span>
              <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => run(async () => { await startFight(fight, queue); await finishFightFusen('red'); })}>{name(fight, 'red')} wins OO</button>
              <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => run(async () => { await startFight(fight, queue); await finishFightFusen('white'); })}>{name(fight, 'white')} wins OO</button>
            </div>
          )}
        </div>
      )}

      {courtPools.length > 0 && (
        <div className="st-pools">
          <span className="tp-muted">Pool standings:</span>
          {courtPools.map((p) => (
            <button key={p.id} type="button" className="tp-btn secondary small" onClick={() => setShownPool(p)}>
              {byId[p.category_id]?.name} · Pool {p.number}
            </button>
          ))}
        </div>
      )}
      {spiritCat && (
        <SpiritPopup key={spiritCat.id} category={spiritCat} court={court} onLater={() => spiritLater(spiritCat.id)}
          onSave={async (id) => {
            await proposeFightingSpirit(spiritCat.id, court, id);
            setProposals((p) => [...(p ?? []), { category_id: spiritCat.id, shiaijo: court, competitor_id: id }]);
            setMsg({ type: 'success', text: id ? `Fighting spirit proposal for ${spiritCat.name} sent to the organizer.` : `No Fighting spirit proposal for ${spiritCat.name}.` });
          }} />
      )}
      {shownPool && (
        <div className="st-popup-back" onClick={() => setShownPool(null)} role="presentation">
          <div className="st-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pool standings">
            <button type="button" className="st-popup-close" onClick={() => setShownPool(null)} title="Close">✕</button>
            <PoolStandings category={byId[shownPool.category_id]} pool={shownPool} members={poolMembers(shownPool)}
              fights={fights} events={poolData.events} bouts={poolData.bouts} known={poolData.known} nameOf={entryNameById}
              title={`${byId[shownPool.category_id]?.name} · Pool ${shownPool.number}`} />
          </div>
        </div>
      )}

      <div className="st-lists">
        <div className="tp-pool">
          <h4>Next on shiaijo {court}</h4>
          {upcoming.length === 0 ? <p className="tp-muted">Nothing left.</p> : (
            <ol>
              {upcoming.slice(0, 8).map((f) => (
                <li key={f.id}>
                  <strong>{f.label}</strong> <span className="tp-muted">{byId[f.category_id]?.name}</span>
                  {' '}<span className="st-red">{name(f, 'red')}</span> – <span className="st-white">{name(f, 'white')}</span>
                  {f.status === 'scheduled' && f.red_entry_id && f.white_entry_id && (
                    <button type="button" className="tp-btn secondary small" style={{ marginLeft: '0.4rem' }}
                      disabled={busy || fight?.status === 'running'} onClick={() => setPickedId(f.id)}>
                      Take next
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="tp-pool">
          <h4>Finished</h4>
          {finished.length === 0 ? <p className="tp-muted">None yet.</p> : (
            <table className="st-finished">
              <tbody>
                {finished.map((f) => {
                  const r = resultOf(f);
                  // name · ▲ · points : points · ▲ · name — the middle stays the middle
                  const split = (m) => { const h = (m || '').match(/▲+/)?.[0] ?? ''; return { h, pts: (m || '').replace(/▲+/, '').trim() }; };
                  const red = split(r.red);
                  const white = split(r.white);
                  return (
                    <tr key={f.id}>
                      <td><strong>{f.label}</strong></td>
                      <td className="st-red st-fin-name left">{name(f, 'red')}</td>
                      <td className="st-sym-h">{red.h}</td>
                      <td className="st-sym-pts red st-red">{red.pts}</td>
                      <td className="st-sym-mid">{!f.winner_entry_id ? 'X' : ':'}</td>
                      <td className="st-sym-pts st-white">{white.pts}</td>
                      <td className="st-sym-h">{white.h}</td>
                      <td className="st-white st-fin-name">{name(f, 'white')}</td>
                      {manager && (
                        <td>
                          <button type="button" className="tp-btn secondary small"
                            disabled={busy || fight?.status === 'running'} onClick={() => { setPickedId(f.id); run(() => reopenFight(f)); }}>
                            Correct
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );

  async function finishFightFusen(side) {
    await setFightFields(fight, { fusen: side });
    const res = fightStatus({ events: [], fusen: side }, rules, { timeUp: true }, opts);
    const out = await finishFight({ ...fight, status: 'running' }, res, category);
    if (out?.message) setMsg({ type: 'info', text: out.message });
  }
}

export default ScoreInput;
