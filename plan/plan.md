# SEU Routine Generator — Implementation Plan

Web app that generates multiple weekly routines from the SEU UMS export (`routine.html`) or a JSON dataset, based on user conditions (allowed days, time window, required courses, fixed faculty), rendering each routine as a days × time weekly table with suggestions when times need to change or would be better changed.

> Note: Plan files are restricted to `C:\Users\MN\.opencode\plan` while in Plan mode. Copy this file into the project (e.g., `plan/`) when implementation starts.

---

## 1. Verified current state

- Project: Next.js **16.4.2** (App Router, Turbopack), React 19.3, TypeScript strict, Tailwind 4, pnpm. `app/page.tsx` is still the default template.
- `app/routine.html` = the UMS "offered sections" export (Angular-rendered HTML with `_ngcontent` attributes, hidden columns, `<!---->` comment placeholders).
- `next.config.ts` has `cacheComponents: true`, `partialPrefetching: true`, and a Turbopack rule for Tailwind CSS.
- `AGENTS.md` requires reading `node_modules/next/dist/docs/` before writing code. Relevant guides to re-read at implementation time:
  - `01-app/01-getting-started/05-server-and-client-components.md`
  - `01-app/01-getting-started/11-css.md`
  - `01-app/03-api-reference/01-directives/use-client.md`
  - `01-app/03-api-reference/03-file-conventions/public-folder.md`
  - `01-app/02-guides/testing/vitest.md`
  - `01-app/03-api-reference/08-turbopack.md` (workers, module rules)
- Do not remove the auto-generated AGENTS.md block; `next dev` re-adds it.

## 2. What the export actually contains (all counts verified by parsing the real file)

| Fact | Value |
|---|---|
| Courses (by code) | CSE261 Numerical Methods, CSE263 Digital Logic Design, CSE264 DLD Lab, CSE265 Algorithm, CSE266 Algorithm Lab, MAT261 Linear Algebra and Matrices |
| Sections per course | CSE261: 9 (no `.3`), CSE263: 10, CSE264: 14 (no `.8`), CSE265: 9, CSE266: 11 (no `.6/.7`), MAT261: 9 (no `.1`) → **62 sections total** |
| Meeting lines in raw HTML | 102 → **99 unique after dedupe** (3 exact duplicate lines: CSE264.6, CSE264.12, CSE264.15 each repeat their SAT slot twice) |
| Days present | SUN, MON, TUE, WED, THU, SAT (no FRI) |
| Theory slots (80 min, 2×/week) | 08:30, 10:00, 11:30, 13:30, 15:00, 16:30 |
| Lab slots (120 min, 1×/week) | **08:00–10:00, 11:30–13:30, 13:30–15:30, 16:30–18:30** — labs genuinely start at nonstandard times |
| Faculty | 20 named (`[FUZ] Farhad Uz Zaman` format) + 1 `N/A` (CSE261.5) |
| Rooms | `SEU333`, `SEU213A`, `SEU213B`, `PC107`, `SEU804`… → generic `[A-Za-z0-9-]+`, some non-SEU |
| Section numbering | Non-contiguous (CSE261 lacks `.3`, CSE264 lacks `.8`, CSE266 lacks `.6/.7`, MAT261 lacks `.1`) |

**Conclusion: the engine must be slot-agnostic.** Any fixed "period table" would break on `08:00` labs and `13:30–15:30` blocks. All times are normalized to minutes-from-midnight; the UI draws proportional blocks. This is the single most important design decision.

## 3. Product decisions (confirmed with user + derived defaults)

1. **Time window**: user toggle **Hard / Soft**.
   - Hard: results only when every meeting is fully inside the window. A separate "Almost fits" section still shows near-miss routines with exact change hints.
   - Soft: everything shown, in-window routines outrank out-of-window ones; out-of-window blocks marked amber.
2. **Faculty/course requirement**: course checklist (all ticked courses must appear) + optional **per-course faculty allowlist** (e.g., CSE261 → only `[FUZ]`). `N/A` faculty excluded whenever an allowlist is set.
3. **Labs**: picked independently from theory; same-teacher and same-day-as-theory are **scoring bonuses + suggestions**, never hard rules. Lab↔theory pairing auto-detected (`CSE264↔CSE263`, `CSE266↔CSE265`), overridable.
4. **Days**: the day subset is a hard filter; day relaxations surface as suggestions ("add THU → unlocks N routines").
5. Optional extra constraint: **max distinct class days** (e.g., "fit in 3 days"), off by default.

## 4. Architecture

- **100% client-side compute. No API routes, no server, no runtime dependencies.** The page is a static shell + one `"use client"` root component.
- Default dataset: `routine.html` moved to **`public/routine.html`** (single source of truth, fetched at runtime at `/routine.html`). Alternative if the file must stay under `app/`: a `*.html ?raw` Turbopack module rule (`turbopack.rules` with `condition: { query: "?raw" }, type: "text"`) — but `public/` is simpler and lets the file be replaced without rebuilding. The UI also accepts **upload/paste of a fresh HTML export or a JSON dataset**, which is how updates happen per semester.
- Tests: vitest + jsdom (devDependencies only, per the official Next vitest guide). `jsdom` provides `DOMParser` in Node so the parser is tested against the real `routine.html` fixture.

### File map

```
public/routine.html                  ← moved from app/routine.html
lib/types.ts                         ← Dataset / Section / Meeting / Config / Routine / Report
lib/time.ts                          ← "HH:MM" ↔ minutes, 12h/24h formatting, DAY order
lib/parse-routine.ts                 ← HTML → Dataset (DOMParser, warning collector)
lib/dataset.ts                       ← grouping, dedupe report, lab pairing, validation
lib/engine.ts                        ← constraint filters, MRV DFS, scoring, determinism
lib/suggestions.ts                   ← relaxations, near-miss fixes, 1-swap improvements
lib/scoring.ts                       ← one scoring function + weights (single source)
app/page.tsx                         ← server shell rendering <GeneratorApp/>
components/generator-app.tsx         ← "use client" root (state, orchestration)
components/conditions-panel.tsx      ← days / window+mode / courses+faculty / options
components/dataset-panel.tsx         ← source status, upload/paste, parse warnings
components/routine-card.tsx          ← stats, suggestions, actions
components/routine-table.tsx         ← the weekly grid (x = days, y = time)
components/score-breakdown.tsx       ← "why this rank" expander
lib/__tests__/parse-routine.test.ts
lib/__tests__/engine.test.ts
lib/__tests__/suggestions.test.ts
vitest.config.mts
```

## 5. Data model (single normalized schema — also the JSON import/export format)

```ts
type Day = "SUN"|"MON"|"TUE"|"WED"|"THU"|"SAT"|"FRI";

interface Meeting { day: Day; start: number; end: number; room: string; } // minutes since midnight

interface Section {
  id: string;              // "CSE264.9"
  courseCode: string;      // "CSE264"
  sectionNo: string;       // "9"
  title: string; credits: number;                 // 3 = theory, 1 = lab
  kind: "theory" | "lab";                         // credits===1 || /lab$/i
  faculty: { code: string; name: string } | null; // "N/A" → null
  seatsAvailable: number | null;
  advisingType: string; note: string;             // kept, not used by engine
  meetings: Meeting[];                            // deduped
}

interface Dataset {
  meta: { source: "html"|"json"; generatedAt: string; daysPresent: Day[];
          timeRange: { start: number; end: number };
          counts: { courses: number; sections: number; meetings: number };
          warnings: ParseWarning[] };
  courses: Array<{ code: string; title: string; kind: "theory"|"lab";
                   pairsWith?: string; sections: Section[] }>;
}
```

`parse → Dataset → JSON → parse` must be lossless (tested round-trip).

## 6. Parser specification (HTML → Dataset)

1. Locate all `div.ums-grid-offered-section`; skip the header row (first cell text `Code`).
2. In each data row, read element children by position — verified order: `[code, title, credits, faculty, available, slots, advisingType, note, buttonWrapper]` (`<!---->` placeholders are comments, invisible to DOM queries). Each field is validated; on mismatch, fall back to content heuristics (find the slots cell = child containing `p` matching the slot regex, then map siblings around it) and emit a warning — never silently mis-read.
3. Slot regex: `^(SUN|MON|TUE|WED|THU|SAT|FRI)\s*#\s*(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})\s*@\s*(\S+)$`.
4. Faculty regex: `^\[([A-Z]{2,6})\]\s+(.+)$`; literal `N/A` → `null`.
5. **Dedupe** identical `(day,start,end,room)` within a section; count removals (expect exactly **3**).
6. Group sections by `courseCode`; expose titles from any section (consistent per course in this data; warn on mismatch).
7. Warnings list surfaced in the UI: duplicates removed, `N/A` faculty, sections with zero meetings (excluded from generation with a diagnostic), unknown lines.
8. Course code validation: `/^[A-Z]{2,4}\d{3}\.\d+$/`.

## 7. Engine specification

### Hard constraints (exact semantics)

| # | Rule | Notes |
|---|---|---|
| C1 | Exactly one section per required course; every required course present | unselected courses ignored entirely |
| C2 | Every meeting's day ∈ selected days | hard |
| C3 | Hard mode: `start ≥ window.start && end ≤ window.end` | end-inclusive: `15:00–16:20` fits a `10:00–16:20` window |
| C4 | No two meetings on the same day overlap | touching is legal: `09:50` end + `10:00` start = OK |
| C5 | Faculty allowlist per course (if set): `section.faculty.code ∈ allowlist` | `null` faculty fails when allowlist set |
| C6 | Optional: distinct days used ≤ `maxDaysUsed` | off by default |

### Algorithm

1. **Static prefilter per section** (C2, C3-hard, C5) → per-course candidate lists. If a required course ends with 0 candidates, record a *blocked-course diagnostic* (which condition blocked it + closest alternatives) — so "no results" is always explained, never silent.
2. **DFS over courses, MRV order** (fewest candidates first). State = per-day sorted interval lists; each section insertion is an overlap check against ≤ 3 intervals/day. Early pruning makes the worst case (9×10×14×9×11×9 ≈ 1.12 M combos for this dataset) collapse to near-instant; a hard `maxLeaves` cap (2 M) guarantees bounded time.
3. **Collect leaves, score, keep top-K** (default K = 200; UI shows top 20 + "show more"). Deterministic stable ordering: score desc → fewer days → earlier end → lexicographic section ids. Same config always yields the same list (tested).

### Scoring (one function, weights in one const, breakdown shown per routine)

```
score = −1000·outOfWindowMinutes          // soft mode only; guarantees in-window wins
        − 90·distinctDaysUsed
        − 1.0·totalGapMinutes             // gaps between consecutive classes per day
        − 0.5·longestGapMinutes
        − 0.1·latestEndMin
        + 15 if lab teacher == theory teacher
        + 10 if lab day == a theory day
```

Rank order and each term are displayed in the "why this rank" expander, so user-visible ordering is never a black box.

## 8. Suggestions engine (the "times need to change / better to change" feature)

Four producers, all computed from real section data:

1. **Blocked-course diagnostics** — e.g., *"CSE264: no lab section fits 10:00–16:20 on SUN–WED. Closest: CSE264.9 (MON 08:00–10:00, starts 2 h early). In-window labs exist: CSE264.1/.2/.3/.7/.10."*
2. **Relaxation scan** (when exact results < K): independently test — add each excluded day, extend window end to each distinct end time in the data (and start earlier), relax each faculty allowlist, raise maxDaysUsed+1. Report *"Extend window to 16:20 → +N routines"*, *"Add THU → +M routines"*, each with an example routine.
3. **Per-routine 1-swap improvements** (always): for each shown routine, try every alternative section of each picked course; if still valid and score improves, emit a concrete hint: *"Swap CSE264.9 → CSE264.1 (TUE 13:30–15:30): removes the 08:00 start; +52 pts"* / *"removes a 100-min gap on SUN"* / *"same teacher as theory"*. Top 3 per routine.
4. **Near-miss list** (hard mode): DFS allowing exactly one meeting outside the window, ranked by minutes-outside, each with its fix options only for the violating course. Shown in an "Almost fits — needs one change" section.

## 9. UI specification

- **Layout**: header (title + dataset chip: *"62 sections · 99 meetings · 3 duplicates removed"*), sticky left conditions panel, results column. Responsive; dark-mode aware (Tailwind palette classes).
- **Conditions panel**: day checkboxes (present days, SEU order); window start/end time inputs + Hard/Soft toggle; course list with Required checkbox, section count, faculty multi-select chips; options (max days used, top-N, lab preferences); Generate / Reset.
- **Weekly table (x = days, y = time)**: day columns; time gutter labeled every 30 min (12-hour AM/PM labels); blocks absolutely positioned from minutes (default ~1.1 px/min), so an 80-min theory class and a 120-min `08:00–10:00` lab both render exactly; hour lines; window region shaded; block shows code, room, time, faculty initials, lab badge; near-miss/out-of-window blocks amber with a tag. Never any overlap (guaranteed by C4).
- **Routine card**: table + stat chips (days used, credits, earliest, latest, total gap, longest gap) + suggestions + score breakdown + actions (copy/download JSON, print).
- **States**: no courses ticked → prompt; zero exact → diagnostics + relaxations + near-miss; parse warnings panel; dataset upload errors inline.
- **Persistence**: `localStorage` v1 key for last config, uploaded dataset, and saved routines.

## 10. Tests & verification (evidence before "done")

- **Parser (fixture = the real file)**:
  - 62 sections; per-course counts 9/10/14/9/11/9; 99 unique meetings; 3 duplicates removed; exactly 1 `N/A` faculty; days set = {SUN…SAT}∖{FRI}; min start 08:00; max end 18:30.
  - Spot checks: `CSE264.9 = MON 08:00–10:00 @ SEU616`; `CSE261.5.faculty === null`; `CSE264.6` deduped to one SAT 16:30–18:30; rooms `SEU213A`/`PC107` parse.
  - JSON round-trip deep-equal.
- **Engine**:
  - Boundary unit tests (`15:00–16:20` inside `10:00–16:20` ✓; `16:30–17:50` ✗ hard; lab `13:30–15:30` ✓; touching `09:50`/`10:00` OK; overlap rejected).
  - Faculty/maxDays filters.
  - Invariant tests over every returned routine: all required courses exactly once; days/window/faculty satisfied; zero overlaps.
  - Determinism: same input → identical order.
  - Soft mode ranks all in-window routines before any out-of-window one.
- **Golden scenario**: SUN–WED + hard `10:00–16:20` + all 6 courses → snapshot of top-10 pick-ids/stats to catch regressions. Verified feasible: candidates CSE261{.2,.4,.7,.9,.10}, CSE263{.1,.3,.4,.10}, CSE264{.1,.2,.3,.7,.10}, CSE265{.3,.4,.5,.6,.7,.8}, CSE266{.1,.3,.5,.9,.11,.12,.13}, MAT261{.4,.5,.7,.9}.
- **Suggestions**: synthetic datasets force each producer (blocked course, day-relaxation unlock, window-extension unlock, gap-removing swap, one-meeting near-miss).
- **Commands**: `pnpm lint`, `pnpm test`, `pnpm build`, then `pnpm dev` + manual QA: default load shows the 62/99/3 chip; generate the golden scenario; eyeball 3 sections against `routine.html`; upload a JSON export → identical results; force a no-result case → suggestions appear; narrow viewport → horizontal scroll.

## 11. Implementation phases

| Phase | Work | Exit criteria |
|---|---|---|
| P0 | Re-read the listed Next docs; move `routine.html` → `public/`; vitest config + scripts | `pnpm test` runs (empty suite) |
| P1 | `types`, `time`, `parse-routine`, `dataset` + parser tests | all parser tests green on the real fixture |
| P2 | `engine`, `scoring` + engine/invariant/golden tests | golden snapshot recorded, invariants green |
| P3 | `suggestions` (4 producers) + tests | each producer proven by test |
| P4 | UI: page shell, conditions panel, dataset panel, table/card, persistence, empty states | golden scenario usable end-to-end in browser |
| P5 | Polish: a11y basics, dark mode, responsive, README usage note, full lint/test/build + manual QA | checklist complete, all commands clean |
| P6 (optional) | Web Worker if profiling > ~150 ms; building-change hints; PNG/ICS export; share-URL | only if wanted |

## 12. Edge-case → handling → test (the "no gaps" matrix)

| Edge case found in file | Handling | Tested by |
|---|---|---|
| 3 duplicated lab time lines | dedupe + warning count | parser test |
| Lab starts 08:00 / 120-min duration | minute-based model, proportional rendering | parser + boundary tests |
| Faculty `N/A` | `null`; excluded under any allowlist; UI "TBA" | parser + faculty filter tests |
| Non-contiguous section numbers | no numbering assumptions anywhere | parser counts |
| `SEU213A`-style rooms, `PC107` | generic room regex | parser spot checks |
| Missing FRI | day list derived from data | parser test |
| Section with zero meetings | excluded + diagnostic (never a fake routine) | parser test |
| Course with 0 candidates after filters | blocked-course diagnostic with nearest alternatives | suggestions test |
| Touching intervals (09:50/10:00) | allowed, precise predicate | engine boundary test |
| Window end inclusive (15:00–16:20) | precise predicate | engine boundary test |
| No exact results | relaxations + near-miss + diagnostics, never a blank page | suggestions tests |
| Determinism | stable sort + integer scores | engine determinism test |
| Angular junk / hidden columns | DOM-order parse + validation + fallback heuristics | parser test on real file |

## 13. Assumptions (flag if any is wrong)

1. One window applies to all selected days (per-day windows = possible P6 extension).
2. `public/routine.html` as the default dataset location (update by replacing the file or uploading in the UI).
3. IE/older browser support not needed (DOMParser, ES2020+).
4. Building-adjacency (walking distance between rooms) is out of scope — no campus map exists in the data; only same-teacher/same-day lab heuristics are used.

---

## Definition of Done (maps to the original request)

- [ ] Input from `routine.html` **or** JSON (default shipped file + upload/paste).
- [ ] Conditions: allowed days subset, time window with Hard/Soft toggle, required courses, per-course fixed faculty.
- [ ] Multiple routines generated (top-K, deterministic ranking).
- [ ] Each routine shown as weekly table: x = days, y = time.
- [ ] Suggestions: times that need to change (near-miss + relaxations) and that would be better changed (1-swap improvements).
- [ ] Labs handled: 120-min blocks, nonstandard starts (08:00), duplicates deduped.
- [ ] No gaps: parser warnings, blocked-course diagnostics, invariant tests, lint/test/build clean.
