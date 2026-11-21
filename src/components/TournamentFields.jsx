import { useEffect, useState } from 'react';
import { linkStatus } from '../lib/api';
import { daysValue, linkProblem, suggestLink, tournamentDays } from '../lib/tournament/days.js';
import { DateInput, TimeInput } from './EuInputs';
import { fmtDay as fmtDayEu } from '../lib/format.js';
import { addItem, dayProgram, proposedItem, refText, refTime, updateItem } from '../lib/tournament/program.js';

const fmtDay = (date) => fmtDayEu(date);

/**
 * Start and end time of every tournament day (one row per date between the
 * start and end date). value = the days column ([{ start, end }]).
 */
export function DaysEditor({ startDate, endDate, value, onChange, disabled }) {
  const days = tournamentDays({ start_date: startDate, end_date: endDate || startDate, days: value });
  const current = daysValue(startDate, endDate || startDate, value ?? []);
  const set = (i, k, v) => onChange(current.map((d, j) => (j === i ? { ...d, [k]: v || null } : d)));
  const setBreak = (i, k, v) => onChange(current.map((d, j) => {
    if (j !== i) return d;
    const b = { ...(d.breaks?.[0] ?? {}), [k]: v || null };
    return { ...d, breaks: b.from || b.to ? [b] : [] };
  }));
  return (
    <table className="tp-table td-days">
      <thead><tr><th>Day</th><th>Starts</th><th>Ends</th><th>Break <span className="tp-muted">(optional)</span></th></tr></thead>
      <tbody>
        {days.map((d, i) => (
          <tr key={d.n}>
            <td>Day {d.n} <span className="tp-muted">{fmtDay(d.date)}</span></td>
            <td><TimeInput value={current[i].start} disabled={disabled} onChange={(v) => set(i, 'start', v)} /></td>
            <td><TimeInput value={current[i].end} disabled={disabled} onChange={(v) => set(i, 'end', v)} /></td>
            <td>
              <span className="cr-range">
                <TimeInput value={current[i].breaks?.[0]?.from ?? null} disabled={disabled}
                  onChange={(v) => setBreak(i, 'from', v)} />
                –
                <TimeInput value={current[i].breaks?.[0]?.to ?? null} disabled={disabled}
                  onChange={(v) => setBreak(i, 'to', v)} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Does the tournament use a schedule (any day with a start time)? */
export const usesSchedule = (days, startTime) => !!startTime || (Array.isArray(days) && days.some((d) => d?.start));

/**
 * "Use a schedule?" — with exact start times (and breaks) per day the app
 * works out when categories and fights start; without, only how long things
 * take. Yes shows the days with their times.
 */
export function ScheduleQuestion({ value, onChange, startDate, endDate, days, onDays, disabled, program, onProgram, programMode = 'proposal' }) {
  const day1 = tournamentDays({ start_date: startDate, end_date: endDate || startDate, days })[0];
  return (
    <div className="td-schedule">
      <h4>Use a schedule?</h4>
      <p className="tp-muted" style={{ marginTop: 0 }}>
        With the start time of each day (and breaks) ShiaiFlow works out when each category and fight starts.
        Without a schedule it only shows approximately how long categories take.
      </p>
      <div className="tp-actions" style={{ marginTop: 0 }}>
        <label className="tp-check"><input type="radio" checked={value === true} disabled={disabled} onChange={() => onChange(true)} /> Yes, use a schedule</label>
        <label className="tp-check"><input type="radio" checked={value === false} disabled={disabled} onChange={() => onChange(false)} /> No, durations only</label>
      </div>
      {value === true && (
        <div className={`td-schedule-row ${programMode}`}>
          {startDate
            ? <DaysEditor startDate={startDate} endDate={endDate} value={days} onChange={onDays} disabled={disabled} />
            : <p className="tp-muted">Pick the dates first — then set the times of each day.</p>}
          {program && onProgram && (programMode === 'editor'
            ? <ProgramEditor program={program} onChange={onProgram} day={day1} disabled={disabled} />
            : <ProgramProposal program={program} onChange={onProgram} day={day1} disabled={disabled} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Own link name: /t/<name>. Checked as you type: free, taken (another
 * organizer) or yours (your earlier tournament uses it — then it can move to
 * this one and the earlier years become its archive). `confirmed` is that consent.
 */
export function LinkField({ value, onChange, name, saved, confirmed, onConfirm, onStatus, disabled }) {
  const [status, setStatusState] = useState(null);
  const setStatus = (v) => { setStatusState(v); onStatus?.(v); };
  const problem = linkProblem(value);
  useEffect(() => {
    setStatus(null);
    if (!value || problem || value === saved) return undefined;
    const t = setTimeout(() => { linkStatus(value).then(setStatus).catch(() => setStatus(null)); }, 350);
    return () => clearTimeout(t);
  }, [value, problem, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const url = `${window.location.host}/${value || '…'}`;
  return (
    <div className="tp-field" style={{ gridColumn: '1 / -1' }}>
      Link name <span className="tp-muted">(optional — {url})</span>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={value ?? ''} disabled={disabled} placeholder="e.g. croatian-open"
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'))} style={{ flex: '1 1 14rem' }} />
        {!value && name && (
          <button type="button" className="tp-btn secondary small" disabled={disabled} onClick={() => onChange(suggestLink(name))}>Suggest</button>
        )}
      </div>
      {problem && <span className="tp-error-text">Link name: {problem}.</span>}
      {!problem && status === 'free' && <span className="tp-ok-text">✓ free</span>}
      {!problem && status === 'taken' && <span className="tp-error-text">Taken by another organizer — choose another.</span>}
      {!problem && status === 'yours' && (
        <label className="tp-check">
          <input type="checkbox" checked={!!confirmed} onChange={(e) => onConfirm(e.target.checked)} disabled={disabled} />
          Your earlier tournament uses this link — use it for this one too (the link opens the newest edition, earlier years stay in its archive).
        </label>
      )}
    </div>
  );
}

/** True when a link value can be saved (empty, unchanged, free, or yours and confirmed). */
export function linkReady(value, saved, status, confirmed) {
  if (!value || value === saved) return true;
  if (linkProblem(value)) return false;
  return status === 'free' || (status === 'yours' && confirmed);
}

/*
 * The parts of the tournament form, the same in Create and Edit tournament:
 * Tournament (name, dates, schedule), Venue (hall, address, city, country,
 * courts), Public page (default or own link; Edit adds logo and publishing).
 * form = { name, start_date, end_date, use_schedule, days, venue, address,
 * city, country, shiaijo_count, custom_link, slug }.
 */
export function TournamentPart({ form, setForm, programMode = 'proposal' }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="tp-card">
      <h3>Tournament</h3>
      <div className="tp-grid">
        <label id="g-name" className="tp-field" style={{ gridColumn: '1 / -1' }}>
          Name
          <input value={form.name} onChange={set('name')} placeholder="e.g. Croatian Kendo Championship 2027" required />
        </label>
        <label id="g-dates" className="tp-field">Start date<DateInput value={form.start_date || null} onChange={(v) => setForm({ ...form, start_date: v ?? '' })} /></label>
        <label className="tp-field">End date<DateInput value={form.end_date || null} min={form.start_date || undefined} onChange={(v) => setForm({ ...form, end_date: v ?? '' })} /></label>
      </div>
      <div id="g-days">
        <ScheduleQuestion value={form.use_schedule} onChange={(v) => setForm({ ...form, use_schedule: v })}
          startDate={form.start_date} endDate={form.end_date} days={form.days} onDays={(days) => setForm({ ...form, days })}
          program={form.program} onProgram={(program) => setForm({ ...form, program })} programMode={programMode} />
      </div>
    </div>
  );
}

export function VenuePart({ form, setForm }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div id="g-venue-part" className="tp-card">
      <h3>Venue</h3>
      <div className="tp-grid">
        <label id="g-venue" className="tp-field">Venue (hall)<input value={form.venue} onChange={set('venue')} placeholder="e.g. Sports hall Zamet" /></label>
        <label className="tp-field">Address<input value={form.address} onChange={set('address')} placeholder="Street and number" /></label>
        <label className="tp-field">City<input value={form.city} onChange={set('city')} /></label>
        <label className="tp-field">Country<input value={form.country} onChange={set('country')} /></label>
        <label id="g-courts" className="tp-field">
          Number of courts (shiaijo)
          <select value={form.shiaijo_count} onChange={(e) => setForm({ ...form, shiaijo_count: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

export function PublicPagePart({ form, setForm, saved = '', linkConfirmed, setLinkConfirmed, setLinkState, children }) {
  const host = window.location.host;
  return (
    <div id="g-link" className="tp-card">
      <h3>Public page</h3>
      <p className="tp-muted" style={{ marginTop: 0 }}>
        Every published tournament has a public page with the setup, entries, draw, schedule and live results, and
        competitors sign up there. It is listed on the ShiaiFlow home page, so it can always be found from there. Its
        default link is <strong>{host}/t/…</strong> followed by a long code.
      </p>
      <h4>Customize the link?</h4>
      <div className="tp-actions" style={{ marginTop: 0 }}>
        <label className="tp-check"><input type="radio" checked={form.custom_link === false} onChange={() => setForm({ ...form, custom_link: false })} /> No, keep the default</label>
        <label className="tp-check"><input type="radio" checked={form.custom_link === true} onChange={() => setForm({ ...form, custom_link: true })} /> Yes, a short name (e.g. {host}/croatia-open)</label>
      </div>
      {form.custom_link && (
        <LinkField value={form.slug} saved={saved} name={form.name} onChange={(v) => setForm({ ...form, slug: v })}
          confirmed={linkConfirmed} onConfirm={setLinkConfirmed} onStatus={setLinkState} />
      )}
      {children}
    </div>
  );
}

/** Enter in a text field must not submit the whole form (it did, half-filled). */
export const noEnterSubmit = (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit') e.preventDefault();
};

/**
 * Create: the proposed day programme next to the days, read only, with the
 * shinai check on / off and "Edit now" (the full editor); details later in
 * Edit tournament.
 */
export function ProgramProposal({ program, onChange, day, disabled }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <ProgramEditor program={program} onChange={onChange} day={day} disabled={disabled} />;
  const shinai = program.find((it) => it.key === 'shinai');
  return (
    <div id="g-program" className="td-program">
      <h4>Proposed schedule <span className="tp-muted">(every day)</span></h4>
      {!day?.start && <p className="tp-muted">Set the start time of the day — the times below follow it.</p>}
      <table className="tp-table td-program-list">
        <tbody>
          {dayProgram(program, day).map((it) => (
            <tr key={it.key}>
              <td className="td-program-time">{it.fromTime ?? '—'}{it.toTime ? `–${it.toTime}` : ''}</td>
              <td>{it.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shinai && (
        <label className="tp-check"><input type="checkbox" checked={shinai.on} disabled={disabled}
          onChange={(e) => onChange(updateItem(program, 'shinai', { on: e.target.checked }))} /> Shinai check (during the warm-up)</label>
      )}
      <p className="tp-muted">You can change every item in detail later in Edit tournament.</p>
      <button type="button" className="tp-btn secondary small" disabled={disabled} onClick={() => setEditing(true)}>Edit now</button>
    </div>
  );
}

/**
 * Edit tournament: every item of the day programme on an equal footing —
 * on / off, name, from / to (a typed time stays fixed; ↺ back to the
 * proposal), remove, add your own.
 */
export function ProgramEditor({ program, onChange, day, disabled }) {
  const set = (key, patch) => onChange(updateItem(program, key, patch));
  const ordered = dayProgram(program.map((it) => ({ ...it, on: true })), day).map((it) => program.find((p) => p.key === it.key));
  return (
    <div id="g-program" className="td-program">
      <h4>Day schedule <span className="tp-muted">(every day)</span></h4>
      {!day?.start && <p className="tp-muted">Set the start time of the day — relative times follow it.</p>}
      <table className="tp-table td-program-edit">
        <thead><tr><th /><th>Item</th><th>From</th><th>To</th><th /></tr></thead>
        <tbody>
          {ordered.map((it) => {
            const proposal = proposedItem(it.key);
            const fixed = !!(it.from?.time || it.to?.time);
            return (
              <tr key={it.key} className={it.on ? '' : 'td-program-off'}>
                <td><input type="checkbox" checked={it.on} disabled={disabled || it.locked} onChange={(e) => set(it.key, { on: e.target.checked })} title="Part of the day" /></td>
                <td>{it.locked ? it.label : <input value={it.label} disabled={disabled} onChange={(e) => set(it.key, { label: e.target.value })} />}</td>
                <td>
                  {it.locked ? <span>{refTime(it.from, day) ?? '—'}</span> : (
                    <TimeInput value={refTime(it.from, day)} disabled={disabled} onChange={(v) => set(it.key, { from: v ? { time: v } : proposal?.from ?? { base: 'start', min: -30 } })} />
                  )}
                  {!it.from?.time && <div className="tp-muted td-program-rel">{refText(it.from)}</div>}
                </td>
                <td>
                  {!it.locked && (
                    <TimeInput value={refTime(it.to, day)} disabled={disabled} onChange={(v) => set(it.key, { to: v ? { time: v } : null })} />
                  )}
                  {it.to && !it.to.time && <div className="tp-muted td-program-rel">{refText(it.to)}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {proposal && fixed && (
                    <button type="button" className="tp-btn secondary small" disabled={disabled} title="Back to the proposed time"
                      onClick={() => set(it.key, { from: proposal.from, to: proposal.to })}>↺</button>
                  )}
                  {!it.locked && (
                    <button type="button" className="tp-btn secondary small" disabled={disabled} title="Remove"
                      onClick={() => onChange(program.filter((p) => p.key !== it.key))}>✕</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="tp-btn secondary small" disabled={disabled} onClick={() => onChange(addItem(program))}>+ Add item</button>
      <p className="tp-muted">Times without a typed value follow the start (or end) of each day. The awards time is an estimate until the categories and entries are known.</p>
    </div>
  );
}
