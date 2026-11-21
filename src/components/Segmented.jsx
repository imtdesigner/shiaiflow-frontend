/**
 * Two (or more) buttons side by side, one picked: the picked one in colour,
 * the others grey (owner, 2026-11-21: Individual | Team, Men | Women, days).
 * options = [[value, label], …].
 */
export default function Segmented({ options, value, onChange, disabled, className = '' }) {
  return (
    <div className={`seg ${className}`} role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} disabled={disabled}
          className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}
