// Pool standings for the screens (public page, Manage, scoretable): the same
// ranking the app uses when a pool finishes (rankPool, Excel criteria), read
// from the fights, their score events and — for team matches — their bouts.

import { boutResult, scoringOptions } from './scoring.js';
import { DEFAULT_CRITERIA, compareRows, rankPool } from './standings.js';
import { teamMatchResult, teamMatchSummary } from './team.js';

/**
 * category: the pool's category; members: entry ids in pool order;
 * poolFights: every fight of this pool (pool + ipponshobu, any status);
 * events: score events ({ match_id, bout_id, side, type }); bouts: team bouts.
 * Returns rankPool's result with the table always sorted, plus
 * { played, total } pool fights.
 */
export function poolStandings(category, members, poolFights, events = [], bouts = []) {
  const opts = scoringOptions(category);
  const team = category?.kind === 'team';
  const criteria = category?.ranking_criteria ?? DEFAULT_CRITERIA;
  const matches = poolFights.filter((f) => f.status === 'finished' && f.red_entry_id && f.white_entry_id).map((f) => {
    const evs = events.filter((e) => e.match_id === f.id);
    return {
      red: f.red_entry_id,
      white: f.white_entry_id,
      kind: f.phase === 'ipponshobu' ? 'ipponshobu' : 'pool',
      label: f.label,
      bout: { events: evs, decision: f.decision, fusen: f.fusen, encho: !!f.is_encho },
      ...(team ? { result: teamMatchSummary(f, category.team_size, bouts.filter((b) => b.match_id === f.id), evs, opts) } : {}),
    };
  });
  const total = poolFights.filter((f) => f.phase === 'pool').length;
  const res = rankPool({
    members, matches, expectedMatches: total, advancing: category?.advancing ?? 0, criteria, scoringOptions: opts,
  });
  const table = res.status === 'incomplete'
    ? [...res.table].sort((a, b) => compareRows(a, b, criteria, [], opts))
    : res.table;
  return { ...res, table, played: matches.filter((m) => m.kind === 'pool').length, total };
}

/**
 * Result of a finished fight per side for the lists: ippons and ▲ hansoku
 * (FIK marks: H from 2 hansoku, Ht hantei, O fusen); a team match: bout wins with ippons in brackets.
 */
export function fightMarks(category, f, events = [], bouts = []) {
  const o = scoringOptions(category);
  const evs = events.filter((e) => e.match_id === f.id);
  if (category?.kind === 'team') {
    if (f.fusen) return { red: f.fusen === 'red' ? 'OO' : '', white: f.fusen === 'white' ? 'OO' : '' };
    const r = teamMatchResult(bouts.filter((b) => b.match_id === f.id).map((b) => ({
      position: b.position,
      bout: { events: evs.filter((e) => e.bout_id === b.id), decision: b.decision, fusen: b.fusen, encho: !!b.is_encho },
    })), o);
    return { red: `${r.redWins} (${r.redIppons})`, white: `${r.whiteWins} (${r.whiteIppons})` };
  }
  const t = boutResult({ events: evs.filter((e) => !e.bout_id), decision: f.decision, fusen: f.fusen, encho: !!f.is_encho }, o).totals;
  const side = (s) => [...t[s].ippons, ...(t[s].shown ? ['▲'.repeat(t[s].shown)] : [])].join(' ');
  return { red: side('red'), white: side('white') };
}
