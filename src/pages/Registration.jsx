import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BackToDashboard, CategoryTabs, Message, entryName, useTournament,
} from '../components/TournamentShell';
import {
  addCompetitorEntry, addExistingEntry, listCompetitors, listContacts, listEntries, removeEntry, setCheckedIn, setTier,
} from '../lib/api';
import { TIER_LABELS } from '../lib/tournament/placement.js';
import { consentLetters } from '../lib/tournament/signup.js';
import { GRADES, entriesOutsideRules, gradeLabel, ineligibleReason, tournamentAgeCtx, rulesText } from '../lib/tournament/eligibility.js';
import './TournamentPages.css';
import { DateInput } from '../components/EuInputs';
import StartTournament from '../components/StartTournament';
import { parseBulk } from '../lib/tournament/bulk.js';
import CompetitorPicker, { personName } from '../components/CompetitorPicker';
import TeamEditor from '../components/TeamEditor';

const EMPTY_PERSON = {
  last_name: '', first_name: '', club: '', grade: '', gender: '', birth_year: '', birth_date: '', grade_rank: '', checked_in: true,
};

function Registration() {
  const { tournamentId, tournament, categories, reload: reloadTournament, error: loadError, loading } = useTournament();
  const [selectedId, setSelectedId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [contacts, setContacts] = useState(new Map());
  // entries that no longer meet the category's rules (warning only, never removed)
  const outsideById = useMemo(() => {
    const c = categories.find((x) => x.id === selectedId);
    if (!c) return new Map();
    const withDates = entries.map((e) => (e.competitor
      ? { ...e, competitor: { ...e.competitor, birth_date: contacts.get(e.competitor.id)?.birth_date ?? null } } : e));
    return new Map(entriesOutsideRules(c, withDates, tournamentAgeCtx(tournament ?? {})).map((x) => [x.entry.id, x.reason]));
  }, [categories, selectedId, entries, contacts, tournament]);
  const [person, setPerson] = useState(EMPTY_PERSON);
  const [bulk, setBulk] = useState('');
  const [competitors, setCompetitors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const category = useMemo(() => categories.find((c) => c.id === selectedId), [categories, selectedId]);
  const isTeam = category?.kind === 'team';
  // after the draw: presence (check-in on the day) and walk-ins still change here, the rest is fixed
  // (withdraw / replace in Drawings → Adjust the draw); a cancelled category is fully locked
  const cancelled = category?.status === 'cancelled';
  const locked = category && category.status !== 'registration';
  const canAdd = category && !cancelled;

  useEffect(() => {
    if (!selectedId && categories.length) setSelectedId(categories[0].id);
  }, [categories, selectedId]);

  const reload = useCallback(async () => {
    if (!selectedId) return;
    try {
      const [ens, comps] = await Promise.all([listEntries(selectedId), listCompetitors(tournamentId)]);
      setEntries(ens);
      setCompetitors(comps);
      // private contacts and consents (organizers only; empty for others)
      listContacts(comps.map((c) => c.id)).then(setContacts).catch(() => setContacts(new Map()));
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }, [selectedId, tournamentId]);

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

  // an already registered competitor (e.g. from another category) into this one; rules only warn
  const addExisting = (c) => {
    const reason = ineligibleReason(category, { ...c, birth_date: contacts.get(c.id)?.birth_date ?? null }, tournamentAgeCtx(tournament ?? {}));
    if (reason && !window.confirm(`${category.name} rules: ${personName(c)} — ${reason}. Add anyway?`)) return;
    run(() => addExistingEntry(selectedId, c.id), `${personName(c)} added to ${category.name}.`);
  };
  const inCategory = useMemo(() => new Set(entries.map((e) => e.competitor?.id).filter(Boolean)), [entries]);

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
              {cancelled
                ? 'This category is cancelled — registration is locked.'
                : 'The draw for this category has been made. Tick who is present below; a walk-in added here is not in the draw yet — put them in place of a no-show or into a short pool in Drawings → Adjust the draw.'}
              {' '}<Link to={`/tournament/${tournamentId}/drawings`}>Open draw</Link>
            </Message>
          )}

          {canAdd && !isTeam && competitors.some((c) => !inCategory.has(c.id)) && (
            <div className="tp-card">
              <h3>Add a registered competitor <span className="tp-muted">· from other categories</span></h3>
              <p className="tp-muted" style={{ marginTop: 0 }}>Already registered in this tournament — one click puts them in {category.name} too. Rules only warn: you may add someone who does not fit (e.g. a junior fighting up).</p>
              <CompetitorPicker competitors={competitors} exclude={inCategory} disabled={busy} onPick={addExisting} />
            </div>
          )}

          {canAdd && !isTeam && (
            <div className="tp-card">
              <h3>{locked ? 'Add a walk-in' : 'Add competitor'} <span className="tp-muted">· {rulesText(category)}</span></h3>
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
                    ? <label className="tp-field">Date of birth<DateInput value={person.birth_date || null} onChange={(v) => setPerson({ ...person, birth_date: v ?? '' })} /></label>
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
                  One competitor per line: Last name; First name; Club; Gender (M / F); {tournament?.age_basis === 'birth_date' ? 'Date of birth (DD.MM.YYYY)' : 'Year of birth'}; Grade
                  <textarea value={bulk} onChange={(e) => setBulk(e.target.value)}
                    placeholder={tournament?.age_basis === 'birth_date'
                      ? 'RENDULIĆ; Ivan; KK Rijeka; M; 14.03.2009; 1 kyu\nMERLAK; Lovro; KK Rijeka; M; 02.11.2010; mudan'
                      : 'RENDULIĆ; Ivan; KK Rijeka; M; 2009; 1 kyu\nMERLAK; Lovro; KK Rijeka; M; 2010; mudan'} />
                </label>
                <p className="tp-muted" style={{ marginTop: 0 }}>Separated by ; or tab (a copy from Excel works). This category needs: {rulesText(category)}. Empty fields are allowed — entries that don't fit get a warning.</p>
                <div className="tp-actions">
                  <button type="button" className="tp-btn secondary" onClick={addBulk} disabled={busy || !bulk.trim()}>
                    Add {parseBulk(bulk).length || ''} competitors
                  </button>
                </div>
              </details>
            </div>
          )}

          {isTeam && (
            <TeamEditor tournamentId={tournamentId} category={category} competitors={competitors} contacts={contacts}
              ctx={tournamentAgeCtx(tournament ?? {})} onChanged={reload} />
          )}

          <div id="g-checkin" className="tp-card">
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
                      {!isTeam && <th>Grade</th>}{!isTeam && contacts.size > 0 && <th title="Email · dojo email · consents (D data, N news media, S social media, P photos; · = no)">Contact</th>}<th title="1 champion, 2 runner-up, 3 third place, 4 strong, 5 medium, 6 weaker">Strength</th><th>Check-in</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((en, i) => (
                      <tr key={en.id}>
                        <td className="tp-muted">{i + 1}</td>
                        <td>
                          {entryName(en)}
                          {outsideById.has(en.id) && (
                            <span className="tp-badge warn" title="Registered before the rules changed, or added by an organizer">⚠ {outsideById.get(en.id)}</span>
                          )}
                        </td>
                        <td>{en.team?.club ?? en.competitor?.club ?? ''}</td>
                        {!isTeam && <td>{en.competitor?.grade ?? ''}</td>}
                        {!isTeam && contacts.size > 0 && (() => {
                          const ct = contacts.get(en.competitor?.id);
                          return (
                            <td className="tp-muted" style={{ fontSize: '0.85em' }}>
                              {ct?.email && <div>{ct.email}</div>}
                              {ct?.dojo_email && <div>dojo: {ct.dojo_email}</div>}
                              {ct?.consents && <div title="D data · N news media · S social media · P photos">{consentLetters(ct.consents)}</div>}
                            </td>
                          );
                        })()}
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
                            disabled={busy || cancelled}
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
                {!cancelled && (
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

      {categories.length > 0 && <StartTournament tournament={tournament} categories={categories} onStarted={reloadTournament} />}
    </div>
  );
}

export default Registration;
