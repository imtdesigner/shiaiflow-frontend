# ShiaiFlow — context for Claude Code

Kendo tournament web app (試合フロー). Owner: Ivan Marko Tomljenović (GitHub `imtdesigner`).
Talk to the owner in Croatian; code, commits, code comments and all UI text in English.

## Stack and infrastructure
- React 19 + Vite 7 (migrated from CRA on 2026-11-07), react-router 7, plain CSS.
- Supabase project `ShiaiFlow-db-v2` (ref `baxyawzwfpkrylprztad`, eu-west-1). Free tier: auto-pauses after ~1 week idle.
- Netlify site `shiaiflow-frontend` → app.shiaiflow.com, auto-deploy from `master`. `shiaiflow.com` is a separate landing site.
- Env: `.env.local` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (old `REACT_APP_*` names still accepted via `envPrefix`).
- Run: `npm run dev` (http://127.0.0.1:3000), `npm run build` (→ `build/`), `npm run test:logic` (node:test, no deps).

## Where things are
- `src/lib/tournament/` — pure tournament logic, fully tested: pools + fight order, bout scoring (events, auto ippon on 2nd hansoku), pool ranking with ipponshobu / replay, KO templates (`koTemplates.data.js`, standard set from the Excel) with validation and bracket resolution, team matches with daihyosen, `buildDraw()`.
- `src/lib/api.js` — Supabase data layer used by pages.
- `src/pages/` — CreateTournament, Registration, Drawings, Brackets (editor), ShiaijoPlan, FightPlan, Manage, ScoreInput, JoinCourt (PIN), EditTournament, PublicTournament are real; Shinpan is still a placeholder.
- `supabase/migrations/` — schema; 202611070001 (tournament core + RLS + realtime) and 202611070002 (RLS helpers moved to `private` schema), 202611070003 (category `cancelled` status + `move_category_entries`), 202611070004/0005 (`entries.tier`), 202611070006 (English RPC messages), 202611070007/0008 (courts per category, KO courts, central courts, end block), 202611070009 (`ko_template_edited`, `court_manual`), 202611070010/0011 (running: rules, timer, court_seq), 202611070012/0013 (public access, tournament PIN with role by door, owner-only publish, public registration), 202611070014 (category rules, competitor data and contacts, draws confirmed) are applied to ShiaiFlow-db-v2.
- `tests/` — logic tests built from real DP HKS 2026 results.

## Domain rules (ported from the DP HKS 2026 Excel system — do not change silently)
- Pool size 1 = direct KO; advancing 0 = pools only. KO code = `K` + pools (2 digits) + advancing, e.g. K052.
- KO slots: `0P1`/`0P2` = winner/runner-up of pool P, `Wnn` = winner of KO match nn. First of a pair is AKA (red).
- Shiaijo plan (owner, 2026-11-07, `courts.js`, page `/tournament/:id/shiaijo`): director picks 1–6 courts, then the courts of each category (`categories.shiaijos`, e.g. Junior A 1+2, Junior B 3+4); category order = order on each court. A pool never splits across courts — whole pools are spread over the category's courts by fight count; KO bracket parts per court, final on the first court. Options: KO on other courts (`categories.ko_shiaijos`, final on the first KO court); central courts (`tournaments.central_shiaijos`); finals, or semifinals and finals, of all categories at the end of the tournament on the central courts (`tournaments.end_block`, fights flagged `matches.end_block` for the queue). Later: big pools (>3) may move single fights to another court to use idle time.
- Bracket editor (`/tournament/:id/brackets`, `bracketEdit.js`): drag a slot onto another (pointer events, mouse + touch) or click and type P2.1 / W03 / #5; moving a W slot moves that fight, fights renumber only when a W ref would point forward. Same-half of a pool = warning, structure errors block saving. Saved to `categories.ko_template` + `ko_template_edited`; used by the draw, kept on undo; after the draw KO fights are rebuilt (refused once a KO fight started). Excel variants (`KO_VARIANTS`) offered as presets.
- Fight plan (`/tournament/:id/fights`): by category (pools, then KO) and by shiaijo (whole tournament in order, estimated start; end-of-tournament block after every court finished). Court per fight editable (`matches.court_manual`, plan changes skip it; "back to plan" resets).
- Access (owner, 2026-11-07): home page (before login) lists published tournaments with the ways in. Owner = main account, everything. One PIN per tournament (`tournament_pins`, RPC `claim_tournament`, anonymous sign-in enabled in Supabase Auth); the door decides the role: Editor + PIN → organizer (only after the owner publishes; edits before the start, Manage after), Table + PIN → scorer (only while running; scoretable, picks a shiaijo). Joining via the other door switches the role. Only the owner publishes / hides (trigger `only_owner_publishes`). Public (`is_public` = published by the owner): `/t/<tournament>` shows setup, entries (also while registration is open), draw, schedule, live results; "who are you" (no password, localStorage) → your next fight. Competitors register with a form (RPC `public_register` / `public_register_team`), no approval; owner/editor edit or remove entries. Registration closes by `registration_deadline` or by hand (`registration_open`). Teams per setup: `team_signup` = with_competitor (name a new team or pick one) or team_first (team picks members from registered competitors); `multi_team` allows one competitor in teams of different categories.
- Category rules (owner, 2026-11-07; `eligibility.js`, SQL `private.ineligible_reason`): gender, age by birth year (tournament year − birth year), grade range (mudan −7, 6 kyu −6 … 1 kyu −1, 1 dan 1 … 8 dan 8). Public form asks gender / birth year / grade (+ optional email → `competitor_contacts`, organizers only) and ticks every allowed category; forbidden ones are greyed out and refused by `public_register`. Organizer entries only warn. No members-only rule for now (later: federations with a member list).
- Draws confirmed (`tournaments.draws_confirmed`, owner can reopen): editors stop changing the setup (bracket editor, undo draw, tournament data); entries still change and the draw is adjusted with as little change as possible — replace a no-show in the same place, add a late entry to a short pool (that pool's fights rebuilt), withdraw (before the pool started: out + rebuild; after: remaining fights fusen to the opponents). Later: email affected competitors about changes.
- Running (owner, 2026-11-07; `run.js`, `runApi.js`, pages Manage / ScoreInput / JoinCourt):
  - Manager (owner/organizer) starts the tournament → `matches.court_seq` freezes the order per court; manager does admin changes and corrections (reopen a finished fight) — scorers cannot.
  - One scorer per shiaijo, several screens in parallel (realtime); the table picks its shiaijo.
  - Timer built in (hajime / yame, stops on every point; shared via `timer_elapsed_ms` + `timer_started_at`); `tournaments.use_timer` off = separate timekeeper, scorer presses "Time up".
  - Scoring letters: M K D T, I = ippon from opponent's 2nd hansoku, HH = hantei, OO = fusen-gachi; HH and OO are a 2–0 win. Two ippons end a fight; in encho / ipponshobu the first point wins.
  - Per category, separately pools / KO: pool tie → hikiwake or encho (`pool_tie`), encho length (null = until a point), hantei after encho. KO never draws.
  - Starting a fight further down the queue moves the skipped ones below it. KO fights may start as soon as both fighters are known (no waiting for all pools).
  - After a pool: rank (Excel criteria); tie for a place that matters → ipponshobu `F-Pn.D` right after on the same court; two ties → replay message for the manager; places → KO slots; KO winners move on.
  - Team lineups (later): submitted before each match at the latest, default = previous order, nothing shown until both teams confirm.
  - Fight plan: tournament start time → clock times; Print = one shiaijo per page.
- Labels (owner, 2026-11-07): bracket slots shown as P1.1 (pool 1, 1st), P4.2, W05 (winner of fight 5), L04 (loser of fight 4, future second-chance bracket), #5 in a direct KO. Fights: F-P1.1 = pool 1 fight 1 (ipponshobu F-P1.D), KO fights F-1, F-2 … (`matches.label`).
- Pool ranking (Excel order): wins ↓, losses ↑, draws ↓, ippons scored ↓, ippons conceded ↑. Head-to-head NOT used by default.
- Pools: pool count = ceil(entries / pool size) as in the Excel, but sizes are even (7 by 3 → 3+2+2, `splitEvenly`). Organizer can swap/move entries in the draw preview before saving (`drawFromPools` recomputes matches/KO; seed is then null).
- Draw placement (owner, 2026-11-07, `placement.js`), every rule "if possible": strength tier per entry (`entries.tier`: 1 last year's champion, 2 runner-up, 3 third place, 4 strong, 5 medium, 6 weaker, null not rated). Priority: (1) tiers 1–3 in pools whose winners meet no earlier than the semifinal (1 vs 2 preferably only in the final); (2) same-club entries apart (direct KO: first matches), swapping within the same tier; (3) tiers 4–6 spread evenly — dropped if needed to separate clubs. 40 attempts from the seed, best kept; leftovers shown as warnings for a minimal manual fix. Excel K052 cannot keep 4 top entries apart until the semifinal (pool 1/2 winners meet in the QF, 4/5 in round one).
- Tie on all criteria for a place that matters → ipponshobu; two ties at once → replay the pool.
- Team: more bout wins → more ippons → daihyosen.
- Small categories (owner, 2026-11-07): 3 entries → no KO; options are round robin, move all to a stronger category, or cancel the category. 4 entries → round robin or direct KO. Implemented as `smallCategoryFormats()` in `draw.js`; Drawings page offers round robin, "move all" (RPC `move_category_entries`, cancels the source) and cancel/restore (category status `cancelled`).
- KO templates must be editable per category (organizers adjust pairings for a specific draw).

## Open questions (ask the owner, don't guess)
- Canonical K052/K091 pairing, head-to-head in ranking, shared 3rd place. Missing KO templates: K031, K151, K152, K162 (K132, K142, K161 rebuilt from the DP26 bracket sheets).
- Full background: ShiaiFlow claude.ai project docs `excel-analiza-i-specifikacija.md`.

## Next planned work
1. Verify Create tournament → Registration → Drawings against the real DB (RLS).
2. ScoreInput (scoretable per shiaijo): score events, timer, finish match, pool ranking + ipponshobu, KO winner propagation, realtime.
3. Public live view (replaces the Excel dashboard), Brackets editor, Manage/queue.
