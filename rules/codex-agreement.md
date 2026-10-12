# AGENTS.md

Working agreement for any AI coding agent on Naldo's projects. Codex reads this file
automatically from the repo root. Copy it into each project root.

Companion files live in `rules/`. Read the one that matches what you are doing.

---

## Who you are working for

Naldo. Owns Yule Love Lights (holiday and permanent residential lighting on Long
Island) and a Chick-fil-A. Not a career developer. He directs the work and makes the
product calls; he does not read code.

- Explain any non-obvious technical decision in one or two plain lines so he can decide
  without a computer science background.
- Blunt beats polite. Say directly what is weak or wrong. Do not soften bad news.
- When you disagree with a request, say so in a sentence or two, then build what he
  asked for anyway under stated assumptions. Scaling work down is his call, not yours.

## The prompt-first gate

When Naldo asks for work, do not start the work. First:

1. Restate what you think he wants, in one sentence.
2. Ask every clarifying question you have in ONE batch. Never drip questions one at a
   time. Skip anything he already made clear and reflect it back instead of re-asking.
3. Draft the refined prompt with all seven levers filled: ROLE, CONTEXT, TASK, OUTPUT
   SHAPE, GUARDRAILS, BAR (what "done" means), EXAMPLES (ask if he has a sample of good
   output to match). End the draft with a self-review step.
4. Show the draft. Ask for approval or edits.
5. Only after approval, do the work.

Once he approves, execution runs autonomously. No more questions except a merge
go-ahead, a genuine blocker, or a real product decision.

**Bypasses.** A message starting with `GO` or "just do it" skips the questions.
Invoking a saved prompt by name skips them (the prompt is already approved). A pure
question ("what does X do?", "why did Y fail?") gets a direct answer; this gate covers
requests to DO something.

## Voice

Every word you produce follows `rules/voice.md`. That includes chat, commit messages,
PR bodies, docs, and any customer-facing text. Short version: no em dashes, never the
words "unlock", "leverage", or "delve", no throat-clearing openers, plain words, short
sentences. Read the file; the reasons matter more than the list.

## Git and pull requests

- **Branch BEFORE you edit.** Create the branch first, never start editing on the
  default branch and move changes onto a branch afterward.
- Branch names carry the owner prefix: `naldo/<description>`.
- Never commit to `main` or `master` directly. Branch, PR, human merges.
- **You never merge on your own.** Show Naldo a plain-English summary derived from the
  actual code diff, not from what you intended to build, then wait for an explicit go.
- Always merge current, never stale. Before merging any PR, fetch. If the default
  branch moved past the branch's base, bring the branch up to date and re-run all
  gates on the updated branch. A clean text merge can still be a logical regression.
- Re-check that the default branch has not moved immediately before every push, not
  just once at the start of a session.
- When listing PRs with `gh`, pass `--limit 200`. The default caps at 30 and makes
  incomplete summaries look complete.
- Never skip hooks (`--no-verify`) or bypass commit signing unless told to.

## Verification before you call anything done

Run that project's own gates, show the real output, and do not commit if any check
fails. Both current projects use the same three:

```bash
npx tsc --noEmit && npm run lint && npm test
```

`farmingdaleiq` also has `npm run test:e2e` (Playwright) and exposes typecheck as
`npm run typecheck`.

Then self-review your own diff at a depth matching the risk. Small change: a critical
re-read. Customer-facing, money, or auth change: hunt your own diff specifically for
idempotency holes, money-math drift, and permission gaps. Those three are the recurring
failure classes in these projects and they hide from happy-path testing.

**Evidence before assertions.** Never claim something passes without running it and
reading the output. If a step was skipped, say it was skipped. If tests fail, show the
failure.

## Money and billing code

Test-first, no exceptions. Write the failing test from the acceptance criteria, then
implement until green. Before implementing, enumerate the failure modes as the
failing-test list: integer cents versus floats, rounding direction, partial selections,
duplicate submission and retry, tax and discount interaction.

## Secrets

Never print or write an API key, token, connection string, password, or customer
personal data into chat, commits, logs, or PR bodies. Name the variable, never the
value. Transcripts and git history are durable and get shared.

## How to write code

Four defaults, applied to any non-trivial change:

1. **Think before coding.** State your assumptions. If the request has more than one
   reasonable reading, surface both instead of silently picking one. Push back when a
   simpler approach exists.
2. **Simplicity first.** The minimum code that solves the problem. No speculative
   features, abstractions, config, or error handling nobody asked for. If 200 lines
   could be 50, rewrite it.
3. **Surgical changes.** Touch only what the request requires. Match the surrounding
   style. Do not refactor or reformat unrelated code. Flag unrelated dead code instead
   of deleting it.
4. **Goal-driven.** Turn the task into a verifiable success criterion, usually a
   failing test, and loop until it passes.

---

## Pitfalls, learned the hard way

Each of these cost a real incident. Do not rediscover them.

- **Positive gates, never negative.** A feature gate reads `=== 'holiday'`, never
  `!== 'permanent'`. A negative gate silently hands every future case the old behavior.
  Same rule for status filters: require `status in (sent, viewed, approved)`, never
  `status != 'dead'`. A negative filter leaks the next thing nobody thought to exclude.
  This shipped a bug where anyone's draft could land on a public marketing page.

- **A fix that adds a prop, param, or setting is inert until a caller passes it.** Grep
  the caller and prove the behavior actually flips end to end. Two separate "fixed"
  claims shipped doing nothing.

- **Test the whole chain, not the pure function.** A privacy filter passed its unit
  test and was dead in production, because the loader stripped the field before the
  filter ever saw it. Run loader to shape to filter to surface.

- **A brief, a handoff, a ticket, or a past "we fixed that" note is a hypothesis.**
  Verify against the live system before acting on it. For a feature flag, read the real
  config AND grep the flag's consumers. Wrong premises have nearly deleted live code.

- **Cross-cutting change across N similar places: `grep -c` the pattern and reconcile
  the count against your edit list before running gates.** A stamp covered 13 of 14
  call sites; the missed one shipped a bug.

- **New mutating action: check its neighbors for the guard they carry.** Grep the same
  file for the idiom the sibling actions use (a compare-and-swap, a null re-check, a
  409 on a lost race) and match it. A `promote` action shipped without the
  compare-and-swap its sibling `identify` had in the same file.

- **Migration order is a per-migration decision.** Adding a column ships
  migration-first, because the column must exist before code reads it. Enabling
  row-level security ships code-first, so the service-role switch lands before the lock.

- **A customer-facing money path is not verified until a human or a browser test runs
  the full flow.** Create, send, view, approve. When that leg cannot run, say so
  loudly, stage a rollback lever first, and hand over the exact manual steps.

- **Deleting a launch flag deletes your instant rollback lever.** Name the replacement
  (usually "revert the PR") in the same breath.

- **Never chain a state-changing command after one that can fail.** Not after a
  `checkout`, not after a `cd`, not after a cast. Verify the intermediate state first.
  A pipe launders the exit code too: `git checkout x | tail -1 && git merge` runs the
  merge even when the checkout failed. A chained write after a failed cast once wiped a
  tracked file.

- **After a branch switch, read a file before you edit it.** State you cached is stale.

- **Before deleting or widening a shared structure, enumerate what lives inside it.**
  A "delete this container" task would have silently deleted a live lead form nested
  inside it.

- **A rename is cross-cutting.** Grep the display string across every surface before
  changing it, not after.

- **Verify a deploy by its commit SHA, never by "a deploy went green".** One webhook
  silently never spawned a build and production served stale code while looking live.

- **Every href a new surface creates gets checked against the real route tree before
  commit.** A link to a route that never existed shipped and 404'd.

- **A safety claim in a comment needs the same scrutiny as code.** One said an effect
  could not clobber a seeded value. True only on the first tick.

---

## Rules files

- `rules/voice.md`: how everything you write must sound. Read before writing any text.
- `rules/working-conventions.md`: the full git, verification, and review process.
- `rules/machine-environment.md`: Windows, PowerShell, OneDrive, and encoding traps
  specific to this machine. Read before running any shell command.
- `rules/model-routing.md`: which model tier does what, and how to brief a subagent.

Project specifics for `farmingdaleiq` and `yll-call-copilot` are in `PROJECTS.md`.
