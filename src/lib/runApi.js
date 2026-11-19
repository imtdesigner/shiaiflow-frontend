// Data layer for running the tournament: start, fights, score events, timer,
// and what happens after a fight (pool ranking, ipponshobu, KO filling).
import { supabase } from '../supabaseClient';
import { rankPool } from './tournament/standings.js';
import { scoringOptions } from './tournament/scoring.js';
import {
  koEntries, placesToCodes, startOutOfOrder, startSequence,
} from './tournament/run.js';
import { lineupOf, teamMatchSummary } from './tournament/team.js';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const FIGHT_COLUMNS = 'id, category_id, phase, label, pool_id, ko_no, red_code, white_code, red_entry_id, white_entry_id, '
  + 'shiaijo, court_seq, queue_order, end_block, court_manual, status, is_encho, is_hikiwake, decision, fusen, '
  + 'winner_entry_id, started_at, finished_at, timer_elapsed_ms, timer_started_at';

export async function listRunFights(categoryIds) {
  if (!categoryIds.length) return [];
  return unwrap(await supabase.from('matches').select(FIGHT_COLUMNS).in('category_id', categoryIds));
}

export async function listEvents(matchId) {
  return unwrap(await supabase.from('score_events').select('id, bout_id, side, type, created_at').eq('match_id', matchId).order('id'));
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
    status: 'running', winner_entry_id: null, finished_at: null, timer_started_at: null,
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
export const boutOf = (fight, events) => ({ events, decision: fight.decision, fusen: fight.fusen });

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
  const pool = unwrap(await supabase.from('pools').select('id, number, pool_entries(entry_id, position)').eq('id', fight.pool_id).single());
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

/** Put known fighters into KO fights: pool places + winners of finished KO fights. */
export async function fillKo(category) {
  const pools = unwrap(await supabase.from('pools').select('id, number, pool_entries(entry_id, final_place)').eq('category_id', category.id));
  const places = new Map();
  for (const p of pools) {
    const ranked = p.pool_entries.filter((pe) => pe.final_place).sort((a, b) => a.final_place - b.final_place).map((pe) => pe.entry_id);
    if (ranked.length && category.pool_size !== 1) for (const [code, id] of placesToCodes(p.number, ranked, category.advancing)) places.set(code, id);
  }
  const ko = unwrap(await supabase.from('matches').select(FIGHT_COLUMNS).eq('category_id', category.id).eq('phase', 'ko'));
  if (category.pool_size === 1) {
    // direct KO: the first round is filled at the draw; only winners move on
    for (const f of ko) {
      if (!f.red_code?.startsWith('W') && f.red_entry_id) places.set(f.red_code, f.red_entry_id);
      if (!f.white_code?.startsWith('W') && f.white_entry_id) places.set(f.white_code, f.white_entry_id);
    }
  }
  for (const u of koEntries(ko, places)) {
    unwrap(await supabase.from('matches').update({ red_entry_id: u.red_entry_id, white_entry_id: u.white_entry_id }).eq('id', u.id));
  }
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
