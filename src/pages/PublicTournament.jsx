import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Message, entryName } from '../components/TournamentShell';
import KoBracket from '../components/KoBracket';
import {
  getSavedDraw, getTournament, listCategories, listEntriesFor, listEventsFor, listTeams,
  listTournamentFights, publicRegister, publicRegisterTeam, tournamentOrganizers,
} from '../lib/api';
import { OrganizerLine } from '../components/TournamentList';
import { subscribeFights } from '../lib/runApi';
import { directKoQualifiers } from '../lib/tournament/draw.js';
import { matchRounds, roundShort, slotLabel } from '../lib/tournament/ko.js';
import { courtQueue, fightSeconds } from '../lib/tournament/run.js';
import { boutResult } from '../lib/tournament/scoring.js';
import { GRADES, ineligibleReason, rulesText } from '../lib/tournament/eligibility.js';
import './TournamentPages.css';

const fmtHm = (seconds) => {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
const clock = (startTime, seconds) => {
  if (!startTime) return `+${fmtHm(seconds)}`;
  const [h, m] = startTime.split(':').map(Number);
  const total = Math.round(h * 60 + m + seconds / 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const mins = (fmin) => {
  const f = Math.round(fmin / 60);
  return f <= 0 ? 'now' : `in about ${f} min`;
};

/**
 * Public page of a published tournament (no login): setup, categories and
 * entries (also while registration is open), registration form, draw,
 * schedule per shiaijo and live results. "Who am I" (no password, remembered
 * in this browser) shows that competitor's next fight.
 */
function PublicTournament() {
  const { tournamentId } = useParams();
  const [tournament, setTournament] = useState(null);
  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [teams, setTeams] = useState([]);
  const [draws, setDraws] = useState({});
  const [fights, setFights] = useState([]);
  const [events, setEvents] = useState([]);
  const [tab, setTab] = useState(null);
  const [error, setError] = useState('');
  const [organizer, setOrganizer] = useState(null);
  useEffect(() => { tournamentOrganizers([tournamentId]).then((o) => setOrganizer(o[tournamentId] ?? null)).catch(() => {}); }, [tournamentId]);
  const [me, setMe] = useState(() => { try { return localStorage.getItem(`sf-me-${tournamentId}`) || ''; } catch { return ''; } });

  const load = useCallback(async () => {
    try {
      const t = await getTournament(tournamentId);
      const cats = (await listCategories(tournamentId)).filter((c) => c.status !== 'cancelled');
      const ids = cats.map((c) => c.id);
      const drawnCats = cats.filter((c) => c.status !== 'registration');
      const [ens, tms, fs, ...ds] = await Promise.all([
        listEntriesFor(ids), listTeams(tournamentId), listTournamentFights(drawnCats.map((c) => c.id)),
        ...drawnCats.map((c) => getSavedDraw(c.id)),
      ]);
      const evs = await listEventsFor(fs.filter((f) => f.status !== 'scheduled').map((f) => f.id));
      setTournament(t); setCategories(cats); setEntries(ens); setTeams(tms); setFights(fs); setEvents(evs);
      setDraws(Object.fromEntries(drawnCats.map((c, i) => [c.id, ds[i]])));
    } catch (e) {
      setError('This tournament is not published, or it does not exist.');
    }
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => (tournament?.status === 'running' ? subscribeFights(`public-${tournamentId}`, load) : undefined), [tournament?.status, tournamentId, load]);

  const regOpen = tournament && tournament.registration_open
    && (!tournament.registration_deadline || new Date(tournament.registration_deadline) > new Date());
  const drawn = categories.filter((c) => c.status !== 'registration');
  const running = tournament?.status === 'running';
  useEffect(() => {
    if (tab || !tournament) return;
    setTab(running ? 'live' : regOpen ? 'register' : drawn.length ? 'schedule' : 'entries');
  }, [tournament, running, regOpen, drawn.length, tab]);

  const byCat = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const entryById = useMemo(() => Object.fromEntries(entries.map((e) => [e.id, e])), [entries]);
  const courts = Array.from({ length: tournament?.shiaijo_count ?? 2 }, (_, i) => i + 1);

  const name = (f, side) => {
    const id = side === 'red' ? f.red_entry_id : f.white_entry_id;
    if (id) return entryName(entryById[id]);
    const code = side === 'red' ? f.red_code : f.white_code;
    return code ? slotLabel(code, byCat[f.category_id]?.pool_size === 1) : '—';
  };
  const roundOf = (f) => (f.phase === 'pool' ? 'Pool' : f.phase === 'ipponshobu' ? 'Ipponshobu'
    : roundShort(matchRounds(byCat[f.category_id]?.ko_template ?? []).get(f.ko_no)));
  const secsOf = (f) => {
    const c = byCat[f.category_id];
    const t = c?.ko_template ?? [];
    return c ? fightSeconds(c, f.phase === 'ko' ? 'ko' : 'pool', f.ko_no === t[t.length - 1]?.no) : 180;
  };
  const score = (f) => {
    const r = boutResult({ events: events.filter((e) => e.match_id === f.id), decision: f.decision, fusen: f.fusen });
    return `${r.totals.red.ippons.join('') || '–'} : ${r.totals.white.ippons.join('') || '–'}`;
  };

  // courts with planned starts
  const schedule = useMemo(() => courts.map((n) => {
    let t = 0;
    return {
      court: n,
      list: courtQueue(fights, drawn, n).map((f) => { const start = t; t += secsOf(f); return { f, start }; }),
    };
  }), [fights, drawn, courts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // "who am I": competitors, and their entries (own + teams)
  const competitors = useMemo(() => {
    const map = new Map();
    for (const e of entries) if (e.competitor) map.set(e.competitor.id, e.competitor);
    for (const t of teams) for (const m of t.team_members ?? []) if (!map.has(m.competitor_id)) map.set(m.competitor_id, { id: m.competitor_id, ...m.competitor });
    return [...map.values()].sort((a, b) => a.last_name.localeCompare(b.last_name));
  }, [entries, teams]);
  const myEntries = useMemo(() => {
    if (!me) return new Set();
    const myTeams = new Set(teams.filter((t) => t.team_members?.some((m) => m.competitor_id === me)).map((t) => t.id));
    return new Set(entries.filter((e) => e.competitor?.id === me || (e.team && myTeams.has(e.team.id))).map((e) => e.id));
  }, [me, entries, teams]);
  const myFights = fights.filter((f) => myEntries.has(f.red_entry_id) || myEntries.has(f.white_entry_id));
  const next = (() => {
    for (const { court, list } of schedule) {
      for (const [i, { f, start }] of list.entries()) {
        if (!myFights.includes(f) || f.status === 'finished') continue;
        const ahead = list.slice(0, i).filter((x) => x.f.status !== 'finished').reduce((a, x) => a + secsOf(x.f), 0);
        return { f, court, start, ahead };
      }
    }
    return null;
  })();
  const chooseMe = (id) => { setMe(id); try { localStorage.setItem(`sf-me-${tournamentId}`, id); } catch { /* ignore */ } };

  if (error) return <div className="tp-page"><Message type="error">{error}</Message><Link to="/">Back to the tournaments</Link></div>;
  if (!tournament) return <div className="tp-page">Loading…</div>;

  const tabs = [
    ['info', 'Tournament'], ['entries', `Entries (${entries.length})`],
    ...(regOpen ? [['register', 'Register']] : []),
    ...(drawn.length ? [['draw', 'Draw'], ['schedule', 'Schedule']] : []),
    ...(running || fights.some((f) => f.status !== 'scheduled') ? [['live', 'Live']] : []),
  ];

  return (
    <div className="tp-page">
      <Link to="/" className="tp-muted">← All tournaments</Link>
      <h2>{tournament.name}</h2>
      <p className="tp-subtitle">
        {[tournament.start_date, tournament.venue, tournament.city, tournament.country].filter(Boolean).join(' · ')}
        {running && <> · <span className="tp-badge ok">live</span></>}
      </p>
      {organizer && <p className="tp-muted" style={{ marginTop: '-1rem' }}><OrganizerLine organizer={organizer} /></p>}

      {competitors.length > 0 && (
        <div className="tp-card">
          <label className="tp-field" style={{ maxWidth: 360 }}>
            Who are you? <span className="tp-muted">(optional — shows your next fight)</span>
            <select value={me} onChange={(e) => chooseMe(e.target.value)}>
              <option value="">— just watching —</option>
              {competitors.map((c) => <option key={c.id} value={c.id}>{c.last_name} {c.first_name}{c.club ? ` · ${c.club}` : ''}</option>)}
            </select>
          </label>
          {me && (next ? (
            <Message type="info">
              <strong>Your next fight: {next.f.label}</strong> · {byCat[next.f.category_id]?.name} · {roundOf(next.f)} ·{' '}
              <strong>Shiaijo {next.court}</strong><br />
              <span className="aka">{name(next.f, 'red')}</span> – <span className="shiro">{name(next.f, 'white')}</span><br />
              {next.f.status === 'running' ? 'Fighting now.'
                : running ? `Expected ${mins(next.ahead)} (${next.ahead ? Math.round(next.ahead / 60) : 0} min of fights before it).`
                  : `Planned at ${clock(tournament.start_time, next.start)}.`}
            </Message>
          ) : <p className="tp-muted">{drawn.length ? 'No more fights for you.' : 'Your fights appear here after the draw.'}</p>)}
        </div>
      )}

      <div className="tp-tabs">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" className={`tp-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="tp-card">
          <h3>Setup</h3>
          <p>
            {tournament.shiaijo_count} shiaijo{tournament.start_time ? ` · starts ${tournament.start_time.slice(0, 5)}` : ''}
            {' · '}registration {regOpen ? 'open' : 'closed'}
            {tournament.registration_deadline && ` (deadline ${new Date(tournament.registration_deadline).toLocaleString()})`}
          </p>
          <table className="tp-table">
            <thead><tr><th>Category</th><th>Who</th><th>Type</th><th>Format</th><th>Fight time</th><th>Entries</th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="tp-muted">{rulesText(c)}</td>
                  <td>{c.kind === 'team' ? `Team of ${c.team_size}` : 'Individual'}</td>
                  <td>{c.pool_size === 1 ? 'Direct KO' : `Pools of ${c.pool_size}, ${c.advancing ? `${c.advancing} advance` : 'pools only'}`}</td>
                  <td>{c.pool_fight_seconds / 60} / {c.ko_fight_seconds / 60} / {c.final_fight_seconds / 60} min</td>
                  <td>{entries.filter((e) => e.category_id === c.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tp-muted">Fight time: pool / KO / final.</p>
        </div>
      )}

      {tab === 'entries' && categories.map((c) => {
        const list = entries.filter((e) => e.category_id === c.id);
        return (
          <div className="tp-card" key={c.id}>
            <h3>{c.name} <span className="tp-muted">· {list.length}</span></h3>
            {list.length === 0 ? <p className="tp-muted">No entries yet.</p> : (
              <ol>
                {list.map((e) => {
                  const team = e.team && teams.find((t) => t.id === e.team.id);
                  return (
                    <li key={e.id}>
                      {entryName(e)} <span className="tp-muted">{e.team?.club ?? e.competitor?.club ?? ''}</span>
                      {team?.team_members?.length > 0 && (
                        <span className="tp-muted"> — {team.team_members.map((m) => `${m.competitor.last_name} ${m.competitor.first_name}`).join(', ')}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}

      {tab === 'register' && regOpen && (
        <RegisterForm tournament={tournament} categories={categories.filter((c) => c.status === 'registration')}
          teams={teams} competitors={competitors} onDone={load} />
      )}

      {tab === 'draw' && drawn.map((c) => {
        const d = draws[c.id];
        const pools = d?.pools.map((p) => [...p.pool_entries].sort((a, b) => a.position - b.position).map((pe) => pe.entry_id)) ?? [];
        return (
          <div className="tp-card" key={c.id}>
            <h3>{c.name}{c.ko_template_code && <span className="tp-muted"> · {c.ko_template_code}</span>}</h3>
            {c.pool_size !== 1 && (
              <div className="tp-pools">
                {pools.map((members, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div className="tp-pool" key={i}>
                    <h4>Pool {i + 1}</h4>
                    <ol>{members.map((id) => <li key={id}>{entryName(entryById[id])}</li>)}</ol>
                  </div>
                ))}
              </div>
            )}
            {c.ko_template && (
              <KoBracket
                template={c.ko_template}
                nameOf={(id) => entryName(entryById[id])}
                resolved={(() => {
                  const r = c.pool_size === 1 ? directKoQualifiers(pools) : {};
                  for (const f of fights.filter((x) => x.category_id === c.id && x.phase === 'ko')) {
                    if (f.red_entry_id) r[f.red_code] = f.red_entry_id;
                    if (f.white_entry_id) r[f.white_code] = f.white_entry_id;
                  }
                  return r;
                })()}
                directKo={c.pool_size === 1}
              />
            )}
          </div>
        );
      })}

      {tab === 'schedule' && schedule.map(({ court, list }) => (
        <div className="tp-card" key={court}>
          <h3>Shiaijo {court} <span className="tp-muted">· {list.length} fights</span></h3>
          {list.length === 0 ? <p className="tp-muted">No fights.</p> : (
            <table className="tp-table">
              <thead><tr><th>Time</th><th>Fight</th><th>Category</th><th>Round</th><th>Red</th><th>White</th></tr></thead>
              <tbody>
                {list.map(({ f, start }) => (
                  <tr key={f.id} className={myFights.includes(f) ? 'tp-end-block' : ''}>
                    <td className="tp-muted">{clock(tournament.start_time, start)}</td>
                    <td><strong>{f.label}</strong></td>
                    <td>{byCat[f.category_id]?.name}</td>
                    <td className="tp-muted">{roundOf(f)}</td>
                    <td className="aka">{name(f, 'red')}</td>
                    <td className="shiro">{name(f, 'white')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {tab === 'live' && (
        <div className="tp-pools">
          {schedule.map(({ court, list }) => {
            const now = list.find(({ f }) => f.status === 'running')?.f;
            const upcoming = list.filter(({ f }) => f.status === 'scheduled').slice(0, 3);
            const done = list.filter(({ f }) => f.status === 'finished').slice(-5).reverse();
            return (
              <div className="tp-pool" key={court}>
                <h4>Shiaijo {court}</h4>
                {now ? (
                  <p>
                    <span className="tp-badge ok">now</span> <strong>{now.label}</strong> {byCat[now.category_id]?.name}<br />
                    <span className="aka">{name(now, 'red')}</span> {score(now)} <span className="shiro">{name(now, 'white')}</span>
                  </p>
                ) : <p className="tp-muted">No fight right now.</p>}
                {upcoming.length > 0 && (
                  <>
                    <p className="tp-muted" style={{ margin: '0.4rem 0 0.2rem' }}>Next</p>
                    <ol>{upcoming.map(({ f }) => <li key={f.id}><strong>{f.label}</strong> {name(f, 'red')} – {name(f, 'white')}</li>)}</ol>
                  </>
                )}
                {done.length > 0 && (
                  <>
                    <p className="tp-muted" style={{ margin: '0.4rem 0 0.2rem' }}>Results</p>
                    <ul>
                      {done.map(({ f }) => (
                        <li key={f.id}>
                          <strong>{f.label}</strong>{' '}
                          <span className={f.winner_entry_id === f.red_entry_id ? 'aka' : ''}>{name(f, 'red')}</span> {score(f)}{' '}
                          <span className={f.winner_entry_id && f.winner_entry_id === f.white_entry_id ? 'shiro' : ''}>{name(f, 'white')}</span>
                          {!f.winner_entry_id && <span className="tp-muted"> (hikiwake)</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Registration form: the person first (gender, birth year, grade), then every
 * category the rules allow is ticked — untick what you don't want; forbidden
 * ones are greyed out with the reason. Team categories ask for the team.
 */
function RegisterForm({ tournament, categories, teams, competitors, onDone }) {
  const year = Number((tournament.start_date ?? new Date().toISOString()).slice(0, 4));
  const [p, setP] = useState({ last_name: '', first_name: '', club: '', gender: '', birth_year: '', grade_rank: '', email: '' });
  const [picked, setPicked] = useState(new Set());
  const [teamFor, setTeamFor] = useState({}); // categoryId -> { team_id, team_name }
  const [teamReg, setTeamReg] = useState({ category: '', name: '', club: '', members: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });

  const teamFirst = tournament.team_signup === 'team_first';
  const personCats = categories.filter((c) => c.kind === 'individual' || !teamFirst);
  const teamCats = categories.filter((c) => c.kind === 'team' && teamFirst);
  const person = { gender: p.gender || null, birth_year: p.birth_year ? Number(p.birth_year) : null, grade_rank: p.grade_rank === '' ? null : Number(p.grade_rank) };
  const checks = personCats.map((c) => ({ c, reason: ineligibleReason(c, person, year) }));
  const allowedKey = checks.filter((x) => !x.reason).map((x) => x.c.id).join(',');

  // every allowed category is ticked when the person's data changes
  useEffect(() => { setPicked(new Set(allowedKey ? allowedKey.split(',') : [])); }, [allowedKey]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ type: '', text: '' });
    const done = [];
    const failed = [];
    for (const c of personCats.filter((x) => picked.has(x.id))) {
      try {
        await publicRegister(c.id, { ...p, ...(c.kind === 'team' ? teamFor[c.id] ?? {} : {}) });
        done.push(c.name);
      } catch (err) { failed.push(`${c.name}: ${err.message}`); }
    }
    setBusy(false);
    if (done.length) {
      setMsg({ type: failed.length ? 'error' : 'success', text: `${p.last_name.toUpperCase()} ${p.first_name} registered for ${done.join(', ')}.${failed.length ? ` Not registered — ${failed.join('; ')}` : ''}` });
      setP({ ...p, last_name: '', first_name: '', birth_year: '', grade_rank: '', email: '' });
      await onDone();
    } else {
      setMsg({ type: 'error', text: failed.length ? failed.join('; ') : 'Tick at least one category.' });
    }
  };

  const submitTeam = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      await publicRegisterTeam(teamReg.category, teamReg);
      setMsg({ type: 'success', text: `Team ${teamReg.name.toUpperCase()} is registered.` });
      setTeamReg({ ...teamReg, name: '', club: '', members: [] });
      await onDone();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  };

  if (!categories.length) return <div className="tp-card"><p className="tp-muted">No category is open for registration.</p></div>;

  return (
    <>
      <Message type={msg.type || 'info'}>{msg.text}</Message>
      {personCats.length > 0 && (
        <form className="tp-card" onSubmit={submit}>
          <h3>Register a competitor</h3>
          <div className="tp-grid">
            <label className="tp-field">Last name<input value={p.last_name} onChange={set('last_name')} required /></label>
            <label className="tp-field">First name<input value={p.first_name} onChange={set('first_name')} /></label>
            <label className="tp-field">Club<input value={p.club} onChange={set('club')} /></label>
            <label className="tp-field">
              Gender
              <select value={p.gender} onChange={set('gender')}>
                <option value="">—</option><option value="M">Male</option><option value="F">Female</option>
              </select>
            </label>
            <label className="tp-field">Birth year<input type="number" min="1920" max={year} value={p.birth_year} onChange={set('birth_year')} placeholder="e.g. 2008" /></label>
            <label className="tp-field">
              Grade
              <select value={p.grade_rank} onChange={set('grade_rank')}>
                <option value="">—</option>
                {GRADES.map((g) => <option key={g.rank} value={g.rank}>{g.label}</option>)}
              </select>
            </label>
            <label className="tp-field">Email <span className="tp-muted">(optional, for changes)</span><input type="email" value={p.email} onChange={set('email')} /></label>
          </div>

          <h3 style={{ marginTop: '1rem' }}>Categories</h3>
          <p className="tp-muted" style={{ marginTop: 0 }}>Every category you may enter is ticked — untick what you don't want.</p>
          <table className="tp-table">
            <tbody>
              {checks.map(({ c, reason }) => (
                <tr key={c.id} style={reason ? { opacity: 0.5 } : undefined}>
                  <td style={{ width: '2rem' }}>
                    <input type="checkbox" disabled={!!reason} checked={!reason && picked.has(c.id)}
                      onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(c.id); else n.delete(c.id); setPicked(n); }} />
                  </td>
                  <td>
                    <strong>{c.name}</strong>{c.kind === 'team' ? ' (team)' : ''}
                    <div className="tp-muted">{rulesText(c)}{reason ? ` — not for you: ${reason}` : ''}</div>
                    {c.kind === 'team' && !reason && picked.has(c.id) && (
                      <div className="tp-grid" style={{ marginTop: '0.4rem' }}>
                        <select value={teamFor[c.id]?.team_id ?? ''} onChange={(e) => setTeamFor({ ...teamFor, [c.id]: { team_id: e.target.value, team_name: '' } })}>
                          <option value="">— new team —</option>
                          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.club ? ` · ${t.club}` : ''}</option>)}
                        </select>
                        {!teamFor[c.id]?.team_id && (
                          <input placeholder="New team name, e.g. RIJEKA 1" value={teamFor[c.id]?.team_name ?? ''}
                            onChange={(e) => setTeamFor({ ...teamFor, [c.id]: { team_id: '', team_name: e.target.value } })} />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tp-actions">
            <button type="submit" className="tp-btn" disabled={busy || picked.size === 0}>{busy ? 'Registering…' : `Register for ${picked.size} categor${picked.size === 1 ? 'y' : 'ies'}`}</button>
          </div>
          <p className="tp-muted">Registrations appear in the entry list straight away; the organizer can change or remove them.</p>
        </form>
      )}

      {teamCats.length > 0 && (
        <form className="tp-card" onSubmit={submitTeam}>
          <h3>Register a team</h3>
          <div className="tp-grid">
            <label className="tp-field">
              Category
              <select value={teamReg.category} onChange={(e) => setTeamReg({ ...teamReg, category: e.target.value })} required>
                <option value="">—</option>
                {teamCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="tp-field">Team name<input value={teamReg.name} onChange={(e) => setTeamReg({ ...teamReg, name: e.target.value })} required /></label>
            <label className="tp-field">Club<input value={teamReg.club} onChange={(e) => setTeamReg({ ...teamReg, club: e.target.value })} /></label>
          </div>
          <p className="tp-muted">Members (registered competitors, in fighting order):</p>
          <div className="tp-grid">
            {competitors.map((c) => (
              <label key={c.id} className="tp-field tp-check">
                <input type="checkbox" checked={teamReg.members.includes(c.id)}
                  onChange={(e) => setTeamReg({ ...teamReg, members: e.target.checked ? [...teamReg.members, c.id] : teamReg.members.filter((x) => x !== c.id) })} />
                {c.last_name} {c.first_name}{c.club ? ` · ${c.club}` : ''}
              </label>
            ))}
          </div>
          <div className="tp-actions">
            <button type="submit" className="tp-btn" disabled={busy}>{busy ? 'Registering…' : 'Register team'}</button>
          </div>
        </form>
      )}
    </>
  );
}

export default PublicTournament;
