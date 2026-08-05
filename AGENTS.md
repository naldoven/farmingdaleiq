# AGENTS.md — working on FarmingdaleIQ

Orientation for AI coding agents. Read this first, then the doc named by the
task. Humans: this is a summary; the docs it points at are the real spec.

## What this is

A single-store restaurant operations web app for the Farmingdale store
(Chick-fil-A, 1991 Broadhollow Rd). It replaces the workflows the team runs
today in Ecolab KitchenIQ, plus two internal apps from the Avondale store (a
Talent Hub and a Catering Hub), with our own implementation.

Modules: checklists, tasks, setups & shifts, breaks, position ratings, training
passports, waste, accountability/infractions, tokens & rewards, team feed,
people & teams, vendors, maintenance work orders, catering, reporting,
notifications. Chat is explicitly out of scope — the store uses Discord, and the
app posts events into it.

The users are restaurant team members on their phones. Mobile-first is not a
preference here, it is the primary case. Many will open this app a few times a
shift and never read documentation, so screens must be scannable and shallow.

## Stack

- Next.js 16.2 App Router, React 19.2, TypeScript strict
- Tailwind v4 + shadcn/ui primitives (`components/ui/`)
- Supabase: Postgres + Auth + Realtime + Storage, RLS on every table
- Vitest (unit, jsdom) + Playwright (E2E), deployed on Vercel
- Zod v4 for input validation

## Commands

```bash
npm run dev         # local dev server
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run test        # vitest run  (~110 files, ~1140 tests)
npm run build       # next build
npm run test:e2e    # playwright — needs real Supabase secrets, usually skip locally
```

**Gates before any PR: `typecheck && lint && test && build`, all green.** CI
(`.github/workflows/ci.yml`) runs exactly these four. The E2E job runs against
the live Supabase project and self-skips without secrets.

## The docs, in priority order

| Doc | What it is |
|---|---|
| `ARCHITECTURE.md` | The product spec and full data model. **The spec is law — do not invent scope.** Every table, every route, every module's intended behavior. Start here. |
| `PLAN.md` | How the app was built (parallel agent fan-out) and the ground rules that still bind: gates, no-invented-scope, permission checks server-side. |
| `docs/agent-map.md` | File/table ownership matrix per module stream, plus the per-PR review checklist. |
| `docs/DESIGN-SYSTEM.md` | **Read before adding or changing any screen.** Color tokens, type scale, and the component catalog. |
| `docs/CATERING-EMAIL-INGEST.md` | The catering inbound-email parser. |

## Layout

```
app/(app)/<module>/     # routes; (app) group is the authenticated shell
  page.tsx              #   RSC page — reads data, calls requirePermission()
  actions.ts            #   "use server" mutations
  action-types.ts       #   shared ActionResult type (see note below)
  validation.ts         #   zod schemas, no "use server" so it's testable
  queries.ts            #   read helpers
  logic.ts              #   pure business logic — where most unit tests point
app/api/cron/<job>/     # scheduled jobs, Bearer $CRON_SECRET
components/<module>/    # module UI
components/mobile/      # the design system — barrel at @/components/mobile
components/ui/          # shadcn primitives — shared, change with care
components/shell/       # nav internals
lib/auth/permissions.ts # PERMISSION_KEYS, hasPermission, requirePermission
lib/nav/page-map.ts     # NAV_GROUPS — single source of truth for navigation
lib/events/bus.ts       # emitEvent(key, payload) → app_events table
lib/tokens/ledger.ts    # award/gift/redeem — balances are never stored
lib/supabase/           # server.ts (RSC/actions), client.ts, middleware.ts
supabase/migrations/    # 66 migrations, timestamp-prefixed, append-only
e2e/                    # Playwright specs
```

## Conventions that matter

**Server actions.** Every mutation: `"use server"` at the top, call
`requirePermission(key)` before touching the DB, validate input with the
module's zod schema, go through the per-request Supabase client so RLS
independently re-checks, and return a discriminated `ActionResult` rather than
throwing. Read `app/(app)/people/actions.ts` — it is the reference the other
modules cite.

**Why `action-types.ts` exists.** Next.js only allows async function exports
from a file marked `"use server"`, so the shared `ActionResult<T>` type lives in
a sibling file. Don't move it back.

**Validation lives outside the action file** so it is unit-testable without
pulling in the server runtime.

**Async params.** Next 16: `{ params }: { params: Promise<{ id: string }> }`,
then `const { id } = await params`.

**Comments carry rationale, not narration.** This codebase's comments explain
*why* — which ARCHITECTURE.md section a screen implements, why an idempotency
guard is or isn't needed, what a past bug was. Match that. A comment restating
the line below it is noise; a comment explaining a non-obvious constraint is the
house style.

## Invariants — breaking these is a bug, not a style choice

1. **UI hiding is not security.** Every mutating path calls
   `requirePermission()` server-side, and RLS enforces the same rule at the
   database. Hiding a button is a convenience on top, never the control.
2. **Token balances are never stored.** Always summed from the append-only
   `token_transactions` ledger. Redemptions validate inside a transaction.
3. **Infractions are anonymous to the recipient.** `infractions.issued_by`
   exists for audit and must never reach the recipient-facing view.
4. **Discord webhook URLs are secrets.** Server-side only, never sent to the
   browser. Infractions and disciplinary events never auto-post to Discord
   except to an explicitly configured private leaders channel, without point
   details.
5. **Migrations are append-only.** Add a new timestamped file; never edit an
   applied one. Streams historically could not add columns to another module's
   tables — if a schema change is needed, say so rather than reaching across.
6. **Idempotency.** Anything double-submittable (posting a setup, claiming a
   reward, stamping a passport) must be safe to run twice. Where a table has no
   dedupe column, guard at the form and say so in a comment.

## Navigation

`lib/nav/page-map.ts` is the single source of truth: `NAV_GROUPS` (every route,
grouped — the group carries an icon, each item an optional permission key),
`PRIMARY_TABS`, `resolveHeader(pathname)`, and `activeNavHref(pathname)`. Add a
route there and the sidebar, mobile menu, and page headers pick it up.

**Use `activeNavHref()` to decide what is current — never a bare
`pathname.startsWith(item.href)`.** Prefix matching lights up both a section
landing page and the sub-page inside it. That was a real bug (on
`/catering/confirm`, both "Pipeline" and "Confirmation Calls" rendered as
current); `lib/nav/page-map.test.ts` covers it.

The sidebar and mobile menu are collapsible, with state persisted per browser in
`lib/nav/nav-prefs.ts`. That store uses `useSyncExternalStore`, **not**
`useState` + `useEffect` — reading localStorage during the first client render
would not match the server output, and setState-in-effect trips the React
Compiler lint rule that ships in this Next version. If you extend nav
preferences, follow the same pattern.

## Testing

Tests sit next to what they test (`logic.test.ts` beside `logic.ts`). The bulk
of coverage points at pure logic and validation schemas rather than at rendered
components; component tests use Testing Library and exist where behavior is
genuinely interactive (`components/shell/nav-links.test.tsx`,
`components/mobile/sidebar.test.tsx`). Add tests in the same shape — a new zod
schema or logic helper without a test will look out of place.

## Git

- Branch from `main`, one PR per change, CI gates green before review.
- Recent history uses `type(scope): summary` (`fix(catering): ...`,
  `feat(maintenance): ...`) for module work. Cross-cutting changes use a plain
  imperative sentence. Match whichever fits.
- Commit bodies here are substantial: what was wrong, what changed, why that
  approach. Look at `git log` before writing one.

## Store facts worth knowing

Real seeded values, captured from the live KitchenIQ portal — see
ARCHITECTURE.md "Store configuration (Farmingdale)":

- 6 dayparts: Morning, Lunch, Mid, Dinner, Night, Closing
- 10 ranked roles, Location Manager down to Team Member
- Accountability: rolling 60-day period; ladder at 10/15/20/30/50 points
- Breaks: one active rule — scheduled 6 hours earns one 30-minute break (the
  fuller NY-law engine exists but only this rule is live)
- Food holding: cold 33–41°F, hot 140–210°F

Values that were unknown at build time are seeded with an Avondale default and
marked `// SEED-DEFAULT`. Grep for that before assuming a number is real.
