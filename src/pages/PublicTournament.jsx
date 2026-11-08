import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Message, entryName } from '../components/TournamentShell';
import KoBracket from '../components/KoBracket';
import {
  getSavedDraw, getTournament, listCategories, listEntriesFor, listEventsFor, listTeams,
  listTournamentFights, publicRegister, publicRegisterTeam, resolveTournament, tournamentOrganizers,
} from '../lib/api';
import { OrganizerLine, fmtDate } from '../components/TournamentList';
import { clockAt, courtSchedule, isUuid, tournamentDays } from '../lib/tournament/days.js';
import { askedConsents, signupProblems, signupSettings } from '../lib/tournament/signup.js';
import { subscribeFights } from '../lib/runApi';
import { directKoQualifiers } from '../lib/tournament/draw.js';
import { slotLabel, thirdPlaceFight } from '../lib/tournament/ko.js';
import { courtQueue, fightSeconds, koRound, koRoundLabel } from '../lib/tournament/run.js';
import { boutResult, scoringOptions } from '../lib/tournament/scoring.js';
import { GRADES, ineligibleReason, rulesText, teamPositions, teamProblems, teamReserves, teamMaxMembers, tournamentAgeCtx } from '../lib/tournament/eligibility.js';
import './TournamentPages.css';

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
/**
 * /t/<id> or /t/<link name>: a link name opens the newest published edition;
 * when the link has several editions a menu switches between the years.
 */
export function PublicTournamentRoute() {
  const { tournamentId: key } = useParams();
  const [found, setFound] = useState(null);
  useEffect(() => {
    setFound(null);
    resolveTournament(key, isUuid(key)).then(setFound).catch(() => setFound({ id: null, editions: [] }));
  }, [key]);
  if (!found) return <div className="tp-page">Loading…</div>;
  if (!found.id) {
    return <div className="tp-page"><Message type="error">No published tournament with this link.</Message><Link to="/">Back to the tournaments</Link></div>;
  }
  return <PublicTournament key={found.id} tournamentId={found.id} editions={found.editions} slug={found.slug} />;
}

function PublicTournament({ tournamentId, editions = [], slug = null }) {
  const navigate = useNavigate();
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
    : koRoundLabel(byCat[f.category_id], f.ko_no));
  const secsOf = (f) => {
    const c = byCat[f.category_id];
    return c ? fightSeconds(c, f.phase === 'ko' ? 'ko' : 'pool', koRound(c, f.ko_no)) : 180;
  };
  const score = (f) => {
    const r = boutResult({ events: events.filter((e) => e.match_id === f.id), decision: f.decision, fusen: f.fusen }, scoringOptions(byCat[f.category_id]));
    return `${r.totals.red.ippons.join('') || '–'} : ${r.totals.white.ippons.join('') || '–'}`;
  };

  // courts with planned starts (per day: the clock starts at each day's start)
  const days = tournamentDays(tournament);
  const dayStart = (n) => days[n - 1]?.start ?? null;
  const dayOfFight = (f) => byCat[f.category_id]?.day ?? 1;
  const schedule = useMemo(() => {
    const queues = new Map(courts.map((n) => [n, courtQueue(fights, drawn, n)]));
    return courtSchedule(queues, (f) => byCat[f.category_id]?.day ?? 1, secsOf)
      .map(({ court, days: ds }) => ({ court, days: ds, list: ds.flatMap((d) => d.list) }));
  }, [fights, drawn, courts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const clockOf = (f, start) => clockAt(dayStart(dayOfFight(f)), start);

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
      <div className="pt-title">
        {tournament.logo_url && <img className="pt-logo" src={tournament.logo_url} alt="" />}
        <h2>{tournament.name}</h2>
      </div>
      {editions.length > 1 && (
        <label className="tp-field" style={{ maxWidth: 280, marginBottom: '0.75rem' }}>
          Edition
          <select value={tournamentId} onChange={(e) => navigate(e.target.value === editions[0].id && slug ? `/t/${slug}` : `/t/${e.target.value}`)}>
            {editions.map((ed, i) => (
              <option key={ed.id} value={ed.id}>{ed.start_date ? ed.start_date.slice(0, 4) : ed.name}{i === 0 ? ' (current)' : ''}</option>
            ))}
          </select>
        </label>
      )}
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
                  : `Planned at ${clockOf(next.f, next.start)}${days.length > 1 ? ` on day ${dayOfFight(next.f)}` : ''}.`}
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
            {tournament.shiaijo_count} shiaijo
            {days.length > 1
              ? ` · ${days.map((d) => `day ${d.n}${d.start ? ` ${d.start}${d.end ? `–${d.end}` : ''}` : ''}`).join(', ')}`
              : dayStart(1) ? ` · starts ${dayStart(1)}${days[0].end ? `, ends ${days[0].end}` : ''}` : ''}
            {' · '}registration {regOpen ? 'open' : 'closed'}
            {tournament.registration_deadline && ` (deadline ${new Date(tournament.registration_deadline).toLocaleString()})`}
          </p>
          <table className="tp-table">
            <thead><tr><th>Category</th>{days.length > 1 && <th>Day</th>}<th>Who</th><th>Type</th><th>Format</th><th>Fight time</th><th>Entries</th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  {days.length > 1 && <td>Day {c.day ?? 1}</td>}
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
                thirdPlace={c.third_place === 'fight' ? thirdPlaceFight(c.ko_template) : null}
              />
            )}
          </div>
        );
      })}

      {tab === 'schedule' && schedule.map(({ court, days: courtDays, list: allFights }) => (
        <div className="tp-card" key={court}>
          <h3>Shiaijo {court} <span className="tp-muted">· {allFights.length} fights</span></h3>
          {allFights.length === 0 && <p className="tp-muted">No fights.</p>}
          {courtDays.map(({ day, list }) => (
            <div key={day}>
            {days.length > 1 && <h4>Day {day}{days[day - 1]?.date ? ` · ${fmtDate(days[day - 1].date)}` : ''}</h4>}
            <table className="tp-table">
              <thead><tr><th>Time</th><th>Fight</th><th>Category</th><th>Round</th><th>Red</th><th>White</th></tr></thead>
              <tbody>
                {list.map(({ f, start }) => (
                  <tr key={f.id} className={myFights.includes(f) ? 'tp-end-block' : ''}>
                    <td className="tp-muted">{clockOf(f, start)}</td>
                    <td><strong>{f.label}</strong></td>
                    <td>{byCat[f.category_id]?.name}</td>
                    <td className="tp-muted">{roundOf(f)}</td>
                    <td className="aka">{name(f, 'red')}</td>
                    <td className="shiro">{name(f, 'white')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ))}
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

const EMPTY_PERSON = {
  last_name: '', first_name: '', club: '', gender: '', birth_year: '', birth_date: '', grade_rank: '',
  email: '', dojo_email: '', consents: {}, picked: null, teamFor: {},
};

/** Rules data of a person form (what eligibility needs). */
const rulesPerson = (p, byDate) => ({
  gender: p.gender || null,
  birth_year: byDate ? null : (p.birth_year ? Number(p.birth_year) : null),
  birth_date: byDate ? (p.birth_date || null) : null,
  grade_rank: p.grade_rank === '' ? null : Number(p.grade_rank),
});

/**
 * One person on the registration form: data, the fields and consents the
 * organizer asks for, then every category the rules allow is ticked — untick
 * what you don't want; forbidden ones are greyed out with the reason.
 */
function PersonBlock({ p, onChange, onRemove, index, tournament, personCats, teams, settings }) {
  const year = Number((tournament.start_date ?? new Date().toISOString()).slice(0, 4));
  const ctx = tournamentAgeCtx(tournament);
  const byDate = ctx.basis === 'birth_date';
  const single = !!tournament.single_category;
  const set = (k) => (e) => onChange({ ...p, [k]: e.target.value });
  const checks = personCats.map((c) => ({ c, reason: ineligibleReason(c, rulesPerson(p, byDate), ctx) }));
  const allowedKey = checks.filter((x) => !x.reason).map((x) => x.c.id).join(',');
  const picked = new Set(p.picked ?? []);

  // every allowed category is ticked when the person's data changes; with
  // "only one individual category" just the first allowed individual one
  useEffect(() => {
    const ids = allowedKey ? allowedKey.split(',') : [];
    const isInd = (id) => personCats.find((c) => c.id === id)?.kind === 'individual';
    const firstInd = ids.find(isInd);
    onChange({ ...p, picked: single ? ids.filter((id) => !isInd(id) || id === firstInd) : ids });
  }, [allowedKey, single]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePick = (c, checked) => {
    const n = new Set(picked);
    if (checked && single && c.kind === 'individual') for (const x of personCats) if (x.kind === 'individual') n.delete(x.id);
    if (checked) n.add(c.id); else n.delete(c.id);
    onChange({ ...p, picked: [...n] });
  };
  const setTeam = (cid, v) => onChange({ ...p, teamFor: { ...p.teamFor, [cid]: v } });
  const consents = askedConsents(settings);

  return (
    <div className="pt-person">
      <div className="pt-person-head">
        <h3>{index > 0 ? `Person ${index + 1}` : 'Competitor'}</h3>
        {onRemove && <button type="button" className="tp-btn secondary small" onClick={onRemove}>Remove</button>}
      </div>
      <div className="tp-grid">
        <label className="tp-field">Last name<input value={p.last_name} onChange={set('last_name')} required /></label>
        <label className="tp-field">First name<input value={p.first_name} onChange={set('first_name')} /></label>
        <label className="tp-field">Club / dojo<input value={p.club} onChange={set('club')} /></label>
        <label className="tp-field">
          Gender
          <select value={p.gender} onChange={set('gender')}>
            <option value="">—</option><option value="M">Male</option><option value="F">Female</option>
          </select>
        </label>
        {byDate
          ? <label className="tp-field">Date of birth <span className="tp-muted">(seen by the organizers only)</span><input type="date" value={p.birth_date} onChange={set('birth_date')} /></label>
          : <label className="tp-field">Birth year<input type="number" min="1920" max={year} value={p.birth_year} onChange={set('birth_year')} placeholder="e.g. 2008" /></label>}
        <label className="tp-field">
          Grade
          <select value={p.grade_rank} onChange={set('grade_rank')}>
            <option value="">—</option>
            {GRADES.map((g) => <option key={g.rank} value={g.rank}>{g.label}</option>)}
          </select>
        </label>
        {settings.email !== 'off' && (
          <label className="tp-field">
            Email <span className="tp-muted">({settings.email === 'required' ? 'required' : 'optional'}, organizers only)</span>
            <input type="email" value={p.email} onChange={set('email')} required={settings.email === 'required'} />
          </label>
        )}
        {settings.dojo_email !== 'off' && (
          <label className="tp-field">
            Dojo email <span className="tp-muted">({settings.dojo_email === 'required' ? 'required' : 'optional'})</span>
            <input type="email" value={p.dojo_email} onChange={set('dojo_email')} required={settings.dojo_email === 'required'} />
          </label>
        )}
      </div>
      {consents.length > 0 && (
        <div className="pt-consents">
          <span className="tp-muted">I agree to:</span>
          {consents.map((c) => (
            <label key={c.key} className="tp-check">
              <input type="checkbox" checked={!!p.consents?.[c.key]}
                onChange={(e) => onChange({ ...p, consents: { ...p.consents, [c.key]: e.target.checked } })} />
              {c.label}{settings.consents[c.key] === 'required' ? ' *' : ''}
            </label>
          ))}
        </div>
      )}

      <h4>Categories</h4>
      <p className="tp-muted" style={{ marginTop: 0 }}>
        Every category you may enter is ticked — untick what you don't want.
        {single && ' In this tournament a competitor enters only one individual category.'}
      </p>
      <table className="tp-table">
        <tbody>
          {checks.map(({ c, reason }) => (
            <tr key={c.id} style={reason ? { opacity: 0.5 } : undefined}>
              <td style={{ width: '2rem' }}>
                <input type="checkbox" disabled={!!reason} checked={!reason && picked.has(c.id)} onChange={(e) => togglePick(c, e.target.checked)} />
              </td>
              <td>
                <strong>{c.name}</strong>{c.kind === 'team' ? ' (team)' : ''}
                <div className="tp-muted">
                  {rulesText(c)}
                  {c.kind === 'team' && ` · team of ${c.team_size} + ${teamReserves(c.team_size)}${c.team_same_dojo ? ' · one dojo' : ''}${c.position_rules ? ' · limits per position' : ''}`}
                  {reason ? ` — not for you: ${reason}` : ''}
                </div>
                {c.kind === 'team' && !reason && picked.has(c.id) && (
                  <div className="tp-grid" style={{ marginTop: '0.4rem' }}>
                    <select value={p.teamFor[c.id]?.team_id ?? ''} onChange={(e) => setTeam(c.id, { team_id: e.target.value, team_name: '' })}>
                      <option value="">— new team —</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.club ? ` · ${t.club}` : ''}</option>)}
                    </select>
                    {!p.teamFor[c.id]?.team_id && (
                      <input placeholder="New team name, e.g. RIJEKA 1" value={p.teamFor[c.id]?.team_name ?? ''}
                        onChange={(e) => setTeam(c.id, { team_id: '', team_name: e.target.value })} />
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Registration form: one person, or several with "Add another" when the
 * organizer allows it (club, dojo email and consents carry over to the next
 * person). Team-first tournaments also get the team form.
 */
function RegisterForm({ tournament, categories, teams, competitors, onDone }) {
  const year = Number((tournament.start_date ?? new Date().toISOString()).slice(0, 4));
  const ctx = tournamentAgeCtx(tournament);
  const byDate = ctx.basis === 'birth_date';
  const settings = signupSettings(tournament);
  const [people, setPeople] = useState([{ ...EMPTY_PERSON, _key: 1 }]);
  const [teamReg, setTeamReg] = useState({ category: '', name: '', club: '', members: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const teamFirst = tournament.team_signup === 'team_first';
  const personCats = categories.filter((c) => c.kind === 'individual' || !teamFirst);
  const teamCats = categories.filter((c) => c.kind === 'team' && teamFirst);

  const update = (key, next) => setPeople((cur) => cur.map((x) => (x._key === key ? { ...next, _key: key } : x)));
  const addAnother = () => setPeople((cur) => {
    const last = cur[cur.length - 1];
    return [...cur, { ...EMPTY_PERSON, club: last.club, dojo_email: last.dojo_email, consents: { ...last.consents }, _key: Math.max(...cur.map((x) => x._key)) + 1 }];
  });
  const pickedCount = people.reduce((n, x) => n + (x.picked?.length ?? 0), 0);

  // team registration (team first): members in fighting order, checked like the server does
  const teamCat = teamCats.find((c) => c.id === teamReg.category);
  const teamMembers = teamReg.members.map((id) => competitors.find((c) => c.id === id)).filter(Boolean);
  const teamCheck = teamCat ? teamProblems(teamCat, { club: teamReg.club }, teamMembers, byDate ? year : ctx) : [];

  const submit = async (e) => {
    e.preventDefault();
    const missing = people.map((x, i) => [i, signupProblems(settings, x)]).filter(([, pr]) => pr.length);
    if (missing.length) {
      setMsg({ type: 'error', text: missing.map(([i, pr]) => `${people.length > 1 ? `Person ${i + 1}: ` : ''}missing ${pr.join(', ')}`).join(' · ') });
      return;
    }
    setBusy(true); setMsg({ type: '', text: '' });
    const lines = [];
    const kept = [];
    for (const x of people) {
      const done = [];
      const failed = [];
      for (const c of personCats.filter((cat) => (x.picked ?? []).includes(cat.id))) {
        try {
          await publicRegister(c.id, { ...x, ...rulesPerson(x, byDate), ...(c.kind === 'team' ? x.teamFor[c.id] ?? {} : {}) });
          done.push(c.name);
        } catch (err) { failed.push(`${c.name}: ${err.message}`); }
      }
      const who = `${x.last_name.toUpperCase()} ${x.first_name}`.trim();
      if (done.length) lines.push(`${who}: ${done.join(', ')}`);
      if (failed.length || !done.length) {
        lines.push(`${who} — not registered: ${failed.length ? failed.join('; ') : 'no category ticked'}`);
        kept.push(x);
      }
    }
    setBusy(false);
    const ok = lines.length && !kept.length;
    setMsg({ type: ok ? 'success' : 'error', text: `${ok ? 'Registered — ' : ''}${lines.join(' · ')}` });
    const last = people[people.length - 1];
    setPeople(kept.length ? kept : [{ ...EMPTY_PERSON, club: last.club, dojo_email: last.dojo_email, consents: { ...last.consents }, _key: Date.now() }]);
    await onDone();
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
          {people.map((x, i) => (
            <PersonBlock key={x._key} p={x} index={i} onChange={(next) => update(x._key, next)}
              onRemove={people.length > 1 ? () => setPeople((cur) => cur.filter((y) => y._key !== x._key)) : null}
              tournament={tournament} personCats={personCats} teams={teams} settings={settings} />
          ))}
          <div className="tp-actions">
            {settings.add_another && <button type="button" className="tp-btn secondary" onClick={addAnother}>+ Add another person</button>}
            <button type="submit" className="tp-btn" disabled={busy || pickedCount === 0}>
              {busy ? 'Registering…' : people.length > 1 ? `Register ${people.length} people` : `Register for ${pickedCount} categor${pickedCount === 1 ? 'y' : 'ies'}`}
            </button>
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
            <label className="tp-field">Club<input value={teamReg.club} required={!!teamCat?.team_same_dojo} onChange={(e) => setTeamReg({ ...teamReg, club: e.target.value })} /></label>
          </div>
          {teamCat && (
            <p className="tp-muted">
              {rulesText(teamCat)} · {teamCat.team_size} + {teamReserves(teamCat.team_size)} reserve{teamReserves(teamCat.team_size) > 1 ? 's' : ''}
              {teamCat.team_same_dojo && ' · all members from the team\'s dojo'}
              {teamCat.position_rules
                ? ' · limits per position: ' + teamPositions(teamCat.team_size).map((n, i) => `${n} ${rulesText(teamCat.position_rules[i] ?? {})}`).join(', ')
                : ' · the fighting order is handed in at the tournament'}
            </p>
          )}
          <p className="tp-muted">Members (registered competitors) — tick them in fighting order, reserves last:</p>
          {teamCat && teamMembers.length > 0 && (
            <ol className="tp-muted">
              {teamMembers.map((m, i) => (
                <li key={m.id}>{i < teamCat.team_size ? teamPositions(teamCat.team_size)[i] : 'Reserve'}: {m.last_name} {m.first_name}</li>
              ))}
            </ol>
          )}
          {teamCheck.length > 0 && <Message type="error">{teamCheck.join(' · ')}</Message>}
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
            <button type="submit" className="tp-btn" disabled={busy || (teamCat && teamMembers.length > teamMaxMembers(teamCat.team_size))}>{busy ? 'Registering…' : 'Register team'}</button>
          </div>
        </form>
      )}
    </>
  );
}

export default PublicTournament;
