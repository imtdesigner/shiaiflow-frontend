# ShiaiFlow — context for Claude Code

Kendo tournament web app (試合フロー). Owner: Ivan Marko Tomljenović (GitHub `imtdesigner`).
Talk to the owner in Croatian; code, commits and code comments in English.

## Stack and infrastructure
- React 19 + Vite 7 (migrated from CRA on 2026-11-07), react-router 7, plain CSS.
- Supabase project `ShiaiFlow-db-v2` (ref `baxyawzwfpkrylprztad`, eu-west-1). Free tier: auto-pauses after ~1 week idle.
- Netlify site `shiaiflow-frontend` → app.shiaiflow.com, auto-deploy from `master`. `shiaiflow.com` is a separate landing site.
- Env: `.env.local` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (old `REACT_APP_*` names still accepted via `envPrefix`).
- Run: `npm run dev` (http://127.0.0.1:3000), `npm run build` (→ `build/`), `npm run test:logic` (node:test, no deps).

## Where things are
- `src/lib/tournament/` — pure tournament logic, fully tested: pools + fight order, bout scoring (events, auto ippon on 2nd hansoku), pool ranking with ipponshobu / replay, KO templates (`koTemplates.data.js`, standard set from the Excel) with validation and bracket resolution, team matches with daihyosen, `buildDraw()`.
- `src/lib/api.js` — Supabase data layer used by pages.
- `src/pages/` — CreateTournament, Registration, Drawings are real; Brackets, Manage, Shinpan, ScoreInput, EditTournament are still placeholders.
- `supabase/migrations/` — schema; 202611070001 (tournament core + RLS + realtime) and 202611070002 (RLS helpers moved to `private` schema), 202611070003 (category `cancelled` status + `move_category_entries`), 202611070004 (`entries.seed`) are applied to ShiaiFlow-db-v2.
- `tests/` — logic tests built from real DP HKS 2026 results.

## Domain rules (ported from the DP HKS 2026 Excel system — do not change silently)
- Pool size 1 = direct KO; advancing 0 = pools only. KO code = `K` + pools (2 digits) + advancing, e.g. K052.
- KO slots: `0P1`/`0P2` = winner/runner-up of pool P, `Wnn` = winner of KO match nn. First of a pair is AKA (red).
- Pool ranking (Excel order): wins ↓, losses ↑, draws ↓, ippons scored ↓, ippons conceded ↑. Head-to-head NOT used by default.
- Pools: pool count = ceil(entries / pool size) as in the Excel, but sizes are even (7 by 3 → 3+2+2, `splitEvenly`). Organizer can swap/move entries in the draw preview before saving (`drawFromPools` recomputes matches/KO; seed is then null).
- Draw placement (owner, 2026-11-07, `placement.js`): seeds (`entries.seed`, 1 = top) go to pools whose winners meet as late as possible in the KO template (2 seeds → final, 3–4 → semifinal); then same-club entries are spread across pools (direct KO: first matches); 40 attempts from the seed, best kept. Remaining conflicts are shown as warnings for a minimal manual fix. Note: Excel K052 cannot keep 4 seeds apart until the semifinal (pool 1/2 winners meet in the QF, 4/5 in round one).
- Tie on all criteria for a place that matters → ipponshobu; two ties at once → replay the pool.
- Team: more bout wins → more ippons → daihyosen.
- Small categories (owner, 2026-11-07): 3 entries → no KO; options are round robin, move all to a stronger category, or cancel the category. 4 entries → round robin or direct KO. Implemented as `smallCategoryFormats()` in `draw.js`; Drawings page offers round robin, "move all" (RPC `move_category_entries`, cancels the source) and cancel/restore (category status `cancelled`).
- KO templates must be editable per category (organizers adjust pairings for a specific draw).

## Open questions (ask the owner, don't guess)
- Canonical K052/K091 pairing, head-to-head in ranking, shared 3rd place. Player strength (grade) in the draw: owner mentioned it, not specified yet.
- Full background: ShiaiFlow claude.ai project docs `excel-analiza-i-specifikacija.md`.

## Next planned work
1. Verify Create tournament → Registration → Drawings against the real DB (RLS).
2. ScoreInput (scoretable per shiaijo): score events, timer, finish match, pool ranking + ipponshobu, KO winner propagation, realtime.
3. Public live view (replaces the Excel dashboard), Brackets editor, Manage/queue.
