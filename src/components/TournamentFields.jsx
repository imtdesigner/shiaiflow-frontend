import { useEffect, useState } from 'react';
import { linkStatus } from '../lib/api';
import { daysValue, linkProblem, suggestLink, tournamentDays } from '../lib/tournament/days.js';

const fmtDay = (date) => (date
  ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  : '');

/**
 * Start and end time of every tournament day (one row per date between the
 * start and end date). value = the days column ([{ start, end }]).
 */
export function DaysEditor({ startDate, endDate, value, onChange, disabled }) {
  const days = tournamentDays({ start_date: startDate, end_date: endDate || startDate, days: value });
  const current = daysValue(startDate, endDate || startDate, value ?? []);
  const set = (i, k, v) => onChange(current.map((d, j) => (j === i ? { ...d, [k]: v || null } : d)));
  return (
    <table className="tp-table td-days">
      <thead><tr><th>Day</th><th>Starts</th><th>Ends</th></tr></thead>
      <tbody>
        {days.map((d, i) => (
          <tr key={d.n}>
            <td>Day {d.n} <span className="tp-muted">{fmtDay(d.date)}</span></td>
            <td><input type="time" value={current[i].start ?? ''} disabled={disabled} onChange={(e) => set(i, 'start', e.target.value)} /></td>
            <td><input type="time" value={current[i].end ?? ''} disabled={disabled} onChange={(e) => set(i, 'end', e.target.value)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
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
  const url = `${window.location.host}/t/${value || '…'}`;
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
