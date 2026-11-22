import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BackToDashboard, Message, entryName, useTournament,
} from '../components/TournamentShell';
import { listBouts, listEntriesFor, listEventsFor } from '../lib/api';
import {
  addDaihyosen, addEvent, boutOf, confirmLineups, deleteEvent, finishBout, finishFight, listEvents, listMatchBouts,
  listRunFights, listTeamMembers, myRole, previousLineup, reopenBout, reopenFight,
  setFightFields, startBout, startEncho, startFight, subscribeFights, timerStart, timerStop,
} from '../lib/runApi';
import { DaihyosenPanel, LineupPanel, personName } from '../components/TeamLineup';
import {
  POSITION_LABELS, boutRows, defaultLineup, teamMatchStep,
} from '../lib/tournament/team.js';
import { slotLabel } from '../lib/tournament/ko.js';
import { fightMarks } from '../lib/tournament/poolView.js';
import PoolStandings, { poolMembers, usePoolData } from '../components/PoolStandings';
import {
  courtQueue, currentFight, fightRules, fightSeconds, fightStatus, koRound, koRoundLabel,
} from '../lib/tournament/run.js';
import { boutTotals, scoringOptions } from '../lib/tournament/scoring.js';
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
 * Scoretable for one shiaijo: the current fight, score buttons, the shared
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
  // Score and timer actions show at once and are sent in order in the background,
  // so fast clicks are never lost; screens refresh once the queue is empty.
  const queueRef = useRef(Promise.resolve());
  const pendingRef = useRef(0);

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
      setFights(fs);
      setEntries(ens);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [drawn]);

  useEffect(() => { reload(); }, [reload]);
  // live changes: only the fights (entries do not change during a fight)
  const reloadFights = useCallback(async () => {
    try { setFights(await listRunFights(drawn.map((c) => c.id))); } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [drawn]);

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
    if (pendingRef.current > 0) return; // local clicks not saved yet — refresh after the queue
    const id = fight.id;
    try {
      const [evs, bs] = await Promise.all([listEvents(id), isTeamFight ? listMatchBouts(id) : []]);
      if (shownId.current !== id) return;
      setEvents(evs); setBouts(bs); setLoadedFor(id);
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
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
  }, [fight?.id, isTeamFight, entries]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reloadEvents(); setManualTimeUp(false); }, [reloadEvents]);

  // realtime: other screens on this court (and the manager) see the same
  useEffect(() => subscribeFights(tournamentId, () => {
    if (pendingRef.current > 0) return; // our own clicks are still being saved
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
  const totals = unit ? boutTotals({ events: unitEvents }, opts) : null;
  useEffect(() => { setManualTimeUp(false); }, [teamBout?.id]);

  const run = async (fn) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await queueRef.current; const out = await fn(); await reload(); await reloadEvents(); return out; }
    catch (e) { setMsg({ type: 'error', text: e.message }); return null; }
    finally { setBusy(false); }
  };

  // time up while running → stop the clock once
  useEffect(() => {
    if (!fight?.timer_started_at || remaining == null || remaining > 0 || stopping.current === fight.id) return;
    stopping.current = fight.id;
    timerStop(fight).then(() => { stopping.current = null; reload(); });
  }, [fight, remaining, reload]);

  const patchFight = (id, fields) => setFights((fs) => fs.map((f) => (f.id === id ? { ...f, ...fields } : f)));

  /** Queue a server call; the screen was already updated by the caller. */
  const enqueue = (fn) => {
    pendingRef.current += 1;
    queueRef.current = queueRef.current
      .then(fn)
      .catch((e) => setMsg({ type: 'error', text: e.message }))
      .finally(() => {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) { reload(); reloadEvents(); }
      });
  };

  const stopClock = (f) => {
    if (!f.timer_started_at) return;
    const ms = Math.round(f.timer_elapsed_ms + (Date.now() - new Date(f.timer_started_at).getTime()));
    patchFight(f.id, { timer_elapsed_ms: ms, timer_started_at: null });
  };

  const confirmPoint = () => { const p = pending; setPending(null); if (p) point(p.side, p.type); };

  const point = (side, type) => {
    const f = fight;
    const boutId = teamBout?.id ?? null;
    stopClock(f); // yame on every point
    setEvents((ev) => [...ev, { id: `local-${Date.now()}-${ev.length}`, bout_id: boutId, side, type }]);
    enqueue(async () => {
      if (f.timer_started_at) await timerStop(f);
      await addEvent(f.id, side, type, boutId);
    });
  };

  const hajime = () => {
    const f = fight;
    const startedAt = new Date().toISOString();
    patchFight(f.id, { timer_started_at: startedAt });
    enqueue(() => timerStart(f));
  };

  const yame = () => {
    const f = fight;
    stopClock(f);
    enqueue(() => timerStop(f));
  };

  const undo = () => {
    const id = fight.id;
    const boutId = teamBout?.id ?? null;
    const mine = (e) => (e.bout_id ?? null) === boutId;
    setEvents((ev) => {
      const i = ev.map(mine).lastIndexOf(true);
      return i < 0 ? ev : [...ev.slice(0, i), ...ev.slice(i + 1)];
    });
    enqueue(async () => {
      const saved = (await listEvents(id)).filter(mine);
      const last = saved[saved.length - 1];
      if (last) await deleteEvent(last.id);
    });
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
  const roundOf = (f) => {
    if (f.phase === 'pool') return 'Pool';
    if (f.phase === 'ipponshobu') return 'Ipponshobu';
    return koRoundLabel(byId[f.category_id], f.ko_no);
  };

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
            const t = boutTotals({ events: events.filter((e) => e.bout_id === b.id) }, opts);
            const mark = (side) => (b.fusen === side ? 'OO' : b.decision === side ? 'HH' : t[side].ippons.join(' '));
            return (
              <tr key={b.id} className={b.id === teamBout?.id ? 'current' : b.status}>
                <td>{POSITION_LABELS[b.position]}</td>
                <td className="st-team-red">{memberName(b.red_competitor_id) ?? '—'}</td>
                <td className="st-team-score">{mark('red') || '·'} : {mark('white') || '·'}{b.status === 'finished' && !b.fusen && !b.decision && t.red.ippons.length === t.white.ippons.length ? ' (X)' : ''}</td>
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
        {unit.fusen === side ? 'OO' : status?.by === 'hantei' && status.winner === side ? 'HH' : totals[side].ippons.join(' ') || '·'}
        {totals[side].hansoku > 0 && <span className="st-hansoku">{'▲'.repeat(totals[side].hansoku)}</span>}
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
        <select value={court} onChange={(e) => { setParams({ court: e.target.value }); setPickedId(null); }}>
          {courts.map((n) => <option key={n} value={n}>Shiaijo {n}</option>)}
        </select>
        <span className="tp-muted">{tournament?.name}</span>
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

          {team && <TeamProgress />}
          {team && step.step === 'lineup' && teamInfo && (
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

          {unit && (<>
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
            {unit.status === 'running' && !status?.over && (
              <>
                <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => finish({ fusen: 'red' })}>Red wins OO</button>
                <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => finish({ fusen: 'white' })}>White wins OO</button>
              </>
            )}
          </div>
          </>)}
          {team && step.step === 'lineup' && fight.status === 'scheduled' && (
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
      {shownPool && (
        <div className="st-popup-back" onClick={() => setShownPool(null)} role="presentation">
          <div className="st-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pool standings">
            <button type="button" className="st-popup-close" onClick={() => setShownPool(null)} title="Close">✕</button>
            <PoolStandings category={byId[shownPool.category_id]} pool={shownPool} members={poolMembers(shownPool)}
              fights={fights} events={poolData.events} bouts={poolData.bouts} nameOf={entryNameById}
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
            <ol>
              {finished.map((f) => (
                <li key={f.id}>
                  <strong>{f.label}</strong> <span className="st-red">{name(f, 'red')}</span> – <span className="st-white">{name(f, 'white')}</span>
                  {(() => { const r = resultOf(f); return (
                    <span className="st-result"><span className="st-red">{r.red || '–'}</span> : <span className="st-white">{r.white || '–'}</span>{!f.winner_entry_id ? ' X' : ''}</span>
                  ); })()}
                  {manager && (
                    <button type="button" className="tp-btn secondary small" style={{ marginLeft: '0.4rem' }}
                      disabled={busy || fight?.status === 'running'} onClick={() => { setPickedId(f.id); run(() => reopenFight(f)); }}>
                      Correct
                    </button>
                  )}
                </li>
              ))}
            </ol>
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
