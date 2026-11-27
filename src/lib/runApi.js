// Data layer for running the tournament: start, fights, score events, timer,
// and what happens after a fight (pool ranking, ipponshobu, KO filling).
import { supabase } from '../supabaseClient';
import { rankPool } from './tournament/standings.js';
import { scoringOptions } from './tournament/scoring.js';
import { startOutOfOrder, startSequence } from './tournament/run.js';
import { koCheck, manualPlaces, poolPlacesMap, replaySeqs } from './tournament/corrections.js';
import { lineupOf, teamMatchSummary } from './tournament/team.js';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const FIGHT_COLUMNS = 'id, category_id, phase, label, pool_id, ko_no, red_code, white_code, red_entry_id, white_entry_id, '
  + 'shiaijo, court_seq, queue_order, end_block, court_manual, status, is_encho, is_hikiwake, decision, fusen, '
  + 'winner_entry_id, started_at, finished_at, timer_elapsed_ms, timer_started_at, manual_entries, kept_as_fought, '
  + 'category:categories(started_at)'; // Start category (courtView)

export async function listRunFights(categoryIds) {
  if (!categoryIds.length) return [];
  return unwrap(await supabase.from('matches').select(FIGHT_COLUMNS).in('category_id', categoryIds));
}

export async function listEvents(matchId) {
  return unwrap(await supabase.from('score_events').select('id, client_id, bout_id, side, type, created_at').eq('match_id', matchId).order('id'));
}

async function setSeqs(map) {
  if (!map.size) return;
  unwrap(await supabase.rpc('set_court_seq', { ids: [...map.keys()], seqs: [...map.values()] }));
}

/** Start the tournament: freeze the order on every court and mark it running. */
export async function startTournament(tournament, categories) {
  const drawn = categories.filter((c) => !['registration', 'cancelled'].includes(c.status));
  const fights = await listRunFights(drawn.map((c) => c.id));
  const seq = startSequence(fights.filter((f) => f.court_seq == null), drawn);
  await setSeqs(seq);
  return unwrap(await supabase.from('tournaments').update({ status: 'running' }).eq('id', tournament.id).select().single());
}

/** Start a category (manager or one of its tables): its fights appear on the screens. */
export async function startCategory(categoryId) {
  return unwrap(await supabase.rpc('start_category', { c_id: categoryId }));
}

/** Start a fight; fights skipped on this court move below it. */
export async function startFight(fight, queue) {
  await setSeqs(startOutOfOrder(queue, fight.id));
  unwrap(await supabase.from('matches').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', fight.id));
}

export async function addEvent(matchId, side, type, boutId = null) {
  unwrap(await supabase.from('score_events').insert({ match_id: matchId, side, type, bout_id: boutId }));
}

export async function deleteEvent(eventId) {
  unwrap(await supabase.from('score_events').delete().eq('id', eventId));
}

/**
 * One queued scoretable click (lib/outbox.js), idempotent so it can be sent again:
 * a point carries its client id, a timer change absolute values, an undo a known event.
 */
export async function sendScoreOp(op) {
  if (op.kind === 'event') {
    unwrap(await supabase.from('score_events').upsert(
      { match_id: op.matchId, side: op.side, type: op.type, bout_id: op.boutId ?? null, client_id: op.clientId },
      { onConflict: 'client_id', ignoreDuplicates: true },
    ));
  } else if (op.kind === 'delete') {
    const q = supabase.from('score_events').delete();
    unwrap(await (op.clientId ? q.eq('client_id', op.clientId) : q.eq('id', op.eventId)));
  } else if (op.kind === 'timer') {
    unwrap(await supabase.from('matches').update({ timer_started_at: op.startedAt, timer_elapsed_ms: op.elapsedMs }).eq('id', op.matchId));
  }
}

/** Shared timer: elapsed ms + running since; every screen computes the same clock. */
export async function timerStart(fight) {
  unwrap(await supabase.from('matches').update({ timer_started_at: new Date().toISOString() }).eq('id', fight.id));
}

export async function timerStop(fight) {
  if (!fight.timer_started_at) return;
  const elapsed = fight.timer_elapsed_ms + (Date.now() - new Date(fight.timer_started_at).getTime());
  unwrap(await supabase.from('matches').update({ timer_elapsed_ms: Math.round(elapsed), timer_started_at: null }).eq('id', fight.id));
}

/** Encho: the clock starts again from zero. */
export async function startEncho(fight) {
  unwrap(await supabase.from('matches').update({ is_encho: true, timer_elapsed_ms: 0, timer_started_at: null }).eq('id', fight.id));
}

export async function setFightFields(fight, fields) {
  unwrap(await supabase.from('matches').update(fields).eq('id', fight.id));
}

/** Manager correction: reopen a finished fight (winner and places are recomputed when it finishes again). */
export async function reopenFight(fight) {
  unwrap(await supabase.from('matches').update({
    status: 'running', winner_entry_id: null, finished_at: null, timer_started_at: null, kept_as_fought: false,
  }).eq('id', fight.id));
}

// --- team matches: lineups and position bouts (the table scores them one after another) ---

const BOUT_COLUMNS = 'id, match_id, position, status, decision, fusen, is_encho, red_competitor_id, white_competitor_id';

export async function listMatchBouts(matchId) {
  return unwrap(await supabase.from('bouts').select(BOUT_COLUMNS).eq('match_id', matchId));
}

/** Members of two teams (lineup choices), with names, in registration order. */
export async function listTeamMembers(teamIds) {
  if (!teamIds.length) return [];
  return unwrap(await supabase.from('team_members')
    .select('team_id, competitor_id, sort_order, competitor:competitors(last_name, first_name, display_name)')
    .in('team_id', teamIds));
}

/** Lineup this entry used in its latest team match of the category (null if none). */
export async function previousLineup(match, entryId) {
  const ms = unwrap(await supabase.from('matches').select('id, red_entry_id, white_entry_id, started_at')
    .eq('category_id', match.category_id).neq('id', match.id)
    .or(`red_entry_id.eq.${entryId},white_entry_id.eq.${entryId}`)
    .not('started_at', 'is', null).order('started_at', { ascending: false }).limit(5));
  for (const m of ms) {
    const bs = await listMatchBouts(m.id);
    if (bs.some((b) => b.position !== 'daihyosen')) return lineupOf(bs, m.red_entry_id === entryId ? 'red' : 'white');
  }
  return null;
}

/** The table confirms both lineups were handed in: one bout row per position. */
export async function confirmLineups(match, rows) {
  unwrap(await supabase.from('bouts').insert(rows.map((r) => ({ ...r, match_id: match.id }))));
}

/** Start a position bout (the team match starts with its first bout); the clock starts from zero. */
export async function startBout(match, bout, queue) {
  if (match.status === 'scheduled') await startFight(match, queue);
  unwrap(await supabase.from('matches').update({ is_encho: false, timer_elapsed_ms: 0, timer_started_at: null }).eq('id', match.id));
  unwrap(await supabase.from('bouts').update({ status: 'running' }).eq('id', bout.id));
}

export async function setBoutFields(bout, fields) {
  unwrap(await supabase.from('bouts').update(fields).eq('id', bout.id));
}

/** Finish a position bout (extra: decision / fusen). */
export async function finishBout(match, bout, extra = {}) {
  if (match.timer_started_at) await timerStop(match);
  unwrap(await supabase.from('bouts').update({ ...extra, status: 'finished' }).eq('id', bout.id));
}

/** Tied team match: the table picks one fighter per team; the daihyosen is fought like an encho (first point wins). */
export async function addDaihyosen(match, redId, whiteId) {
  unwrap(await supabase.from('bouts').insert({
    match_id: match.id, position: 'daihyosen', red_competitor_id: redId, white_competitor_id: whiteId, is_encho: true,
  }));
}

/** Manager correction inside a team match: the last finished bout runs again. */
export async function reopenBout(bout) {
  unwrap(await supabase.from('bouts').update({ status: 'running', decision: null }).eq('id', bout.id));
}

/** Bout record of a fight for the scoring logic. */
export const boutOf = (fight, events) => ({ events, decision: fight.decision, fusen: fight.fusen, encho: !!fight.is_encho });

/**
 * Finish a fight with its result, then run what follows:
 *   pool / ipponshobu → rank the pool; places → KO slots; tie → ipponshobu
 *   fight right after on the same court; two ties → replay message;
 *   KO → winner goes on in the bracket.
 * Returns { message } for the scoretable.
 */
export async function finishFight(fight, result, category) {
  const winnerId = result.winner === 'red' ? fight.red_entry_id : result.winner === 'white' ? fight.white_entry_id : null;
  if (fight.timer_started_at) await timerStop(fight);
  unwrap(await supabase.from('matches').update({
    status: 'finished',
    winner_entry_id: winnerId,
    is_hikiwake: !winnerId,
    finished_at: new Date().toISOString(),
    timer_started_at: null,
  }).eq('id', fight.id));
  return afterFight({ ...fight, status: 'finished', winner_entry_id: winnerId }, category);
}

export async function afterFight(fight, category) {
  if (fight.phase === 'ko') {
    await fillKo(category, null);
    return { message: null };
  }
  // pool or ipponshobu
  const pool = unwrap(await supabase.from('pools').select('id, number, manual_order, pool_entries(entry_id, position)').eq('id', fight.pool_id).single());
  const fights = unwrap(await supabase.from('matches').select(FIGHT_COLUMNS).eq('pool_id', pool.id));
  const events = fights.length
    ? unwrap(await supabase.from('score_events').select('match_id, bout_id, side, type').in('match_id', fights.map((f) => f.id)).order('id'))
    : [];
  // team matches: the team result (bout wins, ippons of all bouts) counts, not one bout
  const team = category.kind === 'team';
  const teamBouts = team && fights.length
    ? unwrap(await supabase.from('bouts').select(BOUT_COLUMNS).in('match_id', fights.map((f) => f.id)))
    : [];
  const bouts = fights.filter((f) => f.status === 'finished').map((f) => ({
    red: f.red_entry_id,
    white: f.white_entry_id,
    kind: f.phase === 'ipponshobu' ? 'ipponshobu' : 'pool',
    label: f.label,
    bout: boutOf(f, events.filter((e) => e.match_id === f.id)),
    ...(team ? {
      result: teamMatchSummary(f, category.team_size, teamBouts.filter((b) => b.match_id === f.id), events.filter((e) => e.match_id === f.id), scoringOptions(category)),
    } : {}),
  }));
  const members = [...pool.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id);
  const res = rankPool({
    members,
    matches: bouts,
    expectedMatches: fights.filter((f) => f.phase === 'pool').length,
    advancing: category.advancing,
    criteria: category.ranking_criteria ?? undefined,
    scoringOptions: scoringOptions(category),
  });

  if (res.status === 'incomplete') return { message: null };
  // a pool ordered by hand keeps the manager's places (Manage → Back to computed)
  if (pool.manual_order) { await fillKo(category); return { message: `Pool ${pool.number}: order set by the manager — kept.` }; }
  if (res.status !== 'decided') {
    // a correction may undo a decided pool: its places are no longer known
    unwrap(await supabase.from('pool_entries').update({ final_place: null }).eq('pool_id', pool.id));
    await fillKo(category);
  }
  if (res.status === 'replay') return { message: `Pool ${pool.number}: two ties at once — the pool has to be fought again (manager).` };
  if (res.status === 'ipponshobu') {
    const open = fights.find((f) => f.phase === 'ipponshobu' && f.status !== 'finished');
    if (!open) {
      const n = fights.filter((f) => f.phase === 'ipponshobu').length;
      const [a, b] = res.ipponshobu.between;
      unwrap(await supabase.from('matches').insert({
        category_id: category.id,
        phase: 'ipponshobu',
        label: `F-P${pool.number}.D${n ? n + 1 : ''}`,
        pool_id: pool.id,
        red_entry_id: a,
        white_entry_id: b,
        shiaijo: fight.shiaijo,
        court_seq: (fight.court_seq ?? 0) + 1,
        queue_order: (fight.queue_order ?? 0),
      }, { defaultToNull: false }));
    }
    return { message: `Pool ${pool.number}: tie for place ${res.ipponshobu.place} — ipponshobu next on this shiaijo.` };
  }
  // decided: record places and fill the KO
  for (const [i, id] of res.ranking.entries()) {
    unwrap(await supabase.from('pool_entries').update({ final_place: i + 1 }).eq('pool_id', pool.id).eq('entry_id', id));
  }
  await fillKo(category, null);
  return { message: `Pool ${pool.number} finished: ${res.ranking.length} places recorded.` };
}

/** KO of one category checked against what is known now (lib/tournament/corrections.js). */
export async function koState(category) {
  const pools = category.pool_size === 1 ? [] : unwrap(await supabase.from('pools').select('id, number, pool_entries(entry_id, final_place)').eq('category_id', category.id));
  const ko = unwrap(await supabase.from('matches').select(FIGHT_COLUMNS).eq('category_id', category.id).eq('phase', 'ko'));
  const places = poolPlacesMap(pools, category.advancing, category.pool_size === 1 ? ko : null);
  return { ko, ...koCheck(ko, places) };
}

/** Put the right fighters into KO fights not started yet (fights already fought are the manager's call). */
export async function fillKo(category) {
  const { auto } = await koState(category);
  for (const u of auto) {
    unwrap(await supabase.from('matches').update({ red_entry_id: u.red_entry_id, white_entry_id: u.white_entry_id }).eq('id', u.id));
  }
}

// --- manager corrections (owner, 2026-11-24) ---------------------------------------------

/** Write one correction to the log (managers only). */
export async function logCorrection(category, kind, fields = {}) {
  unwrap(await supabase.from('correction_log').insert({ tournament_id: category.tournament_id, category_id: category.id, kind, ...fields }));
}

export async function listCorrections(tournamentId) {
  return unwrap(await supabase.from('correction_log').select('*').eq('tournament_id', tournamentId).order('at', { ascending: false }).limit(100));
}

/** Reopen a finished fight (Correct) and note it. */
export async function correctFight(fight, category) {
  await reopenFight(fight);
  await logCorrection(category, 'reopen', { match_id: fight.id, note: fight.label,
    before: { winner: fight.winner_entry_id, hikiwake: fight.is_hikiwake } });
}

/**
 * Result of a finished fight edited directly by the manager (no table needed):
 * the events are replaced, the winner set from them (or hantei / fusen), then
 * the pool is ranked again / the KO checked — conflicts show in Manage.
 */
export async function editResult(category, fight, { events, decision = null, fusen = null }, result) {
  const old = unwrap(await supabase.from('score_events').select('side, type').eq('match_id', fight.id).order('id'));
  const winnerId = result.winner === 'red' ? fight.red_entry_id : result.winner === 'white' ? fight.white_entry_id : null;
  unwrap(await supabase.from('score_events').delete().eq('match_id', fight.id));
  if (events.length) unwrap(await supabase.from('score_events').insert(events.map((e) => ({ match_id: fight.id, side: e.side, type: e.type }))));
  unwrap(await supabase.from('matches').update({
    decision, fusen, winner_entry_id: winnerId, is_hikiwake: !winnerId, kept_as_fought: false,
    finished_at: new Date().toISOString(), // screens refetch the points of a fight when this changes
  }).eq('id', fight.id));
  await logCorrection(category, 'edit', { match_id: fight.id, note: fight.label,
    before: { events: old, decision: fight.decision, fusen: fight.fusen, winner: fight.winner_entry_id },
    after: { events, decision, fusen, winner: winnerId } });
  return afterFight({ ...fight, status: 'finished', winner_entry_id: winnerId, decision, fusen }, category);
}

/**
 * Fight again the KO fights in conflict: their result is wiped (kept in the
 * log), they get the right fighters and go first on their shiaijo; what
 * depends on them waits. A running fight must be finished first.
 */
export async function replayConflicts(category, conflicts) {
  if (conflicts.some((c) => c.fight.status === 'running')) throw new Error('A fight to be fought again is running — let the table finish it first.');
  const fights = conflicts.map((c) => c.fight);
  const ids = fights.map((f) => f.id);
  const events = unwrap(await supabase.from('score_events').select('match_id, bout_id, side, type').in('match_id', ids));
  const courts = [...new Set(fights.map((f) => f.shiaijo))];
  const courtFights = unwrap(await supabase.from('matches').select('id, shiaijo, status, court_seq').in('shiaijo', courts)
    .in('category_id', (await tournamentCategoryIds(category.tournament_id))));
  const seqs = replaySeqs(fights, courtFights);
  for (const c of conflicts) {
    const f = c.fight;
    await logCorrection(category, 'replay', { match_id: f.id, note: f.label,
      before: { red: f.red_entry_id, white: f.white_entry_id, winner: f.winner_entry_id, hikiwake: f.is_hikiwake,
        events: events.filter((e) => e.match_id === f.id) },
      after: { red: c.red, white: c.white } });
    unwrap(await supabase.from('score_events').delete().eq('match_id', f.id));
    unwrap(await supabase.from('bouts').delete().eq('match_id', f.id));
    unwrap(await supabase.from('matches').update({
      status: 'scheduled', winner_entry_id: null, is_hikiwake: false, is_encho: false, decision: null, fusen: null,
      started_at: null, finished_at: null, timer_elapsed_ms: 0, timer_started_at: null,
      red_entry_id: c.red, white_entry_id: c.white, court_seq: seqs.get(f.id) ?? f.court_seq,
    }).eq('id', f.id));
  }
  await fillKo(category);
}

async function tournamentCategoryIds(tournamentId) {
  return unwrap(await supabase.from('categories').select('id').eq('tournament_id', tournamentId)).map((c) => c.id);
}

/** Keep the KO fights in conflict as they were fought; later fights follow them. */
export async function keepConflicts(category, conflicts) {
  for (const c of conflicts) {
    unwrap(await supabase.from('matches').update({ kept_as_fought: true }).eq('id', c.fight.id));
    await logCorrection(category, 'keep', { match_id: c.fight.id, note: c.fight.label,
      before: { red: c.fight.red_entry_id, white: c.fight.white_entry_id }, after: { red: c.red, white: c.white } });
  }
  await fillKo(category);
}

/** Pool order set by the manager: [entry ids] first → last, with a reason. */
export async function setPoolOrder(category, pool, order, reason) {
  const before = [...(pool.pool_entries ?? [])].filter((pe) => pe.final_place).sort((a, b) => a.final_place - b.final_place).map((pe) => pe.entry_id);
  for (const p of manualPlaces(order)) {
    unwrap(await supabase.from('pool_entries').update({ final_place: p.final_place }).eq('pool_id', pool.id).eq('entry_id', p.entry_id));
  }
  unwrap(await supabase.from('pools').update({ manual_order: true, manual_reason: reason || null }).eq('id', pool.id));
  await logCorrection(category, 'order', { note: `Pool ${pool.number}${reason ? ` — ${reason}` : ''}`, before: { order: before }, after: { order } });
  await fillKo(category);
}

/** Back to the computed order of a pool. */
export async function resetPoolOrder(category, pool) {
  unwrap(await supabase.from('pools').update({ manual_order: false, manual_reason: null }).eq('id', pool.id));
  const fight = unwrap(await supabase.from('matches').select(FIGHT_COLUMNS).eq('pool_id', pool.id).eq('phase', 'pool').limit(1).single());
  await afterFight(fight, category);
  await logCorrection(category, 'order_reset', { note: `Pool ${pool.number}` });
}

/** Fighters of a KO fight not started yet, set by the manager. */
export async function setKoFighters(category, fight, red, white, reason) {
  if (fight.status !== 'scheduled') throw new Error(`${fight.label} has started — correct it with Correct instead.`);
  unwrap(await supabase.from('matches').update({ red_entry_id: red, white_entry_id: white, manual_entries: true }).eq('id', fight.id));
  await logCorrection(category, 'swap', { match_id: fight.id, note: `${fight.label}${reason ? ` — ${reason}` : ''}`,
    before: { red: fight.red_entry_id, white: fight.white_entry_id }, after: { red, white } });
}

/** Back to the fighters the bracket gives. */
export async function resetKoFighters(category, fight) {
  unwrap(await supabase.from('matches').update({ manual_entries: false }).eq('id', fight.id));
  await fillKo(category);
  await logCorrection(category, 'swap_reset', { match_id: fight.id, note: fight.label });
}

// --- tournament PIN (editors and tables) ------------------------------------------------

export async function getPin(tournamentId) {
  const row = unwrap(await supabase.from('tournament_pins').select('pin').eq('tournament_id', tournamentId).maybeSingle());
  return row?.pin ?? null;
}

export async function setPin(tournamentId, pin) {
  unwrap(await supabase.from('tournament_pins').upsert({ tournament_id: tournamentId, pin }));
}

/** Role of the signed-in user in this tournament: 'owner' | 'organizer' | 'scorer' | null. */
export async function myRole(tournamentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const row = unwrap(await supabase.from('tournament_members').select('role').eq('tournament_id', tournamentId).eq('user_id', user.id).maybeSingle());
  return row?.role ?? null;
}

/**
 * Join a tournament with its PIN (signs in anonymously when needed). The door
 * decides the role: 'editor' → organizer (needs a published tournament),
 * 'table' → scorer (needs a running tournament). Returns the role.
 */
export async function claimTournament(tournamentId, pin, door = 'editor') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error(`Cannot sign in with a PIN: ${error.message}. The owner has to enable anonymous sign-ins in Supabase.`);
  }
  return unwrap(await supabase.rpc('claim_tournament', {
    t_id: tournamentId, p: pin, as_role: door === 'table' ? 'scorer' : 'organizer',
  }));
}

/**
 * Live updates of one tournament: the database broadcasts every change of a
 * fight, score event or team bout to 'run:<tournament id>' (migration
 * 202611190002). Bursts are coalesced: `onChange` runs once, `wait` ms after
 * the first change of a burst (scoretable short, public page longer).
 */
export function subscribeFights(tournamentId, onChange, wait = 250) {
  let timer = null;
  const fire = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; onChange(); }, wait);
  };
  const channel = supabase.channel(`run:${tournamentId}`)
    .on('broadcast', { event: 'change' }, fire)
    .subscribe();
  return () => { clearTimeout(timer); supabase.removeChannel(channel); };
}

// --- Fighting spirit (one per category; tables propose, the organizer decides) ---

export async function listFightingSpirit(categoryIds) {
  if (!categoryIds.length) return [];
  return unwrap(await supabase.from('fighting_spirit_proposals').select('category_id, shiaijo, competitor_id, created_at').in('category_id', categoryIds));
}

/** The table's proposal for a category (competitorId null = skipped). */
export async function proposeFightingSpirit(categoryId, shiaijo, competitorId) {
  unwrap(await supabase.from('fighting_spirit_proposals').upsert(
    { category_id: categoryId, shiaijo, competitor_id: competitorId, created_at: new Date().toISOString() },
    { onConflict: 'category_id,shiaijo' },
  ));
}

/** The organizer's pick (null = back to the tables' proposal). */
export async function setFightingSpirit(categoryId, competitorId) {
  unwrap(await supabase.from('categories').update({ fighting_spirit_competitor_id: competitorId }).eq('id', categoryId));
}
