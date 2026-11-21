// Setup guide (owner, 2026-11-20): the tournament timeline
//   setup → signup → draw → register → start → live → finished → past
// worked out from the tournament's state, with the steps of the current
// phase (one-word labels, ✓ when done) and one hint sentence for the first
// step still open. Each step points to where it is done: { page, anchor }.

export const PHASES = [
  { key: 'setup', label: 'Setup' },
  { key: 'signup', label: 'Signup' },
  { key: 'draw', label: 'Draw' },
  { key: 'register', label: 'Register' },
  { key: 'start', label: 'Start' },
  { key: 'live', label: 'Live' },
  { key: 'finished', label: 'Finished' },
  { key: 'past', label: 'Past' },
];

const today = () => new Date().toISOString().slice(0, 10);
const step = (key, label, done, hint, page, anchor = null) => ({ key, label, done: !!done, hint, page, anchor });

/** Signup open right now (by hand and before the deadline). */
export const signupOpen = (t, now = new Date()) => !!t?.registration_open
  && (!t.registration_deadline || new Date(t.registration_deadline) > now);

/**
 * Phase of a tournament. ctx: { categories, entries: { total, present } | null,
 * fights: { total, finished } | null, now }.
 */
export function tournamentPhase(t, { categories = [], entries = null, fights = null, now = new Date() } = {}) {
  if (!t) return 'setup';
  const ended = t.end_date && t.end_date < (now.toISOString?.().slice(0, 10) ?? today());
  if (t.status === 'finished') return ended ? 'past' : 'finished';
  if (t.status === 'running') {
    if (fights && fights.total > 0 && fights.finished === fights.total) return ended ? 'past' : 'finished';
    return 'live';
  }
  const live = categories.filter((c) => c.status !== 'cancelled');
  const setupDone = t.name && t.start_date && (t.venue || t.city) && live.length > 0 && t.is_public;
  if (!setupDone) return 'setup';
  const notDrawn = live.filter((c) => c.status === 'registration');
  if (notDrawn.length && signupOpen(t, now)) return 'signup';
  if (notDrawn.length) return 'draw';
  if (!entries || entries.present < entries.total) return 'register';
  return 'start';
}

/**
 * Steps of the creating form (no tournament yet). form: the Create page's
 * fields; categories: the categories added so far; seen: { left(anchor),
 * inside(anchor) } — a step counts as done only once its field has been left
 * (typing in it keeps the hint there), and fields with a default (link,
 * courts, days, signup rules) once they have been visited.
 */
export function createSteps(form = {}, categories = [], seen = {}) {
  const inside = (a) => !!seen.inside?.(a);
  const left = (a) => !!seen.left?.(a);
  const filled = (a, v) => !!v && !inside(a);
  const visited = (a) => left(a) && !inside(a);
  return [
    step('name', 'Name', filled('g-name', form.name?.trim()), 'Give the tournament a name.', 'create', 'g-name'),
    step('dates', 'Dates', filled('g-dates', form.start_date), 'Pick the start and end date.', 'create', 'g-dates'),
    step('days', 'Schedule', form.use_schedule === false || (form.use_schedule === true && visited('g-days')),
      'Use a schedule? With start times per day the fight plan shows clock times; without, only durations.', 'create', 'g-days'),
    step('venue', 'Venue', filled('g-venue', form.venue?.trim()), 'Enter the hall, its address, the city and the country.', 'create', 'g-venue'),
    step('courts', 'Courts', visited('g-courts'), 'How many shiaijos (courts) will there be?', 'create', 'g-courts'),
    step('link', 'Link', visited('g-link') || filled('g-link', form.slug?.trim()), 'Optional: a short link name for the public page (e.g. croatia-open).', 'create', 'g-link'),
    step('signup', 'Signup', visited('g-signup-rules'), 'How age limits count, and may a competitor enter only one category?', 'create', 'g-signup-rules'),
    step('categories', 'Categories', categories.length > 0, 'Add categories — start from a template (Junior A, Kyu M …) or an empty one.', 'create', 'g-categories'),
    ...categorySteps(categories, seen),
    step('create', 'Create', false, 'All set? Create the tournament.', 'create', 'g-create'),
  ];
}

/**
 * Steps of one category while creating: the one being edited (focus inside
 * it), else the first one whose parts were not all visited. A part counts
 * once it has been visited and left.
 */
function categorySteps(categories, seen) {
  const inside = (a) => !!seen.inside?.(a);
  const visited = (a) => !!seen.left?.(a) && !inside(a);
  const parts = (c) => [`g-cat-${c._key}-name`, `g-cat-${c._key}-who`, `g-cat-${c._key}-fights`];
  const c = categories.find((x) => inside(`g-cat-${x._key}`))
    ?? categories.find((x) => !parts(x).every(visited));
  if (!c) return [];
  const [nameA, whoA, fightsA] = parts(c);
  const label = c.name?.trim() || 'New category';
  const team = c.kind === 'team';
  return [
    step(`cat-name-${c._key}`, label, visited(nameA) && c.name?.trim(),
      `${label}: check the name${team ? '' : ' and whether it is individual or team'}.`, 'create', nameA),
    step(`cat-who-${c._key}`, 'Who', visited(whoA),
      `${label} — who can enter: gender, age and grade${team ? ', team size and positions' : ''}; switch off what does not limit.`, 'create', whoA),
    step(`cat-fights-${c._key}`, 'Fights', visited(fightsA),
      `${label} — how it fights: pool size, how many go on to the KO, fight times and what happens on a tie.`, 'create', fightsA),
  ];
}

/**
 * Steps of a phase for an existing tournament (same ctx as tournamentPhase,
 * plus seen: pages of this tournament already opened on this device — the
 * steps that only ask to check something count once their page was seen).
 */
export function phaseSteps(phase, t, {
  categories = [], entries = null, fights = null, now = new Date(), seen = new Set(),
} = {}) {
  const live = categories.filter((c) => c.status !== 'cancelled');
  const drawn = live.filter((c) => c.status !== 'registration');
  const firstDay = Array.isArray(t?.days) ? t.days[0] : null;
  const allPresent = entries && entries.present === entries.total;
  switch (phase) {
    case 'setup': return [
      step('name', 'Name', t?.name, 'Give the tournament a name.', 'edit', 'g-details'),
      step('dates', 'Dates', t?.start_date, 'Pick the start and end date.', 'edit', 'g-details'),
      step('venue', 'Venue', t?.venue || t?.city, 'Enter the venue and the city.', 'edit', 'g-details'),
      // a schedule is optional ("durations only"): done once set or the page was checked
      step('times', 'Schedule', firstDay?.start || t?.start_time || seen.has('edit'), 'Use a schedule? Start times per day give clock times in the fight plan.', 'edit', 'g-days'),
      step('categories', 'Categories', live.length, 'Every tournament needs categories — add them when creating, or copy them from another tournament.', 'drawings'),
      step('courts', 'Courts', seen.has('shiaijo') || live.every((c) => c.shiaijos?.length), 'Give each category its shiaijo in the Shiaijo plan.', 'shiaijo', 'g-court-cats'),
      step('rules', 'Rules', seen.has('edit'), 'Check the rules for entering (age basis, one category only).', 'edit', 'g-rules'),
      step('signup', 'Form', t?.signup_fields, 'Choose which fields the signup form asks for.', 'edit', 'g-signup'),
      step('publish', 'Publish', t?.is_public, 'Publish the tournament so competitors can find it and sign up.', 'edit', 'g-publish'),
    ];
    case 'signup': return [
      step('open', 'Open', signupOpen(t, now), 'Open the registration.', 'edit', 'g-registration'),
      step('deadline', 'Deadline', t?.registration_deadline, 'Set a deadline — the signup then closes by itself.', 'edit', 'g-registration'),
      step('entries', 'Entries', entries?.total, 'Share the public link — competitors sign up themselves.', 'registration'),
      step('close', 'Close', !signupOpen(t, now), 'When it is time to draw, close the signup (or let the deadline pass).', 'edit', 'g-registration'),
    ];
    case 'draw': return [
      step('close', 'Closed', !signupOpen(t, now), 'Close the signup before the draw.', 'edit', 'g-registration'),
      step('brackets', 'Brackets', seen.has('brackets') || drawn.length > 0, 'Optional: adjust the KO pairings in the bracket editor before the draw.', 'brackets', 'g-brackets'),
      step('draw', 'Draw', live.length && drawn.length === live.length, `Make the draw of every category (${drawn.length} / ${live.length} drawn).`, 'drawings', 'g-draw'),
      step('courts', 'Courts', live.length && live.every((c) => c.shiaijos?.length), 'Give each category its shiaijo in the Shiaijo plan.', 'shiaijo', 'g-court-cats'),
      step('plan', 'Plan', seen.has('fights'), 'Check the fight plan — order and estimated times per shiaijo.', 'fights', 'g-plan'),
      step('confirm', 'Confirm', t?.draws_confirmed, 'Confirm the draws so editors stop changing the setup.', 'drawings', 'g-confirm'),
    ];
    case 'register':
    case 'start': return [
      step('present', 'Present', allPresent,
        `On the day, tick who is present${entries ? ` (${entries.present} / ${entries.total})` : ''}.`, 'registration', 'g-checkin'),
      step('adjust', 'Adjust', allPresent, 'Replace or withdraw who did not come in Drawings → Adjust the draw.', 'drawings', 'g-adjust'),
      step('pin', 'PIN', seen.has('manage'), 'Set the PIN — scoretables join with it and pick their shiaijo.', 'manage', 'g-pin'),
      step('start', 'Start', false, 'Start the tournament — the order of fights on every shiaijo is frozen.', 'registration', 'g-start'),
    ];
    case 'live': return [
      step('tables', 'Tables', true, 'Scoretables join with the PIN and pick their shiaijo.', 'manage', 'g-pin'),
      step('displays', 'Displays', true, 'Open the court display on the monitor next to each shiaijo.', 'manage', 'g-displays'),
      step('fights', 'Fights', fights && fights.finished === fights.total,
        `Follow the courts and correct fights in Manage${fights ? ` (${fights.finished} / ${fights.total} done)` : ''}.`, 'manage', 'g-standings'),
    ];
    case 'finished': return [
      step('fights', 'Fights', true, 'All fights are finished.', 'manage'),
      step('results', 'Results', false, 'Results are on the public page.', 'public'),
    ];
    default: return [
      step('results', 'Results', true, 'This tournament is over — its results stay on the public page.', 'public'),
    ];
  }
}

/** The step to hint at: the first one still open (null when all are done). */
export const currentStep = (steps) => steps.find((s) => !s.done) ?? null;
