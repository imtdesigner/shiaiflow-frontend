/**
 * Two (or more) buttons side by side, one picked: the picked one in colour,
 * the others grey (owner, 2026-11-21: Individual | Team, Men | Women, days).
 * options = [[value, label], …]. `selected` (a list) makes it multi-select:
 * every listed value is shown picked and a click toggles it.
 */
export default function Segmented({ options, value, onChange, disabled, className = '', selected }) {
  const isOn = (v) => (selected ? selected.includes(v) : value === v);
  return (
    <div className={`seg ${className}`} role={selected ? 'group' : 'radiogroup'}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" role={selected ? 'checkbox' : 'radio'} aria-checked={isOn(v)} disabled={disabled}
          className={isOn(v) ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}
