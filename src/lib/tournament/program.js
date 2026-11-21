// Day programme (owner, 2026-11-21): hall opens, shinpan meeting, warm-up,
// shinai check, line-up (= opening ceremony), fights begin, awards. Proposed
// when a schedule is used; the same for every day. Times are relative to the
// day's start (or end, for the awards) until the organizer types a time, which
// then stays fixed. Items can be switched off, renamed, removed or added.
//
// item = { key, label, on, from: Ref, to: Ref | null, locked? }
// Ref  = { base: 'start' | 'end', min: minutes } | { time: 'HH:MM' }

export const DEFAULT_PROGRAM = [
  { key: 'hall', label: 'Hall opens', on: true, from: { base: 'start', min: -90 }, to: null },
  { key: 'warmup', label: 'Warm-up', on: true, from: { base: 'start', min: -75 }, to: { base: 'start', min: -20 } },
  { key: 'shinai', label: 'Shinai check', on: false, from: { base: 'start', min: -75 }, to: { base: 'start', min: -20 } },
  { key: 'shinpan', label: 'Shinpan meeting', on: true, from: { base: 'start', min: -45 }, to: null },
  { key: 'lineup', label: 'Line-up and opening ceremony', on: true, from: { base: 'start', min: -15 }, to: null },
  { key: 'fights', label: 'Fights begin', on: true, from: { base: 'start', min: 0 }, to: null, locked: true },
  { key: 'awards', label: 'Awards ceremony (estimate)', on: true, from: { base: 'end', min: -30 }, to: null },
];

const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = (m) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;

/** The tournament's programme (saved, or the proposal). */
export function programOf(t) {
  return Array.isArray(t?.program) && t.program.length ? t.program : DEFAULT_PROGRAM;
}

/** Items of a day: its own programme (a later day edited on its own), else the tournament's. */
export const programForDay = (program, day) => (Array.isArray(day?.program) && day.program.length ? day.program : program);

/** 'HH:MM' of a Ref on a day ({ start, end }), or null when its base time is missing. */
export function refTime(ref, day) {
  if (!ref) return null;
  if (ref.time) return ref.time;
  const base = ref.base === 'end' ? day?.end : day?.start;
  return base ? toTime(toMin(base) + ref.min) : null;
}

/** Switched-on items of a day with clock times, in time order (no time last). */
export function dayProgram(program, day) {
  return program
    .filter((it) => it.on)
    .map((it) => ({ ...it, fromTime: refTime(it.from, day), toTime: refTime(it.to, day) }))
    .sort((a, b) => (a.fromTime == null) - (b.fromTime == null) || (a.fromTime ?? '').localeCompare(b.fromTime ?? ''));
}

/** "1 h 30 before the start", "30 min before the end", "at 08:30". */
export function refText(ref) {
  if (!ref) return '';
  if (ref.time) return `at ${ref.time}`;
  if (ref.min === 0) return `at the ${ref.base}`;
  const m = Math.abs(ref.min);
  const len = m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`;
  return `${len} ${ref.min < 0 ? 'before' : 'after'} the ${ref.base}`;
}

/** Programme with one item changed (patch) — a typed time makes that end fixed. */
export function updateItem(program, key, patch) {
  return program.map((it) => (it.key === key ? { ...it, ...patch } : it));
}

/** A new item of the organizer's own, at the start unless a time is given. */
export function addItem(program, label = 'New item') {
  const key = `own-${Date.now().toString(36)}`;
  return [...program, { key, label, on: true, from: { base: 'start', min: -30 }, to: null }];
}

/** Proposed timing of a default item (for "back to proposed"). */
export const proposedItem = (key) => DEFAULT_PROGRAM.find((d) => d.key === key) ?? null;
