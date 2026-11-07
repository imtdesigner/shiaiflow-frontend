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
- `supabase/migrations/` — schema; 202611070001 (tournament core + RLS + realtime) and 202611070002 (RLS helpers moved to `private` schema) are applied to ShiaiFlow-db-v2.
- `tests/` — logic tests built from real DP HKS 2026 results.

## Domain rules (ported from the DP HKS 2026 Excel system — do not change silently)
- Pool size 1 = direct KO; advancing 0 = pools only. KO code = `K` + pools (2 digits) + advancing, e.g. K052.
- KO slots: `0P1`/`0P2` = winner/runner-up of pool P, `Wnn` = winner of KO match nn. First of a pair is AKA (red).
- Pool ranking (Excel order): wins ↓, losses ↑, draws ↓, ippons scored ↓, ippons conceded ↑. Head-to-head NOT used by default.
- Tie on all criteria for a place that matters → ipponshobu; two ties at once → replay the pool.
- Team: more bout wins → more ippons → daihyosen.
- KO templates must be editable per category (organizers adjust pairings for a specific draw).

## Open questions (ask the owner, don't guess)
- Canonical K052/K091 pairing, head-to-head in ranking, shared 3rd place, club separation in pools.
- Full background: ShiaiFlow claude.ai project docs `excel-analiza-i-specifikacija.md`.

## Next planned work
1. Verify Create tournament → Registration → Drawings against the real DB (RLS).
2. ScoreInput (scoretable per shiaijo): score events, timer, finish match, pool ranking + ipponshobu, KO winner propagation, realtime.
3. Public live view (replaces the Excel dashboard), Brackets editor, Manage/queue.
