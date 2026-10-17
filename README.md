# SEU Routine Generator

Generate optimal weekly class schedules from Southeast University's UMS "offered sections" export.

## Features

- **Multiple routines**: Generates hundreds of valid schedules ranked by score
- **Smart constraints**: Filter by days, time window (hard/soft), faculty preferences
- **Lab pairing**: Auto-detects theory↔lab relationships with same-teacher/same-day bonuses
- **Suggestions**: Relaxation hints, near-miss fixes, 1-swap improvements
- **Visual schedule**: Proportional time blocks, gaps highlighted, window overlay
- **100% client-side**: Zero server, static export, works offline after first load

## Usage

### Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build for production

```bash
pnpm build
```

The static export will be in the `out` directory.

### Deploy to GitHub Pages

This project is configured for automatic deployment to GitHub Pages:

1. **Enable GitHub Pages:**
   - Go to repository Settings > Pages
   - Select "GitHub Actions" as the source

2. **Push to main branch:**

   ```bash
   git push origin main
   ```

3. **Access your site:**
   - Your site will be available at: `https://<username>.github.io/<repository-name>/`
   - Monitor deployment in the Actions tab

### Update dataset

1. Go to UMS → Advising → Offered Sections → Export (HTML)
2. Save as `public/routine.html` (overwrites default) **or**
3. Upload/paste in the UI Dataset panel

## How it works

1. **Parser** (`lib/parse-routine.ts`): Extracts 62 sections from Angular-rendered HTML, dedupes meetings, validates structure
2. **Engine** (`lib/engine.ts`): DFS with MRV ordering, overlap-free constraint checking, deterministic scoring
3. **Suggestions** (`lib/suggestions.ts`): Blocked-course diagnostics, relaxation scan, 1-swap improvements, near-miss analysis
4. **UI** (`components/*`): React 19 client components, Tailwind 4, localStorage persistence

## Testing

```bash
pnpm test          # run vitest
pnpm lint          # eslint
pnpm build         # type check + build
```

27 tests covering:

- Parser (deduplication, faculty, room types, JSON round-trip)
- Engine (boundary conditions, invariants, determinism, golden scenario)
- Suggestions (diagnostics, relaxations, swaps, near-miss)

## Plan

See [`plan/plan.md`](plan/plan.md) for the full implementation spec (verified counts, edge cases, scoring formula, test matrix).

## Tech stack

- **Next.js 16.4.2** (App Router, React 19.3, Turbopack)
- **TypeScript** (strict mode)
- **Tailwind CSS 4**
- **Vitest + jsdom** (testing)

## License

MIT
