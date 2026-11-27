import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addTeamMembers, createTeam, findOrCreateCompetitor, listCategoryTeams, listRonin,
  removeRonin, removeTeamMember, renameTeam, startedEntries,
} from '../lib/api';
import { teamMaxMembers, teamProblems, teamReserves } from '../lib/tournament/eligibility.js';
import CompetitorPicker, { personName } from './CompetitorPicker';
import { Message } from './TournamentShell';

/** A person typed by hand (not registered yet): last name, first name, club. */
function NewPerson({ onAdd, disabled, club = '' }) {
  const [p, setP] = useState({ last_name: '', first_name: '', club });
  return (
    <div className="tp-grid" style={{ alignItems: 'end' }}>
      <label className="tp-field">Last name<input value={p.last_name} onChange={(e) => setP({ ...p, last_name: e.target.value })} /></label>
      <label className="tp-field">First name<input value={p.first_name} onChange={(e) => setP({ ...p, first_name: e.target.value })} /></label>
      <label className="tp-field">Club<input value={p.club} onChange={(e) => setP({ ...p, club: e.target.value })} /></label>
      <button type="button" className="tp-btn secondary small" disabled={disabled || !p.last_name.trim()}
        onClick={() => { onAdd(p); setP({ last_name: '', first_name: '', club: p.club }); }}>Add new person</button>
    </div>
  );
}

/**
 * Team editor (owner, 2026-11-27): teams of a team category with their members
 * (no positions — the lineup is handed in at each match), ronin (signed up
 * without a team), new teams from registered competitors or ronin. Rules only
 * warn: the organizer may break them. Members are fixed once the team fought.
 */
export default function TeamEditor({ tournamentId, category, competitors, contacts, ctx, onChanged }) {
  const [teams, setTeams] = useState([]);
  const [ronin, setRonin] = useState([]);
  const [started, setStarted] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [picked, setPicked] = useState([]); // ronin ticked for a new team / an existing team
  const [draft, setDraft] = useState({ name: '', club: '', members: [] });
  const [renaming, setRenaming] = useState(null); // { id, name, club }
  const cancelled = category.status === 'cancelled';
  const size = category.team_size ?? 3;
  const max = teamMaxMembers(size);

  const load = useCallback(async () => {
    const [ts, rs, st] = await Promise.all([listCategoryTeams(category.id), listRonin(category.id), startedEntries(category.id)]);
    setTeams(ts.filter((e) => e.team).map((e) => ({
      entryId: e.id, ...e.team,
      members: [...(e.team.team_members ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((m) => m.competitor).filter(Boolean),
    })));
    setRonin(rs.filter(Boolean));
    setStarted(st);
    setPicked((p) => p.filter((id) => rs.some((r) => r?.id === id)));
  }, [category.id]);

  useEffect(() => { load().catch((e) => setMsg({ type: 'error', text: e.message })); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await fn(); await load(); onChanged?.(); if (ok) setMsg({ type: 'success', text: ok }); }
    catch (e) { setMsg({ type: 'error', text: e.message.includes('duplicate') ? 'Already in this team.' : e.message }); }
    finally { setBusy(false); }
  };

  const withDate = useCallback((c) => ({ ...c, birth_date: contacts?.get(c.id)?.birth_date ?? null }), [contacts]);
  // members have no position here, so position rules are not checked
  const problems = (team, members) => teamProblems({ ...category, position_rules: null }, team, members.map(withDate), ctx);
  const inTeam = useMemo(() => new Set(teams.flatMap((t) => t.members.map((m) => m.id))), [teams]);
  const roninIds = useMemo(() => ronin.map((r) => r.id), [ronin]);

  const confirmRules = (team, members) => {
    const pr = problems(team, members);
    return !pr.length || window.confirm(`${category.name}: ${pr.join(' · ')}\n\nAdd anyway?`);
  };

  const addToTeam = (team, people) => {
    if (!confirmRules(team, [...team.members, ...people])) return;
    run(() => addTeamMembers(team.id, people.map((p) => p.id)), `${people.map(personName).join(', ')} → ${team.name}`);
  };

  const addNewToTeam = (team, p) => run(async () => {
    const id = await findOrCreateCompetitor(tournamentId, p);
    await addTeamMembers(team.id, [id]);
  });

  const draftAdd = (c) => setDraft((d) => (d.members.some((m) => m.id === c.id) ? d : { ...d, members: [...d.members, c] }));
  const draftAddNew = (p) => run(async () => {
    const id = await findOrCreateCompetitor(tournamentId, p);
    draftAdd({ id, last_name: p.last_name.trim().toUpperCase(), first_name: p.first_name.trim(), club: p.club.trim() || null });
  });

  const saveDraft = (e) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    if (draft.members.length && !confirmRules({ club: draft.club }, draft.members)) return;
    run(async () => {
      await createTeam(tournamentId, category.id, { name: draft.name, club: draft.club, memberIds: draft.members.map((m) => m.id) });
      setDraft({ name: '', club: '', members: [] });
    }, `Team ${draft.name.toUpperCase()} added.`);
  };

  const pickedRonin = ronin.filter((r) => picked.includes(r.id));

  return (
    <div id="g-teams" className="tp-card">
      <h3>Teams and members <span className="tp-muted">· {size} + {teamReserves(size)} reserve{teamReserves(size) > 1 ? 's' : ''}</span></h3>
      <p className="tp-muted" style={{ marginTop: 0 }}>
        Only who is in a team — the order (senpo … taisho) is handed in at each match. Rules only warn; you may add anyone.
        Members are fixed once the team has fought.
      </p>
      <Message type={msg.type || 'info'}>{msg.text}</Message>

      {ronin.length > 0 && (
        <div className="team-ronin">
          <h4>Without a team (ronin): {ronin.length}</h4>
          <p className="tp-muted" style={{ marginTop: 0 }}>Signed up for {category.name} without a team. Tick them and make a new team, or add them to a team below. Ronin are not in the draw.</p>
          <ul className="team-members">
            {ronin.map((r) => (
              <li key={r.id}>
                <label>
                  <input type="checkbox" checked={picked.includes(r.id)} disabled={busy || cancelled}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />
                  {' '}{personName(r)}{r.club ? <span className="tp-muted"> · {r.club}</span> : null}
                  {contacts?.get(r.id)?.note && <span className="tp-badge" style={{ marginLeft: 6 }} title={contacts.get(r.id).note}>📝 note</span>}
                </label>
                <button type="button" className="member-x" title="Remove from this category" disabled={busy || cancelled}
                  onClick={() => { if (window.confirm(`Remove ${personName(r)} from ${category.name}?`)) run(() => removeRonin(category.id, r.id)); }}>×</button>
              </li>
            ))}
          </ul>
          {pickedRonin.length > 0 && (
            <div className="tp-actions">
              <button type="button" className="tp-btn small" disabled={busy}
                onClick={() => setDraft((d) => ({ ...d, club: d.club || pickedRonin[0].club || '', members: [...d.members, ...pickedRonin.filter((r) => !d.members.some((m) => m.id === r.id))] }))}>
                Make a new team of {pickedRonin.length} ↓
              </button>
              {teams.filter((t) => !started.has(t.entryId) && t.members.length < max).map((t) => (
                <button key={t.id} type="button" className="tp-btn secondary small" disabled={busy}
                  onClick={() => addToTeam(t, pickedRonin)}>
                  Add to {t.name} ({t.members.length})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {teams.length === 0 && <p className="tp-muted">No teams yet.</p>}
      <div className="team-list">
        {teams.map((t) => {
          const locked = started.has(t.entryId) || cancelled;
          const pr = problems(t, t.members);
          return (
            <div key={t.id} className="team-box">
              <div className="team-head">
                {renaming?.id === t.id ? (
                  <form className="tp-grid" style={{ alignItems: 'end' }}
                    onSubmit={(e) => { e.preventDefault(); run(async () => { await renameTeam(t.id, renaming); setRenaming(null); }); }}>
                    <label className="tp-field">Team name<input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} required /></label>
                    <label className="tp-field">Club<input value={renaming.club} onChange={(e) => setRenaming({ ...renaming, club: e.target.value })} /></label>
                    <span>
                      <button type="submit" className="tp-btn small" disabled={busy}>Save</button>{' '}
                      <button type="button" className="tp-btn secondary small" onClick={() => setRenaming(null)}>Cancel</button>
                    </span>
                  </form>
                ) : (
                  <>
                    <strong>{t.name}</strong>{t.club ? <span className="tp-muted"> · {t.club}</span> : null}
                    {' '}<span className={`tp-badge ${t.members.length >= size ? 'ok' : 'warn'}`}>{t.members.length} / {size}{t.members.length < size ? ` · ${size - t.members.length} missing` : ''}</span>
                    {started.has(t.entryId) && <span className="tp-badge" style={{ marginLeft: 6 }}>fought — members fixed</span>}
                    {!cancelled && (
                      <button type="button" className="tp-btn secondary small" style={{ marginLeft: 'auto' }} disabled={busy}
                        onClick={() => setRenaming({ id: t.id, name: t.name, club: t.club ?? '' })}>Rename</button>
                    )}
                  </>
                )}
              </div>
              <ul className="team-members">
                {t.members.map((m) => (
                  <li key={m.id}>
                    {personName(m)}{m.club && m.club !== t.club ? <span className="tp-muted"> · {m.club}</span> : null}
                    {!locked && (
                      <button type="button" className="member-x" title="Take out of the team (stays as a ronin of this category)" disabled={busy}
                        onClick={() => run(() => removeTeamMember(t.id, m.id, category.id), `${personName(m)} is now without a team (ronin).`)}>×</button>
                    )}
                  </li>
                ))}
              </ul>
              {pr.length > 0 && <p className="team-warn">⚠ {pr.join(' · ')}</p>}
              {!locked && t.members.length < max && (
                <details>
                  <summary className="tp-muted">Add a member</summary>
                  <CompetitorPicker competitors={competitors} exclude={inTeam} top={roninIds} disabled={busy}
                    onPick={(c) => addToTeam(t, [c])} />
                  <NewPerson club={t.club ?? ''} disabled={busy} onAdd={(p) => addNewToTeam(t, p)} />
                </details>
              )}
            </div>
          );
        })}
      </div>

      {!cancelled && (
        <form className="team-new" onSubmit={saveDraft}>
          <h4>{category.status !== 'registration' ? 'New walk-in team' : 'New team'}</h4>
          <div className="tp-grid">
            <label className="tp-field">Team name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. RIJEKA 1" required /></label>
            <label className="tp-field">Club<input value={draft.club} onChange={(e) => setDraft({ ...draft, club: e.target.value })} /></label>
          </div>
          {draft.members.length > 0 && (
            <ul className="team-members">
              {draft.members.map((m) => (
                <li key={m.id}>
                  {personName(m)}{m.club ? <span className="tp-muted"> · {m.club}</span> : null}
                  <button type="button" className="member-x" onClick={() => setDraft({ ...draft, members: draft.members.filter((x) => x.id !== m.id) })}>×</button>
                </li>
              ))}
            </ul>
          )}
          {draft.members.length < max && (
            <>
              <CompetitorPicker competitors={competitors} exclude={new Set([...inTeam, ...draft.members.map((m) => m.id)])} top={roninIds}
                disabled={busy} onPick={draftAdd} placeholder="Add a member: search registered competitors and ronin…" />
              <NewPerson club={draft.club} disabled={busy} onAdd={draftAddNew} />
            </>
          )}
          {draft.members.length > 0 && problems({ club: draft.club }, draft.members).length > 0 && (
            <p className="team-warn">⚠ {problems({ club: draft.club }, draft.members).join(' · ')}</p>
          )}
          <div className="tp-actions">
            <button type="submit" className="tp-btn" disabled={busy || !draft.name.trim()}>Add team{draft.members.length ? ` with ${draft.members.length}` : ''}</button>
          </div>
        </form>
      )}
    </div>
  );
}
