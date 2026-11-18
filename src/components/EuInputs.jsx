import { useEffect, useRef, useState } from 'react';
import { parseDate, parseTime, showDate } from '../lib/format.js';

/**
 * 24-hour time field (HH:MM), the same on every browser — the native time
 * input follows the computer's locale and may show AM/PM. Typed 930 → 09:30.
 * onChange('HH:MM' | null) when the field is left or Enter is pressed.
 */
export function TimeInput({ value, onChange, disabled, placeholder = 'HH:MM', ...rest }) {
  const [text, setText] = useState(value ?? '');
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(value ?? ''); setBad(false); }, [value]);
  const commit = () => {
    if (!text.trim()) { setBad(false); if (value) onChange(null); return; }
    const t = parseTime(text);
    if (!t) { setBad(true); return; }
    setBad(false);
    setText(t);
    if (t !== value) onChange(t);
  };
  return (
    <input {...rest} type="text" inputMode="numeric" className={`eu-time ${bad ? 'eu-bad' : ''}`} value={text}
      placeholder={placeholder} disabled={disabled} maxLength={5} title={bad ? 'Time as HH:MM, 24-hour (e.g. 09:30, 18:00)' : undefined}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
  );
}

/**
 * Date field as DD.MM.YYYY with a calendar button (the browser's picker).
 * value / onChange use 'YYYY-MM-DD' (null when emptied).
 */
export function DateInput({ value, onChange, disabled, min, max, ...rest }) {
  const [text, setText] = useState(showDate(value));
  const [bad, setBad] = useState(false);
  const picker = useRef(null);
  useEffect(() => { setText(showDate(value)); setBad(false); }, [value]);
  const commit = () => {
    if (!text.trim()) { setBad(false); if (value) onChange(null); return; }
    const d = parseDate(text);
    if (!d) { setBad(true); return; }
    setBad(false);
    setText(showDate(d));
    if (d !== value) onChange(d);
  };
  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  return (
    <span className="eu-date">
      <input {...rest} type="text" inputMode="numeric" className={bad ? 'eu-bad' : ''} value={text} placeholder="DD.MM.YYYY"
        disabled={disabled} maxLength={10} title={bad ? 'Date as DD.MM.YYYY' : undefined}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
      <button type="button" className="eu-cal" disabled={disabled} onClick={openPicker} aria-label="Choose a date">📅</button>
      <input ref={picker} type="date" className="eu-picker" tabIndex={-1} aria-hidden="true" value={value ?? ''} min={min} max={max}
        onChange={(e) => onChange(e.target.value || null)} />
    </span>
  );
}

/**
 * Date + 24-hour time; value / onChange as a local 'YYYY-MM-DDTHH:MM'
 * (like datetime-local), null when the date is emptied. Time defaults to 23:59.
 */
export function DateTimeInput({ value, onChange, disabled }) {
  const date = value ? value.slice(0, 10) : null;
  const time = value ? value.slice(11, 16) : null;
  return (
    <span className="eu-datetime">
      <DateInput value={date} disabled={disabled} onChange={(d) => onChange(d ? `${d}T${time ?? '23:59'}` : null)} />
      <TimeInput value={time} disabled={disabled || !date} onChange={(t) => date && onChange(`${date}T${t ?? '23:59'}`)} />
    </span>
  );
}
