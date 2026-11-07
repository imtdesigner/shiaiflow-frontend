# ShiaiFlow — taikai made simple

Web app for running kendo tournaments: registration, pools, KO brackets, live scoring per shiaijo and a public results view.

- Production: https://app.shiaiflow.com (Netlify, auto-deploy from GitHub)
- Backend: Supabase project `ShiaiFlow-db-v2` (auth, Postgres with RLS, realtime)
- Tournament rules and Excel background: see the ShiaiFlow project docs (`excel-analiza-i-specifikacija.md`)

## Development

Requires Node 20.19+ (see `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL and publishable key
npm run dev                  # http://127.0.0.1:3000
npm run build                # output in build/
npm run test:logic           # tournament logic tests (node:test, no extra deps)
```

## Structure

- `src/lib/tournament/` — pure tournament logic (pools, scoring, ranking, KO templates, team matches)
- `src/pages/` — app pages
- `supabase/migrations/` — database schema (apply in order)
- `tests/` — logic tests based on real DP HKS 2026 results
