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
 * fields; categories: the categories added so far.
 */
export function createSteps(form = {}, categories = []) {
  return [
    step('name', 'Name', form.name?.trim(), 'Give the tournament a name.', 'create', 'g-name'),
    step('dates', 'Dates', form.start_date, 'Pick the start and end date.', 'create', 'g-dates'),
    step('venue', 'Venue', form.venue?.trim() || form.city?.trim(), 'Enter the venue and the city.', 'create', 'g-venue'),
    step('categories', 'Categories', categories.length, 'Add categories — start from a template and adjust it.', 'create', 'g-categories'),
    step('create', 'Create', false, 'Check who can enter and how each category fights, then create the tournament.', 'create', 'g-create'),
  ];
}

/** Steps of a phase for an existing tournament (same ctx as tournamentPhase). */
export function phaseSteps(phase, t, { categories = [], entries = null, fights = null, now = new Date() } = {}) {
  const live = categories.filter((c) => c.status !== 'cancelled');
  const drawn = live.filter((c) => c.status !== 'registration');
  const firstDay = Array.isArray(t?.days) ? t.days[0] : null;
  switch (phase) {
    case 'setup': return [
      step('name', 'Name', t?.name, 'Give the tournament a name.', 'edit', 'g-details'),
      step('dates', 'Dates', t?.start_date, 'Pick the start and end date.', 'edit', 'g-details'),
      step('venue', 'Venue', t?.venue || t?.city, 'Enter the venue and the city.', 'edit', 'g-details'),
      step('categories', 'Categories', live.length, 'Add categories — start from a template and adjust it.', 'drawings'),
      step('times', 'Times', firstDay?.start || t?.start_time, 'Set the start time of each day — the fight plan counts from it.', 'edit', 'g-days'),
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
      step('draw', 'Draw', live.length && drawn.length === live.length, `Make the draw of every category (${drawn.length} / ${live.length} drawn).`, 'drawings'),
      step('courts', 'Courts', live.length && live.every((c) => c.shiaijos?.length), 'Give each category its shiaijo in the Shiaijo plan.', 'shiaijo'),
      step('confirm', 'Confirm', t?.draws_confirmed, 'Confirm the draws so editors stop changing the setup.', 'drawings'),
    ];
    case 'register':
    case 'start': return [
      step('present', 'Present', entries && entries.present === entries.total,
        `On the day, tick who is present${entries ? ` (${entries.present} / ${entries.total})` : ''}.`, 'registration', 'g-checkin'),
      step('adjust', 'Adjust', entries && entries.present === entries.total, 'Replace or withdraw who did not come in Drawings → Adjust the draw.', 'drawings'),
      step('start', 'Start', false, 'Start the tournament — the order of fights on every shiaijo is frozen.', 'registration', 'g-start'),
    ];
    case 'live': return [
      step('tables', 'Tables', true, 'Scoretables join with the PIN and pick their shiaijo.', 'manage'),
      step('displays', 'Displays', true, 'Open the court display on the monitor next to each shiaijo.', 'manage', 'g-displays'),
      step('fights', 'Fights', fights && fights.finished === fights.total,
        `Follow the courts and correct fights in Manage${fights ? ` (${fights.finished} / ${fights.total} done)` : ''}.`, 'manage'),
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
