// Thin data layer over Supabase. Pages call these instead of building queries.
import { supabase } from '../supabaseClient';
import { directKoQualifiers } from './tournament/draw.js';
import { getTemplate } from './tournament/ko.js';
import { courtPlan, drawCourts } from './tournament/courts.js';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// --- tournaments -------------------------------------------------------------

export async function listMyTournaments() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const rows = unwrap(await supabase
    .from('tournament_members')
    .select('role, tournaments(id, name, start_date, city, status)')
    .eq('user_id', user.id));
  return rows
    .filter((r) => r.tournaments)
    .map((r) => ({ ...r.tournaments, role: r.role }))
    .sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')));
}

export async function updateTournament(id, fields) {
  return unwrap(await supabase.from('tournaments').update(fields).eq('id', id).select().single());
}

/** Published tournaments for the home page, upcoming first. */
export async function listPublicTournaments() {
  const rows = unwrap(await supabase.from('tournaments')
    .select('id, name, start_date, end_date, venue, city, country, status, registration_open, registration_deadline')
    .eq('is_public', true)
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(50));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((t) => !t.end_date || t.end_date >= today || t.status === 'running');
  const past = rows.filter((t) => !upcoming.includes(t)).reverse();
  return [...upcoming, ...past];
}

/** Public registration (no account) — individual, or joining / naming a team. */
export async function publicRegister(categoryId, person) {
  return unwrap(await supabase.rpc('public_register', {
    c_id: categoryId,
    last_name: person.last_name,
    first_name: person.first_name ?? '',
    club: person.club || null,
    grade: person.grade || null,
    team_id: person.team_id || null,
    team_name: person.team_name || null,
    gender: person.gender || null,
    birth_year: person.birth_year ? Number(person.birth_year) : null,
    grade_rank: person.grade_rank === '' || person.grade_rank == null ? null : Number(person.grade_rank),
    email: person.email || null,
  }));
}

/** Public team registration when teams register first and pick members. */
export async function publicRegisterTeam(categoryId, team) {
  return unwrap(await supabase.rpc('public_register_team', {
    c_id: categoryId, team_name: team.name, club: team.club || null, member_ids: team.members,
  }));
}

/** Score events of several fights (live results). */
export async function listEventsFor(matchIds) {
  if (!matchIds.length) return [];
  return unwrap(await supabase.from('score_events').select('match_id, side, type').in('match_id', matchIds).order('id'));
}

/** Teams of a tournament with members (public registration, team lists). */
export async function listTeams(tournamentId) {
  return unwrap(await supabase.from('teams')
    .select('id, name, club, team_members(competitor_id, sort_order, competitor:competitors(last_name, first_name))')
    .eq('tournament_id', tournamentId).order('name'));
}

export async function getTournament(id) {
  return unwrap(await supabase.from('tournaments').select('*').eq('id', id).single());
}

export async function createTournament(fields, categories = []) {
  const t = unwrap(await supabase.from('tournaments').insert(fields).select().single());
  if (categories.length) {
    unwrap(await supabase.from('categories').insert(
      categories.map((c, i) => ({ ...c, tournament_id: t.id, sort_order: i })),
      { defaultToNull: false }, // fields a category leaves out get the column default
    ));
  }
  return t;
}

// --- categories ----------------------------------------------------------------

export async function listCategories(tournamentId) {
  return unwrap(await supabase
    .from('categories')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('sort_order'));
}

export async function updateCategory(id, fields) {
  return unwrap(await supabase.from('categories').update(fields).eq('id', id).select().single());
}

/** Cancel a category that will not be held (e.g. 3 entries and no merge). */
export async function cancelCategory(id) {
  return updateCategory(id, { status: 'cancelled' });
}

/** Re-open a cancelled category for registration. */
export async function restoreCategory(id) {
  return updateCategory(id, { status: 'registration' });
}

/** Move every entry to another category and cancel the source; returns moved count. */
export async function moveCategoryEntries(sourceId, targetId) {
  return unwrap(await supabase.rpc('move_category_entries', { src: sourceId, dst: targetId }));
}

// --- competitors, teams, entries -------------------------------------------------

export async function listEntries(categoryId) {
  return unwrap(await supabase
    .from('entries')
    .select('id, checked_in, tier, competitor:competitors(id, last_name, first_name, display_name, club, grade, gender, birth_year, grade_rank), team:teams(id, name, club)')
    .eq('category_id', categoryId)
    .order('created_at'));
}

export async function listCompetitors(tournamentId) {
  return unwrap(await supabase
    .from('competitors')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('last_name'));
}

/** Add a person to a category, reusing an existing competitor with the same name and club. */
export async function addCompetitorEntry(tournamentId, categoryId, person) {
  const lastName = person.last_name.trim().toUpperCase();
  const firstName = (person.first_name ?? '').trim();
  const club = (person.club ?? '').trim() || null;
  let q = supabase.from('competitors').select('id')
    .eq('tournament_id', tournamentId).eq('last_name', lastName).eq('first_name', firstName);
  q = club ? q.eq('club', club) : q.is('club', null);
  const found = unwrap(await q.maybeSingle());
  const competitor = found ?? unwrap(await supabase.from('competitors').insert({
    tournament_id: tournamentId,
    last_name: lastName,
    first_name: firstName,
    club,
    grade: (person.grade ?? '').trim() || null,
    gender: person.gender || null,
    birth_year: person.birth_year ? Number(person.birth_year) : null,
    grade_rank: person.grade_rank === '' || person.grade_rank == null ? null : Number(person.grade_rank),
  }).select('id').single());
  return unwrap(await supabase.from('entries')
    .insert({ category_id: categoryId, competitor_id: competitor.id, checked_in: !!person.checked_in })
    .select().single());
}

export async function addTeamEntry(tournamentId, categoryId, { name, club, members = [], checked_in = true }) {
  const team = unwrap(await supabase.from('teams')
    .insert({ tournament_id: tournamentId, name: name.trim().toUpperCase(), club: club?.trim() || null })
    .select('id').single());
  for (const [i, m] of members.entries()) {
    if (!m.last_name?.trim()) continue;
    const c = unwrap(await supabase.from('competitors').insert({
      tournament_id: tournamentId,
      last_name: m.last_name.trim().toUpperCase(),
      first_name: (m.first_name ?? '').trim(),
      club: club?.trim() || null,
    }).select('id').single());
    unwrap(await supabase.from('team_members').insert({ team_id: team.id, competitor_id: c.id, sort_order: i }));
  }
  return unwrap(await supabase.from('entries')
    .insert({ category_id: categoryId, team_id: team.id, checked_in: !!checked_in }).select().single());
}

export async function setCheckedIn(entryId, checkedIn) {
  return unwrap(await supabase.from('entries').update({ checked_in: checkedIn }).eq('id', entryId));
}

/** Set or clear (null) the strength tier (1–6) of an entry. */
export async function setTier(entryId, tier) {
  const { error } = await supabase.from('entries').update({ tier }).eq('id', entryId);
  if (error?.code === '23505') {
    throw new Error(tier === 1 ? 'This category already has a champion.' : 'This category already has a runner-up.');
  }
  if (error) throw new Error(error.message);
}

export async function removeEntry(entryId) {
  return unwrap(await supabase.from('entries').delete().eq('id', entryId));
}

// --- draw ----------------------------------------------------------------------

export async function getSavedDraw(categoryId) {
  const pools = unwrap(await supabase
    .from('pools')
    .select('id, number, pool_entries(entry_id, position)')
    .eq('category_id', categoryId)
    .order('number'));
  const matches = unwrap(await supabase
    .from('matches')
    .select('id, phase, label, pool_id, ko_no, red_code, white_code, red_entry_id, white_entry_id, shiaijo, end_block, court_manual, queue_order, status')
    .eq('category_id', categoryId)
    .order('queue_order'));
  return { pools, matches };
}

/** Remove pools and matches; refused once any match has started. */
export async function clearDraw(categoryId) {
  const started = unwrap(await supabase.from('matches').select('id')
    .eq('category_id', categoryId).neq('status', 'scheduled').limit(1));
  if (started.length) throw new Error('Matches have already started — the draw can no longer be changed.');
  unwrap(await supabase.from('matches').delete().eq('category_id', categoryId));
  unwrap(await supabase.from('pools').delete().eq('category_id', categoryId));
}

/**
 * Save a draw from buildDraw(): pools, pool matches and KO matches.
 * KO matches keep their template codes; for a direct KO the first round is filled in.
 */
export async function saveDraw(category, draw, tournament) {
  await clearDraw(category.id);
  const courts = drawCourts(draw, courtPlan(category, tournament));

  const poolRows = unwrap(await supabase.from('pools')
    .insert(draw.pools.map((_, i) => ({ category_id: category.id, number: i + 1 })))
    .select('id, number'));
  const poolId = Object.fromEntries(poolRows.map((p) => [p.number, p.id]));

  unwrap(await supabase.from('pool_entries').insert(draw.pools.flatMap((members, i) => members.map((entryId, j) => ({
    pool_id: poolId[i + 1], entry_id: entryId, position: j + 1,
  })))));

  let queue = 0;
  const rows = draw.poolMatches.map((m) => ({
    category_id: category.id,
    phase: 'pool',
    label: m.label,
    pool_id: poolId[m.pool],
    red_entry_id: m.red,
    white_entry_id: m.white,
    shiaijo: courts.pool[m.pool - 1],
    end_block: false,
    queue_order: (queue += 1),
  }));

  if (draw.koTemplate) {
    const direct = draw.directKo ? directKoQualifiers(draw.pools) : {};
    for (const k of draw.koTemplate) {
      rows.push({
        category_id: category.id,
        phase: 'ko',
        label: `F-${k.no}`, // KO fight number, as W05 / L05 refer to it
        ko_no: k.no,
        red_code: k.red,
        white_code: k.white,
        red_entry_id: direct[k.red] ?? null,
        white_entry_id: direct[k.white] ?? null,
        shiaijo: courts.ko.get(k.no),
        end_block: courts.end.has(k.no),
        queue_order: (queue += 1),
      });
    }
  }
  // defaultToNull: false → a column a row leaves out gets its default, not null
  if (rows.length) unwrap(await supabase.from('matches').insert(rows, { defaultToNull: false }));

  return updateCategory(category.id, {
    draw_seed: draw.seed,
    ko_template_code: draw.koCode,
    ko_template: draw.koTemplate,
    status: 'drawn',
  });
}

// --- shiaijo plan -----------------------------------------------------------------

/** Checked-in entry count per category id. */
export async function checkedInCounts(categoryIds) {
  if (!categoryIds.length) return {};
  const rows = unwrap(await supabase.from('entries').select('category_id').in('category_id', categoryIds).eq('checked_in', true));
  return rows.reduce((acc, r) => ({ ...acc, [r.category_id]: (acc[r.category_id] ?? 0) + 1 }), {});
}

/** Saved fights of drawn categories: [{ category_id, phase, ko_no, shiaijo, status }]. */
export async function listFights(categoryIds) {
  if (!categoryIds.length) return [];
  return unwrap(await supabase.from('matches')
    .select('id, category_id, phase, ko_no, shiaijo, end_block, status')
    .in('category_id', categoryIds));
}

/**
 * Save a KO template edited in the bracket editor (null = back to the default).
 * Before the draw it is stored on the category and used by the draw; after
 * the draw the KO fights are rebuilt from it — refused once a KO fight started.
 */
export async function saveKoTemplate(category, code, template, tournament) {
  const edited = !!template;
  if (category.status === 'registration' || category.status === 'cancelled') {
    return updateCategory(category.id, {
      ko_template_code: edited ? code : null, ko_template: template, ko_template_edited: edited,
    });
  }
  const { pools, matches } = await getSavedDraw(category.id);
  const ko = matches.filter((m) => m.phase === 'ko');
  if (ko.some((m) => m.status !== 'scheduled')) throw new Error('KO fights have already started — the bracket can no longer be changed.');
  const finalTemplate = template ?? getTemplate(code);
  const draw = {
    directKo: category.pool_size === 1,
    pools: pools.map((p) => [...p.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id)),
    koTemplate: finalTemplate,
  };
  const courts = drawCourts(draw, courtPlan(category, tournament));
  const direct = draw.directKo ? directKoQualifiers(draw.pools) : {};
  const start = Math.max(0, ...matches.filter((m) => m.phase !== 'ko').map((m) => m.queue_order ?? 0));
  if (ko.length) unwrap(await supabase.from('matches').delete().in('id', ko.map((m) => m.id)));
  unwrap(await supabase.from('matches').insert(finalTemplate.map((k, i) => ({
    category_id: category.id,
    phase: 'ko',
    label: `F-${k.no}`,
    ko_no: k.no,
    red_code: k.red,
    white_code: k.white,
    red_entry_id: direct[k.red] ?? null,
    white_entry_id: direct[k.white] ?? null,
    shiaijo: courts.ko.get(k.no),
    end_block: courts.end.has(k.no),
    queue_order: start + i + 1,
  })), { defaultToNull: false }));
  return updateCategory(category.id, { ko_template_code: code, ko_template: finalTemplate, ko_template_edited: edited });
}

/** Change the court of one fight by hand (null = back to the plan). */
export async function setFightCourt(match, court, category, tournament) {
  if (court === null) {
    unwrap(await supabase.from('matches').update({ court_manual: false }).eq('id', match.id));
    return applyCourts(category, tournament);
  }
  unwrap(await supabase.from('matches').update({ shiaijo: court, court_manual: true }).eq('id', match.id));
}

/** Every fight of a tournament's categories, with entry names resolved by the page. */
export async function listTournamentFights(categoryIds) {
  if (!categoryIds.length) return [];
  return unwrap(await supabase.from('matches')
    .select('id, category_id, phase, label, pool_id, ko_no, red_code, white_code, red_entry_id, white_entry_id, shiaijo, end_block, court_manual, queue_order, court_seq, status')
    .in('category_id', categoryIds)
    .order('queue_order'));
}

/** Entries of several categories at once (names for the fight plan). */
export async function listEntriesFor(categoryIds) {
  if (!categoryIds.length) return [];
  return unwrap(await supabase
    .from('entries')
    .select('id, category_id, checked_in, tier, competitor:competitors(id, last_name, first_name, display_name, club, grade, gender, birth_year, grade_rank), team:teams(id, name, club)')
    .in('category_id', categoryIds));
}

/**
 * Re-apply the court plan to a drawn category: fights that have not started
 * get their court and end-of-tournament flag from the current plan.
 */
export async function applyCourts(category, tournament) {
  if (category.status === 'registration' || category.status === 'cancelled') return;
  const { pools, matches } = await getSavedDraw(category.id);
  const draw = {
    directKo: category.pool_size === 1,
    pools: pools.map((p) => p.pool_entries),
    koTemplate: category.ko_template,
  };
  const courts = drawCourts(draw, courtPlan(category, tournament));
  const poolIndex = Object.fromEntries(pools.map((p, i) => [p.id, i]));
  const groups = new Map(); // "court|end" -> ids
  for (const m of matches.filter((x) => x.status === 'scheduled' && !x.court_manual)) {
    const ko = m.phase === 'ko';
    const court = ko ? courts.ko.get(m.ko_no) : courts.pool[poolIndex[m.pool_id]];
    const end = ko && courts.end.has(m.ko_no);
    if (!court || (court === m.shiaijo && end === m.end_block)) continue;
    const key = `${court}|${end}`;
    groups.set(key, [...(groups.get(key) ?? []), m.id]);
  }
  for (const [key, ids] of groups) {
    const [court, end] = key.split('|');
    unwrap(await supabase.from('matches').update({ shiaijo: Number(court), end_block: end === 'true' }).in('id', ids));
  }
}

/** Change a category's courts (shiaijos / ko_shiaijos) and move its fights. */
export async function setCategoryCourts(category, fields, tournament) {
  const updated = await updateCategory(category.id, fields);
  await applyCourts(updated, tournament);
  return updated;
}

/** Change tournament-wide court options and move fights of all drawn categories. */
export async function setTournamentCourts(tournament, fields, categories) {
  const updated = await updateTournament(tournament.id, fields);
  for (const c of categories) await applyCourts(c, updated);
  return updated;
}

// --- draw adjustments after the draw (as little change as possible) ------------------

async function poolWithFights(poolId) {
  const pool = unwrap(await supabase.from('pools').select('id, number, category_id, pool_entries(entry_id, position)').eq('id', poolId).single());
  const fights = unwrap(await supabase.from('matches').select('id, status, shiaijo, court_seq, queue_order, phase').eq('pool_id', poolId));
  return { pool, fights };
}

/** Rebuild the fights of one pool for its current members (only when none started). */
async function rebuildPoolFights(pool, fights, members) {
  const { poolMatches } = await import('./tournament/pools.js');
  if (fights.some((f) => f.status !== 'scheduled')) throw new Error('Fights of this pool already started.');
  const poolFights = fights.filter((f) => f.phase === 'pool');
  const shiaijo = poolFights[0]?.shiaijo ?? 1;
  const queue = Math.min(...poolFights.map((f) => f.queue_order ?? 0), Number.MAX_SAFE_INTEGER);
  const seq = poolFights.some((f) => f.court_seq != null) ? Math.min(...poolFights.map((f) => f.court_seq ?? 0)) : null;
  if (fights.length) unwrap(await supabase.from('matches').delete().in('id', fights.map((f) => f.id)));
  const rows = poolMatches(members, pool.number).map((m, i) => ({
    category_id: pool.category_id,
    phase: 'pool',
    label: m.label,
    pool_id: pool.id,
    red_entry_id: m.red,
    white_entry_id: m.white,
    shiaijo,
    end_block: false,
    queue_order: (queue === Number.MAX_SAFE_INTEGER ? 0 : queue) + i,
    court_seq: seq == null ? null : seq + i,
  }));
  if (rows.length) unwrap(await supabase.from('matches').insert(rows, { defaultToNull: false }));
}

/**
 * Someone did not come: a new entry takes the same place in the draw (same
 * pool position, same fights). Only for fights that have not started.
 */
export async function replaceInDraw(categoryId, oldEntryId, newEntryId) {
  const fights = unwrap(await supabase.from('matches').select('id, status, red_entry_id, white_entry_id')
    .eq('category_id', categoryId).or(`red_entry_id.eq.${oldEntryId},white_entry_id.eq.${oldEntryId}`));
  if (fights.some((f) => f.status !== 'scheduled')) throw new Error('This competitor has already fought — withdraw instead.');
  const pools = unwrap(await supabase.from('pools').select('id').eq('category_id', categoryId));
  unwrap(await supabase.from('pool_entries').update({ entry_id: newEntryId })
    .in('pool_id', pools.map((p) => p.id)).eq('entry_id', oldEntryId));
  for (const f of fights) {
    unwrap(await supabase.from('matches').update({
      red_entry_id: f.red_entry_id === oldEntryId ? newEntryId : f.red_entry_id,
      white_entry_id: f.white_entry_id === oldEntryId ? newEntryId : f.white_entry_id,
    }).eq('id', f.id));
  }
}

/** A late entry fills a pool that is short of a player; that pool's fights are rebuilt. */
export async function addToPool(poolId, entryId) {
  const { pool, fights } = await poolWithFights(poolId);
  const members = [...pool.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id);
  if (fights.some((f) => f.status !== 'scheduled')) throw new Error('Fights of this pool already started.');
  unwrap(await supabase.from('pool_entries').insert({ pool_id: pool.id, entry_id: entryId, position: members.length + 1 }));
  await rebuildPoolFights(pool, fights, [...members, entryId]);
}

/**
 * Withdraw an entry from its pool. Before the pool started: out of the pool,
 * its fights are rebuilt. Once started: the remaining fights are won by the
 * opponents (fusen-gachi, OO).
 */
export async function withdrawFromPool(poolId, entryId) {
  const { pool, fights } = await poolWithFights(poolId);
  if (fights.every((f) => f.status === 'scheduled')) {
    const members = [...pool.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id).filter((id) => id !== entryId);
    unwrap(await supabase.from('pool_entries').delete().eq('pool_id', pool.id).eq('entry_id', entryId));
    for (const [i, id] of members.entries()) {
      unwrap(await supabase.from('pool_entries').update({ position: 100 + i }).eq('pool_id', pool.id).eq('entry_id', id));
    }
    for (const [i, id] of members.entries()) {
      unwrap(await supabase.from('pool_entries').update({ position: i + 1 }).eq('pool_id', pool.id).eq('entry_id', id));
    }
    await rebuildPoolFights(pool, fights, members);
    return { fusen: 0 };
  }
  const open = unwrap(await supabase.from('matches').select('id, red_entry_id, white_entry_id')
    .eq('pool_id', pool.id).eq('status', 'scheduled').or(`red_entry_id.eq.${entryId},white_entry_id.eq.${entryId}`));
  for (const f of open) {
    const side = f.red_entry_id === entryId ? 'white' : 'red';
    unwrap(await supabase.from('matches').update({
      fusen: side, status: 'finished', winner_entry_id: side === 'red' ? f.red_entry_id : f.white_entry_id,
      finished_at: new Date().toISOString(),
    }).eq('id', f.id));
  }
  return { fusen: open.length };
}

/** Confirm (or reopen) the draws of the tournament. */
export async function setDrawsConfirmed(tournamentId, confirmed) {
  return updateTournament(tournamentId, { draws_confirmed: confirmed });
}
