import { useEffect, useState } from 'react';
import { linkStatus } from '../lib/api';
import { daysValue, linkProblem, suggestLink, tournamentDays } from '../lib/tournament/days.js';
import { TimeInput } from './EuInputs';
import { fmtDay as fmtDayEu } from '../lib/format.js';

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
export function ScheduleQuestion({ value, onChange, startDate, endDate, days, onDays, disabled }) {
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
      {value === true && (startDate
        ? <DaysEditor startDate={startDate} endDate={endDate} value={days} onChange={onDays} disabled={disabled} />
        : <p className="tp-muted">Pick the dates first — then set the times of each day.</p>)}
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
