// Data layer for running the tournament: start, fights, score events, timer,
// and what happens after a fight (pool ranking, ipponshobu, KO filling).
import { supabase } from '../supabaseClient';
import { rankPool } from './tournament/standings.js';
import {
  koEntries, placesToCodes, startOutOfOrder, startSequence,
} from './tournament/run.js';

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
  return unwrap(await supabase.from('score_events').select('id, side, type, created_at').eq('match_id', matchId).order('id'));
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

export async function addEvent(matchId, side, type) {
  unwrap(await supabase.from('score_events').insert({ match_id: matchId, side, type }));
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

async function afterFight(fight, category) {
  if (fight.phase === 'ko') {
    await fillKo(category, null);
    return { message: null };
  }
  // pool or ipponshobu
  const pool = unwrap(await supabase.from('pools').select('id, number, pool_entries(entry_id, position)').eq('id', fight.pool_id).single());
  const fights = unwrap(await supabase.from('matches').select(FIGHT_COLUMNS).eq('pool_id', pool.id));
  const events = fights.length
    ? unwrap(await supabase.from('score_events').select('match_id, side, type').in('match_id', fights.map((f) => f.id)).order('id'))
    : [];
  const bouts = fights.filter((f) => f.status === 'finished').map((f) => ({
    red: f.red_entry_id,
    white: f.white_entry_id,
    kind: f.phase === 'ipponshobu' ? 'ipponshobu' : 'pool',
    label: f.label,
    bout: boutOf(f, events.filter((e) => e.match_id === f.id)),
  }));
  const members = [...pool.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id);
  const res = rankPool({
    members,
    matches: bouts,
    expectedMatches: fights.filter((f) => f.phase === 'pool').length,
    advancing: category.advancing,
    criteria: category.ranking_criteria ?? undefined,
    scoringOptions: { autoHansokuIppon: category.auto_hansoku_ippon },
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

// --- shiaijo PINs and scorers ---------------------------------------------------------

export async function listPins(tournamentId) {
  return unwrap(await supabase.from('shiaijo_pins').select('shiaijo, pin').eq('tournament_id', tournamentId));
}

export async function setPin(tournamentId, shiaijo, pin) {
  unwrap(await supabase.from('shiaijo_pins').upsert({ tournament_id: tournamentId, shiaijo, pin }));
}

/** Court of the signed-in scorer for this tournament, or null. */
export async function myCourt(tournamentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const row = unwrap(await supabase.from('tournament_scorers').select('shiaijo').eq('tournament_id', tournamentId).eq('user_id', user.id).maybeSingle());
  return row?.shiaijo ?? null;
}

/** Role of the signed-in user in this tournament: 'owner' | 'organizer' | 'scorer' | null. */
export async function myRole(tournamentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const row = unwrap(await supabase.from('tournament_members').select('role').eq('tournament_id', tournamentId).eq('user_id', user.id).maybeSingle());
  return row?.role ?? null;
}

/** Scorer joins a court with its PIN (signs in anonymously when needed). */
export async function claimCourt(tournamentId, shiaijo, pin) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error(`Cannot sign in the scoretable: ${error.message}. The manager has to enable anonymous sign-ins in Supabase.`);
  }
  unwrap(await supabase.rpc('claim_shiaijo', { t_id: tournamentId, court: shiaijo, p: pin }));
}

/** Realtime: call `onChange` when fights or score events of these categories change. */
export function subscribeFights(key, onChange) {
  const channel = supabase.channel(`run-${key}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'score_events' }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
