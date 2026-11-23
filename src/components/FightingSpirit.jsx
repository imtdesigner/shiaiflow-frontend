import { useCallback, useEffect, useMemo, useState } from 'react';
import { listEntriesFor, listPools, listTournamentFights } from '../lib/api';
import { listFightingSpirit, listTeamMembers } from '../lib/runApi';
import { categoryResults } from '../lib/tournament/results.js';
import { entryName } from './TournamentShell';

const personName = (c) => (c ? c.display_name || `${c.last_name}${c.first_name ? ` ${c.first_name}` : ''}` : '—');

// candidates first by how far they got, then by name
const STAGE_ORDER = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '1/2 final': 5, '1/4 final': 6, '1/8 final': 7, '1/16 final': 8, pool: 20, 'still fighting': 30 };
const stageRank = (s) => STAGE_ORDER[s] ?? (s?.startsWith('pool') ? 19 : 10);

/**
 * Everything the results and the Fighting spirit pick need for some
 * categories: entries, fights, pools, team members, the tables' proposals.
 * Returns { ready, reload, byCategory(id) → { results, entries, candidates, nameOfEntry } , proposals, personOf }.
 */
export function useResultsData(categories) {
  const ids = categories.map((c) => c.id).join();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const catIds = ids ? ids.split(',') : [];
    try {
      const [entries, fights, pools, proposals] = await Promise.all([
        listEntriesFor(catIds), listTournamentFights(catIds), listPools(catIds), listFightingSpirit(catIds),
      ]);
      const teamIds = entries.filter((e) => e.team).map((e) => e.team.id);
      const members = await listTeamMembers(teamIds);
      setData({ entries, fights, pools, proposals, members });
      setError('');
    } catch (e) { setError(e.message); }
  }, [ids]);
  useEffect(() => { load(); }, [load]);

  const byCategory = (category) => {
    if (!data) return null;
    const entries = data.entries.filter((e) => e.category_id === category.id);
    const fights = data.fights.filter((f) => f.category_id === category.id);
    const pools = data.pools.filter((p) => p.category_id === category.id);
    const results = categoryResults(category, fights, pools, entries.map((e) => e.id));
    // people who can get Fighting spirit: competitors, or members of the teams
    const candidates = [];
    for (const e of entries) {
      const stage = results.stage.get(e.id) ?? '';
      if (e.team) {
        data.members.filter((m) => m.team_id === e.team.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .forEach((m) => candidates.push({ competitorId: m.competitor_id, name: personName(m.competitor), team: e.team.name, club: e.team.club, stage }));
      } else if (e.competitor) {
        candidates.push({ competitorId: e.competitor.id, name: personName(e.competitor), club: e.competitor.club, stage });
      }
    }
    candidates.sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.name.localeCompare(b.name));
    const nameOfEntry = (id) => { const e = entries.find((x) => x.id === id); return e ? entryName(e) : '—'; };
    const clubOfEntry = (id) => { const e = entries.find((x) => x.id === id); return e?.team?.club ?? e?.competitor?.club ?? ''; };
    return { results, entries, candidates, nameOfEntry, clubOfEntry, proposals: data.proposals.filter((p) => p.category_id === category.id) };
  };
  return { ready: !!data, error, reload: load, byCategory };
}

/** A person of the candidate list as "Name (Team) — club". */
export function candidateText(c) {
  if (!c) return '—';
  return `${c.name}${c.team ? ` (${c.team})` : ''}${c.club && c.club !== c.team ? ` — ${c.club}` : ''}`;
}

/**
 * List of competitors with how far they got in brackets; clicking one picks it.
 * `selected` is highlighted.
 */
export function SpiritList({ candidates, selected, onPick, disabled }) {
  if (!candidates.length) return <p className="tp-muted">No competitors.</p>;
  return (
    <ul className="fs-list">
      {candidates.map((c) => (
        <li key={c.competitorId}>
          <button type="button" className={`fs-person ${selected === c.competitorId ? 'picked' : ''}`} disabled={disabled} onClick={() => onPick(c.competitorId)}>
            <span>{c.name}{c.team && <span className="tp-muted"> · {c.team}</span>}</span>
            <span className="fs-stage">({c.stage || '—'})</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Scoretable popup right after the table's last fight of a category on its
 * shiaijo: ask the shinpan as they leave the shiaijo, pick one person (result
 * in brackets) and Confirm, Skip (no proposal from this table) or Later.
 */
export function SpiritPopup({ category, court, onSave, onLater }) {
  const cats = useMemo(() => [category], [category]);
  const { ready, error, byCategory } = useResultsData(cats);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async (id) => {
    setBusy(true); setMsg('');
    try { await onSave(id); } catch (e) { setMsg(/fetch|network|offline/i.test(e.message) ? 'No connection — try again in a moment.' : e.message); setBusy(false); }
  };
  const d = ready ? byCategory(category) : null;
  return (
    <div className="st-popup-back" role="presentation">
      <div className="st-popup fs-popup" role="dialog" aria-label="Fighting spirit">
        <h3 style={{ marginTop: 0 }}>Fighting spirit · {category.name}</h3>
        <p><strong>Ask the shinpan now</strong>, as they leave shiaijo {court}: who showed the best fighting spirit in this category?</p>
        {(error || msg) && <p className="tp-message error">{error || msg}</p>}
        {!d ? <p>Loading…</p> : <SpiritList candidates={d.candidates} selected={picked} disabled={busy} onPick={setPicked} />}
        <div className="tp-actions">
          <button type="button" className="tp-btn" disabled={busy || !picked} onClick={() => save(picked)}>Confirm</button>
          <button type="button" className="tp-btn secondary" disabled={busy} onClick={() => save(null)} title="This table proposes no one">Skip</button>
          <button type="button" className="tp-btn secondary" disabled={busy} onClick={onLater} title="Close and ask again later on this device">Later</button>
        </div>
      </div>
    </div>
  );
}
