# Working conventions

The full process. `AGENTS.md` carries the short version; this file carries the detail
and the reasons.

## Verify before commit

Run the project's own gates, show the real output, do not commit on a red gate. The
default branch auto-deploys to production in these projects, so a red gate on the
default branch is a production incident.

```bash
npx tsc --noEmit && npm run lint && npm test
```

Then self-review the diff at a depth matching the risk.

- Small, internal change: a critical re-read of your own diff. Watch for unreachable
  branches, a stale doc or route reference, a half-updated registry.
- Customer-facing, money, or auth change: an adversarial review. That means hunting
  your own diff for idempotency holes, money-math drift, and permission gaps
  specifically. Those three are the recurring failure classes here.

**Fixes introduce bugs.** After a round of fixes on a money or identity path, re-attack
the fixes themselves, not just the original findings. Two separate fix rounds each
introduced new high-severity bugs that a second pass caught before merge.

## The review gate before every merge

Before asking for a merge go-ahead on any pull request, review the diff through four
lenses. Do all four; scale the depth to the size of the diff, do not skip any.

- **Customer lens.** What a homeowner hits: the portal, the quote view, emails, the
  approval and payment flow. Hunt for broken links, wrong or confusing prices, dead-end
  states, mobile rendering breaks.
- **Staff lens.** What a crew member or office staffer hits: the builder, the
  dashboard, daily workflow. Hunt for extra clicks, work lost on reload, broken tools.
- **Admin lens.** What the owner hits: settings, pricing rules, reporting, permissions,
  data integrity. Hunt for silent misconfiguration, wrong totals, access gaps, rows
  that drift out of sync.
- **Technical lens.** Correctness. Money math (integer cents, rounding direction,
  partial selections), idempotency and retry, duplicate submission, auth gaps,
  migration order, positive gates, client and server import boundaries.

For anything touching customer-facing UI, the customer and staff passes drive the real
page at desktop and mobile width. Reading the diff is not enough. Pages that passed
every gate still crashed in a browser, more than once.

Then disposition every finding: fix it, accept it with a stated reason, or write it
down as a follow-up task. High-severity findings get FIXED BEFORE you ask for the
merge go-ahead, not after. Show Naldo the dispositioned list plus the plain-English
diff summary, never raw review output.

## Session close review

At the end of a work session, review everything the session shipped as one combined
diff, not per pull request. The combined tree breaks in ways per-PR review cannot see:
each PR's reviewer scoped to that PR's diff, so a seam between two individually-clean
PRs goes unseen. One such pass found three high-severity findings sharing a single root
cause after all six PRs had already been individually reviewed.

If a session changed something live that has no git diff at all (a hosted page, a CRM
config, a deploy setting), still run the customer lens against a written description of
what changed.

## Parallel work

When a task splits into two or more independent pieces (recon of separate areas, builds
on disjoint files, review lenses, batch fixes), run them concurrently rather than one
at a time. Do not parallelize when pieces depend on each other's output, or when the
whole task is one small edit.

**Parallel workers never share one working tree.** One worker in the main tree at a
time. Every concurrent worker gets its own git worktree and its own `npm ci`. Never
link or junction `node_modules` into the main tree; teardown has eaten the main
checkout's packages three times. Read-only reviewers read through `git show
<branch>:<path>`, never the checked-out tree.

Running concurrent workers in one tree caused about five incidents in a single day:
branch flips corrupted reads mid-edit, one worker's `git stash` took another session's
untracked files off disk, and a commit nearly bundled a different worker's staged
edits.

On OneDrive-synced checkouts, long worker builds run in a persistent worktree OUTSIDE
the synced tree, and every worker brief says to commit after each completed piece.

## Working with subagents

Whether Codex can spawn parallel subagents, and under what name, is UNVERIFIED. If it
cannot, the rules below still apply to any work you hand off, including work handed to
a second Codex session.

- Write every brief self-contained: the goal, the files or area involved, the
  constraints, what done looks like, and the report format. The worker has zero context
  from your conversation.
- **A fix you prescribe in a brief is a hypothesis, not an answer.** Trace the
  consumer's actual behavior before dispatching it, or mark it clearly as intent rather
  than prescription. Prescriptive briefs shipped wrong fixes four times across two
  sessions. Every one was caught only because the worker distrusted the brief. Say in
  the brief: distrust this brief, verify against the code.
- When a worker's output falls short, send it back with specific corrections. Do not
  quietly redo the work yourself.
- Never give a subagent a state-changing git command. One subagent's `git stash` wiped
  an hour of uncommitted work. Commit before fanning out.

## Big decisions

For a genuinely uncertain, high-stakes call (architecture, task sequencing, a
customer-facing tradeoff), flag it to Naldo as worth pressure-testing and give your own
recommendation on whether it is worth the effort. Wait for a yes. Never run a heavy
multi-perspective process automatically. It is a real cost and an interrupt, and
guessing what counts as a big decision fires on the wrong things.

## Memory and continuity

Long-running projects keep continuity documents: a session log, a task ledger, a
current-state file. Conventions that hold across all of them:

- Answer any question about the current state of the default branch from
  `git show origin/main:<path>` after a fetch, never from a stale local copy. Stale
  answers have cited deleted rows and missed merged work.
- Read a huge ledger file surgically. Grab a narrow line range or grep just the part
  you need. Pulling whole sections into context is the biggest avoidable waste in a
  long session.
- Route edits to memory documents through a script file, never through inline shell
  chains. A chained write after a failed command wiped a ledger once.
- One conversation is one session. Never renumber a session mid-conversation. An
  overnight pause and a "good morning" resume is the same session.
