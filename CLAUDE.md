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
- `src/pages/` — CreateTournament, Registration, Drawings are real; Brackets, Manage, Shinpan, ScoreInput, EditTournament are still placeholders.
- `supabase/migrations/` — schema; 202611070001 (tournament core + RLS + realtime) and 202611070002 (RLS helpers moved to `private` schema), 202611070003 (category `cancelled` status + `move_category_entries`), 202611070004/0005 (`entries.tier`), 202611070006 (English RPC messages), 202611070007/0008 (courts per category, KO courts, central courts, end block) are applied to ShiaiFlow-db-v2.
- `tests/` — logic tests built from real DP HKS 2026 results.

## Domain rules (ported from the DP HKS 2026 Excel system — do not change silently)
- Pool size 1 = direct KO; advancing 0 = pools only. KO code = `K` + pools (2 digits) + advancing, e.g. K052.
- KO slots: `0P1`/`0P2` = winner/runner-up of pool P, `Wnn` = winner of KO match nn. First of a pair is AKA (red).
- Shiaijo plan (owner, 2026-11-07, `courts.js`, page `/tournament/:id/shiaijo`): director picks 1–6 courts, then the courts of each category (`categories.shiaijos`, e.g. Junior A 1+2, Junior B 3+4); category order = order on each court. A pool never splits across courts — whole pools are spread over the category's courts by fight count; KO bracket parts per court, final on the first court. Options: KO on other courts (`categories.ko_shiaijos`, final on the first KO court); central courts (`tournaments.central_shiaijos`); finals, or semifinals and finals, of all categories at the end of the tournament on the central courts (`tournaments.end_block`, fights flagged `matches.end_block` for the queue). Later: big pools (>3) may move single fights to another court to use idle time.
- Labels (owner, 2026-11-07): bracket slots shown as P1.1 (pool 1, 1st), P4.2, W05 (winner of fight 5), L04 (loser of fight 4, future second-chance bracket), #5 in a direct KO. Fights: F-P1.1 = pool 1 fight 1 (ipponshobu F-P1.D), KO fights F-1, F-2 … (`matches.label`).
- Pool ranking (Excel order): wins ↓, losses ↑, draws ↓, ippons scored ↓, ippons conceded ↑. Head-to-head NOT used by default.
- Pools: pool count = ceil(entries / pool size) as in the Excel, but sizes are even (7 by 3 → 3+2+2, `splitEvenly`). Organizer can swap/move entries in the draw preview before saving (`drawFromPools` recomputes matches/KO; seed is then null).
- Draw placement (owner, 2026-11-07, `placement.js`), every rule "if possible": strength tier per entry (`entries.tier`: 1 last year's champion, 2 runner-up, 3 third place, 4 strong, 5 medium, 6 weaker, null not rated). Priority: (1) tiers 1–3 in pools whose winners meet no earlier than the semifinal (1 vs 2 preferably only in the final); (2) same-club entries apart (direct KO: first matches), swapping within the same tier; (3) tiers 4–6 spread evenly — dropped if needed to separate clubs. 40 attempts from the seed, best kept; leftovers shown as warnings for a minimal manual fix. Excel K052 cannot keep 4 top entries apart until the semifinal (pool 1/2 winners meet in the QF, 4/5 in round one).
- Tie on all criteria for a place that matters → ipponshobu; two ties at once → replay the pool.
- Team: more bout wins → more ippons → daihyosen.
- Small categories (owner, 2026-11-07): 3 entries → no KO; options are round robin, move all to a stronger category, or cancel the category. 4 entries → round robin or direct KO. Implemented as `smallCategoryFormats()` in `draw.js`; Drawings page offers round robin, "move all" (RPC `move_category_entries`, cancels the source) and cancel/restore (category status `cancelled`).
- KO templates must be editable per category (organizers adjust pairings for a specific draw).

## Open questions (ask the owner, don't guess)
- Canonical K052/K091 pairing, head-to-head in ranking, shared 3rd place.
- Full background: ShiaiFlow claude.ai project docs `excel-analiza-i-specifikacija.md`.

## Next planned work
1. Verify Create tournament → Registration → Drawings against the real DB (RLS).
2. ScoreInput (scoretable per shiaijo): score events, timer, finish match, pool ranking + ipponshobu, KO winner propagation, realtime.
3. Public live view (replaces the Excel dashboard), Brackets editor, Manage/queue.
