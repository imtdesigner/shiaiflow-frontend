import { useCallback, useEffect, useMemo, useState } from 'react';
import { listEntriesFor, listPaid, setCheckedIn, setPaid } from '../lib/api';
import { norm, personName } from './CompetitorPicker';
import { Message } from './TournamentShell';

/** A checkbox that also shows "some" (indeterminate). */
function TriCheck({ all, some, disabled, onChange }) {
  return (
    <input type="checkbox" checked={all} disabled={disabled}
      ref={(el) => { if (el) el.indeterminate = some && !all; }}
      onChange={(e) => onChange(e.target.checked)} />
  );
}

/**
 * Registration "All" (owner, 2026-11-27): every competitor of the individual
 * categories once, for check-in in the hall — sort by last name, club or
 * category, search; Present / Paid tick all of the person's entries at once.
 */
export default function AllEntries({ categories }) {
  const cats = useMemo(() => categories.filter((c) => c.kind === 'individual' && c.status !== 'cancelled'), [categories]);
  const catKey = cats.map((c) => c.id).join();
  const [entries, setEntries] = useState([]);
  const [paid, setPaidSet] = useState(new Set());
  const [sort, setSort] = useState({ by: 'name', dir: 1 });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const ens = (await listEntriesFor(catKey ? catKey.split(',') : [])).filter((e) => e.competitor);
      setEntries(ens);
      setPaidSet(await listPaid(ens.map((e) => e.id)));
    } catch (e) { setMsg(e.message); }
  }, [catKey]);
  useEffect(() => { load(); }, [load]);

  const catOf = useMemo(() => new Map(cats.map((c, i) => [c.id, { ...c, order: i }])), [cats]);
  const people = useMemo(() => {
    const by = new Map();
    for (const e of entries) {
      const p = by.get(e.competitor.id) ?? { ...e.competitor, entries: [] };
      p.entries.push(e);
      by.set(e.competitor.id, p);
    }
    for (const p of by.values()) p.entries.sort((a, b) => catOf.get(a.category_id).order - catOf.get(b.category_id).order);
    return [...by.values()];
  }, [entries, catOf]);

  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const name = (p) => `${p.last_name} ${p.first_name ?? ''}`;
    const cmp = {
      name: (a, b) => name(a).localeCompare(name(b), 'hr'),
      club: (a, b) => (a.club ?? '').localeCompare(b.club ?? '', 'hr') || name(a).localeCompare(name(b), 'hr'),
      category: (a, b) => catOf.get(a.entries[0].category_id).order - catOf.get(b.entries[0].category_id).order
        || name(a).localeCompare(name(b), 'hr'),
    }[sort.by];
    return people
      .filter((p) => words.every((w) => norm(`${name(p)} ${p.club ?? ''} ${p.entries.map((e) => catOf.get(e.category_id).name).join(' ')}`).includes(w)))
      .sort((a, b) => sort.dir * cmp(a, b));
  }, [people, q, sort, catOf]);

  const setAll = async (p, field, value) => {
    setBusy(true); setMsg('');
    try {
      for (const e of p.entries) {
        if (field === 'checked_in' && e.checked_in !== value) await setCheckedIn(e.id, value);
        if (field === 'paid' && paid.has(e.id) !== value) await setPaid(e.id, value);
      }
      await load();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  const head = (by, label) => (
    <th>
      <button type="button" className={`sort-head ${sort.by === by ? 'on' : ''}`}
        onClick={() => setSort((s) => ({ by, dir: s.by === by ? -s.dir : 1 }))}>
        {label}{sort.by === by ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
  const present = people.filter((p) => p.entries.every((e) => e.checked_in)).length;
  const paidCount = people.filter((p) => p.entries.every((e) => paid.has(e.id))).length;

  return (
    <div id="g-all" className="tp-card">
      <h3>
        All competitors: {people.length}
        {' '}<span className={`tp-badge ${present === people.length && people.length ? 'ok' : 'warn'}`}>present {present}</span>
        {' '}<span className={`tp-badge ${paidCount === people.length && people.length ? 'ok' : 'warn'}`}>paid {paidCount}</span>
      </h3>
      <p className="tp-muted" style={{ marginTop: 0 }}>
        Individual categories, each person once. Present / Paid tick every category of the person (half-ticked = only some). Teams: in their category tab.
      </p>
      {msg && <Message type="error">{msg}</Message>}
      <input className="all-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, club or category…" />
      <table className="tp-table">
        <thead>
          <tr><th>#</th>{head('name', 'Name')}{head('club', 'Club')}{head('category', 'Categories')}<th>Present</th><th>Paid</th></tr>
        </thead>
        <tbody>
          {shown.map((p, i) => {
            const inAll = p.entries.every((e) => e.checked_in);
            const inSome = p.entries.some((e) => e.checked_in);
            const paidAll = p.entries.every((e) => paid.has(e.id));
            const paidSome = p.entries.some((e) => paid.has(e.id));
            return (
              <tr key={p.id}>
                <td className="tp-muted">{i + 1}</td>
                <td><strong>{personName(p)}</strong></td>
                <td>{p.club ?? ''}</td>
                <td>
                  {p.entries.map((e) => (
                    <span key={e.id} className={`tp-badge ${e.checked_in ? 'ok' : ''}`} style={{ marginRight: 4 }}
                      title={e.checked_in ? 'present' : 'not checked in'}>{catOf.get(e.category_id).name}</span>
                  ))}
                </td>
                <td><TriCheck all={inAll} some={inSome} disabled={busy} onChange={(v) => setAll(p, 'checked_in', v)} /></td>
                <td><TriCheck all={paidAll} some={paidSome} disabled={busy} onChange={(v) => setAll(p, 'paid', v)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {shown.length === 0 && <p className="tp-muted">{people.length ? 'Nobody matches the search.' : 'No individual entries yet.'}</p>}
    </div>
  );
}
