import { useMemo, useState } from 'react';

// search ignores accents: č → c, ő → o; Đ / đ are separate letters, read as d (also ß → ss, ł → l)
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/đ/g, 'd').replace(/ß/g, 'ss').replace(/ł/g, 'l');
export const personName = (c) => `${c.last_name}${c.first_name ? ` ${c.first_name}` : ''}`;

/**
 * Search the tournament's registered competitors and pick one.
 * competitors: [{ id, last_name, first_name, club }]; exclude: Set of ids; top: ids listed first (e.g. ronin).
 */
export default function CompetitorPicker({ competitors, exclude = new Set(), top = [], onPick, placeholder = 'Search by name or club…', disabled }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const rank = new Map(top.map((id, i) => [id, i]));
    return competitors
      .filter((c) => !exclude.has(c.id))
      .filter((c) => words.every((w) => norm(`${c.last_name} ${c.first_name} ${c.club}`).includes(w)))
      .sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || a.last_name.localeCompare(b.last_name))
      .slice(0, q ? 12 : 6);
  }, [competitors, exclude, top, q]);
  const topSet = new Set(top);
  return (
    <div className="picker">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} disabled={disabled} />
      {list.length > 0 && (
        <div className="picker-list">
          {list.map((c) => (
            <button key={c.id} type="button" className="picker-item" disabled={disabled}
              onClick={() => { onPick(c); setQ(''); }}>
              + {personName(c)}{c.club ? <span className="tp-muted"> · {c.club}</span> : null}
              {topSet.has(c.id) && <span className="tp-badge warn" style={{ marginLeft: 6 }}>ronin</span>}
            </button>
          ))}
        </div>
      )}
      {q && list.length === 0 && <p className="tp-muted" style={{ margin: '0.3rem 0' }}>No registered competitor matches.</p>}
    </div>
  );
}
