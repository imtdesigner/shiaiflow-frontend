import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BackToDashboard, CategoryTabs, Message, entryName, useTournament,
} from '../components/TournamentShell';
import {
  addCompetitorEntry, addTeamEntry, listEntries, removeEntry, setCheckedIn, setTier,
} from '../lib/api';
import { TIER_LABELS } from '../lib/tournament/placement.js';
import { GRADES, gradeLabel, ineligibleReason, tournamentAgeCtx, rulesText } from '../lib/tournament/eligibility.js';
import './TournamentPages.css';

const EMPTY_PERSON = {
  last_name: '', first_name: '', club: '', grade: '', gender: '', birth_year: '', birth_date: '', grade_rank: '', checked_in: true,
};

/** "Last name; First name; Club; Grade" per line (also tab- or comma-separated). */
function parseBulk(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\t|;|,/).map((p) => p.trim());
    return { last_name: parts[0] ?? '', first_name: parts[1] ?? '', club: parts[2] ?? '', grade: parts[3] ?? '', checked_in: true };
  }).filter((p) => p.last_name);
}

function Registration() {
  const { tournamentId, tournament, categories, error: loadError, loading } = useTournament();
  const [selectedId, setSelectedId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [person, setPerson] = useState(EMPTY_PERSON);
  const [bulk, setBulk] = useState('');
  const [team, setTeam] = useState({ name: '', club: '', members: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const category = useMemo(() => categories.find((c) => c.id === selectedId), [categories, selectedId]);
  const isTeam = category?.kind === 'team';
  const locked = category && category.status !== 'registration';

  useEffect(() => {
    if (!selectedId && categories.length) setSelectedId(categories[0].id);
  }, [categories, selectedId]);

  useEffect(() => {
    if (category?.kind === 'team') {
      setTeam((t) => ({ ...t, members: Array.from({ length: (category.team_size ?? 3) + 2 }, (_, i) => t.members[i] ?? { last_name: '', first_name: '' }) }));
    }
  }, [category]);

  const reload = useCallback(async () => {
    if (!selectedId) return;
    try { setEntries(await listEntries(selectedId)); } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [selectedId]);

  useEffect(() => { setEntries([]); reload(); }, [reload]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { await fn(); await reload(); if (ok) setMsg({ type: 'success', text: ok }); }
    catch (e) { setMsg({ type: 'error', text: e.message.includes('duplicate') ? 'This entry already exists in this category.' : e.message }); }
    finally { setBusy(false); }
  };

  const addPerson = (e) => {
    e.preventDefault();
    if (!person.last_name.trim()) return;
    const reason = ineligibleReason(category, {
      gender: person.gender || null,
      birth_year: person.birth_year ? Number(person.birth_year) : null,
      birth_date: person.birth_date || null,
      grade_rank: person.grade_rank === '' ? null : Number(person.grade_rank),
    }, tournamentAgeCtx(tournament ?? {}));
    if (reason && !window.confirm(`${category.name} rules: ${reason}. Add anyway?`)) return;
    run(async () => {
      await addCompetitorEntry(tournamentId, selectedId, person);
      setPerson({ ...EMPTY_PERSON, club: person.club });
    });
  };

  const addBulk = () => {
    const people = parseBulk(bulk);
    if (!people.length) return;
    run(async () => {
      const failed = [];
      for (const p of people) {
        try { await addCompetitorEntry(tournamentId, selectedId, p); } catch { failed.push(p.last_name); }
      }
      setBulk('');
      if (failed.length) throw new Error(`Not added (already registered?): ${failed.join(', ')}`);
    }, `Added: ${people.length}`);
  };

  const addTeam = (e) => {
    e.preventDefault();
    if (!team.name.trim()) return;
    run(async () => {
      await addTeamEntry(tournamentId, selectedId, team);
      setTeam({ name: '', club: '', members: team.members.map(() => ({ last_name: '', first_name: '' })) });
    });
  };

  const checkAll = (value) => run(async () => {
    for (const en of entries.filter((x) => x.checked_in !== value)) await setCheckedIn(en.id, value);
  });

  const checkedCount = entries.filter((e) => e.checked_in).length;

  if (loading) return <div className="tp-page">Loading…</div>;
  if (loadError) return <div className="tp-page"><Message type="error">{loadError}</Message></div>;

  return (
    <div className="tp-page">
      <BackToDashboard />
      <h2>Registration</h2>
      <p className="tp-subtitle">{tournament?.name}</p>

      {categories.length === 0 ? (
        <Message type="info">This tournament has no categories. Add them in Edit tournament.</Message>
      ) : (
        <CategoryTabs
          categories={categories}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setMsg({ type: '', text: '' }); }}
          renderExtra={(c) => (c.status === 'cancelled' ? ' ✕' : '')}
        />
      )}

      <Message type={msg.type || 'info'}>{msg.text}</Message>

      {category && (
        <>
          {locked && (
            <Message type="info">
              {category.status === 'cancelled'
                ? 'This category is cancelled — registration is locked.'
                : 'The draw for this category has been made — registration is locked.'}
              {' '}<Link to={`/tournament/${tournamentId}/drawings`}>Open draw</Link>
            </Message>
          )}

          {!locked && !isTeam && (
            <div className="tp-card">
              <h3>Add competitor <span className="tp-muted">· {rulesText(category)}</span></h3>
              <form onSubmit={addPerson}>
                <div className="tp-grid">
                  <label className="tp-field">Last name<input value={person.last_name} onChange={(e) => setPerson({ ...person, last_name: e.target.value })} required /></label>
                  <label className="tp-field">First name<input value={person.first_name} onChange={(e) => setPerson({ ...person, first_name: e.target.value })} /></label>
                  <label className="tp-field">Club<input value={person.club} onChange={(e) => setPerson({ ...person, club: e.target.value })} /></label>
                  <label className="tp-field">
                    Gender
                    <select value={person.gender} onChange={(e) => setPerson({ ...person, gender: e.target.value })}>
                      <option value="">—</option><option value="M">Male</option><option value="F">Female</option>
                    </select>
                  </label>
                  {tournament?.age_basis === 'birth_date'
                    ? <label className="tp-field">Date of birth<input type="date" value={person.birth_date} onChange={(e) => setPerson({ ...person, birth_date: e.target.value })} /></label>
                    : <label className="tp-field">Birth year<input type="number" value={person.birth_year} onChange={(e) => setPerson({ ...person, birth_year: e.target.value })} /></label>}
                  <label className="tp-field">
                    Grade
                    <select value={person.grade_rank} onChange={(e) => setPerson({ ...person, grade_rank: e.target.value, grade: e.target.value === '' ? '' : gradeLabel(Number(e.target.value)) })}>
                      <option value="">—</option>
                      {GRADES.map((g) => <option key={g.rank} value={g.rank}>{g.label}</option>)}
                    </select>
                  </label>
                  <label className="tp-field tp-check">
                    <input type="checkbox" checked={person.checked_in} onChange={(e) => setPerson({ ...person, checked_in: e.target.checked })} />
                    Present (check-in)
                  </label>
                </div>
                <div className="tp-actions">
                  <button type="submit" className="tp-btn" disabled={busy}>Add</button>
                </div>
              </form>

              <details style={{ marginTop: '1rem' }}>
                <summary className="tp-muted">Bulk entry (paste a list)</summary>
                <label className="tp-field" style={{ marginTop: '0.75rem' }}>
                  One competitor per line: Last name; First name; Club; Grade
                  <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'RENDULIĆ; Ivan; KK Rijeka; 3 dan\nMERLAK; Lovro; KK Rijeka'} />
                </label>
                <div className="tp-actions">
                  <button type="button" className="tp-btn secondary" onClick={addBulk} disabled={busy || !bulk.trim()}>
                    Add {parseBulk(bulk).length || ''} competitors
                  </button>
                </div>
              </details>
            </div>
          )}

          {!locked && isTeam && (
            <div className="tp-card">
              <h3>Add team ({category.team_size} members + reserves)</h3>
              <form onSubmit={addTeam}>
                <div className="tp-grid">
                  <label className="tp-field">Team name<input value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} placeholder="e.g. RIJEKA 1" required /></label>
                  <label className="tp-field">Club<input value={team.club} onChange={(e) => setTeam({ ...team, club: e.target.value })} /></label>
                </div>
                <table className="tp-table" style={{ marginTop: '1rem' }}>
                  <thead><tr><th>#</th><th>Last name</th><th>First name</th></tr></thead>
                  <tbody>
                    {team.members.map((m, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <tr key={i}>
                        <td className="tp-muted">{i < category.team_size ? i + 1 : 'R'}</td>
                        <td><input value={m.last_name} onChange={(e) => setTeam({ ...team, members: team.members.map((x, j) => (j === i ? { ...x, last_name: e.target.value } : x)) })} /></td>
                        <td><input value={m.first_name} onChange={(e) => setTeam({ ...team, members: team.members.map((x, j) => (j === i ? { ...x, first_name: e.target.value } : x)) })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="tp-actions">
                  <button type="submit" className="tp-btn" disabled={busy}>Add team</button>
                </div>
              </form>
            </div>
          )}

          <div className="tp-card">
            <h3>
              Registered: {entries.length}
              {' '}<span className={`tp-badge ${checkedCount === entries.length && entries.length ? 'ok' : 'warn'}`}>present {checkedCount}</span>
            </h3>
            {entries.length === 0 ? (
              <p className="tp-muted">No entries in this category yet.</p>
            ) : (
              <>
                <table className="tp-table">
                  <thead>
                    <tr>
                      <th>#</th><th>{isTeam ? 'Team' : 'Competitor'}</th><th>Club</th>
                      {!isTeam && <th>Grade</th>}<th title="1 champion, 2 runner-up, 3 third place, 4 strong, 5 medium, 6 weaker">Strength</th><th>Check-in</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((en, i) => (
                      <tr key={en.id}>
                        <td className="tp-muted">{i + 1}</td>
                        <td>{entryName(en)}</td>
                        <td>{en.team?.club ?? en.competitor?.club ?? ''}</td>
                        {!isTeam && <td>{en.competitor?.grade ?? ''}</td>}
                        <td>
                          <select
                            value={en.tier ?? ''}
                            disabled={busy || locked}
                            onChange={(e) => run(() => setTier(en.id, e.target.value ? Number(e.target.value) : null))}
                          >
                            <option value="">—</option>
                            {Object.entries(TIER_LABELS).map(([n, label]) => <option key={n} value={n}>{n} · {label}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={en.checked_in}
                            disabled={busy || locked}
                            onChange={(e) => run(() => setCheckedIn(en.id, e.target.checked))}
                          />
                        </td>
                        <td>
                          {!locked && (
                            <button type="button" className="tp-btn danger small" disabled={busy}
                              onClick={() => { if (window.confirm(`Remove ${entryName(en)} from the category?`)) run(() => removeEntry(en.id)); }}>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!locked && (
                  <div className="tp-actions">
                    <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => checkAll(true)}>All present</button>
                    <button type="button" className="tp-btn secondary small" disabled={busy} onClick={() => checkAll(false)}>Clear check-in</button>
                    <Link className="tp-btn secondary" to={`/tournament/${tournamentId}/shiaijo`}>Shiaijo plan</Link>
                    <Link className="tp-btn" to={`/tournament/${tournamentId}/drawings`}>To the draw →</Link>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Registration;
