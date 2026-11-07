// Thin data layer over Supabase. Pages call these instead of building queries.
import { supabase } from '../supabaseClient';
import { directKoQualifiers } from './tournament/draw.js';
import { drawCourts } from './tournament/courts.js';

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
    .select('id, checked_in, tier, competitor:competitors(id, last_name, first_name, display_name, club, grade), team:teams(id, name, club)')
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
    .select('id, phase, label, pool_id, ko_no, red_code, white_code, red_entry_id, white_entry_id, shiaijo, status')
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
export async function saveDraw(category, draw) {
  await clearDraw(category.id);
  const courts = drawCourts(draw, category.shiaijos);

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
        queue_order: (queue += 1),
      });
    }
  }
  if (rows.length) unwrap(await supabase.from('matches').insert(rows));

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
    .select('id, category_id, phase, ko_no, shiaijo, status')
    .in('category_id', categoryIds));
}

/**
 * Set the courts of a category; for a drawn category the fights that have not
 * started move to the new courts (same split as when the draw is saved).
 */
export async function setCategoryCourts(category, shiaijos) {
  const updated = await updateCategory(category.id, { shiaijos });
  if (category.status === 'registration' || category.status === 'cancelled') return updated;
  const { pools, matches } = await getSavedDraw(category.id);
  const draw = {
    directKo: category.pool_size === 1,
    pools: pools.map((p) => p.pool_entries),
    koTemplate: category.ko_template,
  };
  const courts = drawCourts(draw, shiaijos);
  const poolIndex = Object.fromEntries(pools.map((p, i) => [p.id, i]));
  const byCourt = new Map();
  for (const m of matches.filter((x) => x.status === 'scheduled')) {
    const court = m.phase === 'ko' ? courts.ko.get(m.ko_no) : courts.pool[poolIndex[m.pool_id]];
    if (court && court !== m.shiaijo) byCourt.set(court, [...(byCourt.get(court) ?? []), m.id]);
  }
  for (const [court, ids] of byCourt) {
    unwrap(await supabase.from('matches').update({ shiaijo: court }).in('id', ids));
  }
  return updated;
}
