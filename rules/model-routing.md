# Model routing

Route work by task type, not by habit. Cheap models read, mid models build, the
expensive seat plans and reviews, the top tier is ask-first only. This cut cost
substantially at equal quality on the main project.

## The tiers

| Tier | Does |
|---|---|
| Cheapest | Reads: recon, finding files, doc lookups, log scans |
| Mid | Builds: routine implementation, tests, UI components, docs |
| Default seat | Plans, judges, reviews: orchestration, adversarial review, pull request review, dispositioning findings |
| Top | Design, danger, or money only. Always asks first, never used silently |

Map these onto whatever model names your tool offers. The shape matters, the names do
not.

## Rules

- **Only two interruptions are ever allowed:** "use the expensive model?" and "ship to
  production?". Everything else proceeds without stopping Naldo.
- **Top tier is design, danger, or money only.** Architecture calls, production
  debugging, security review, migrations, money-math verdicts. Never routine coding.
  Roughly a fifth of the work at most.
- **If a tier is unavailable, drop exactly one tier and say so.** For anything risky
  (money math, production migrations, approval or payment paths, security), stop and
  ask instead of silently substituting.
- **Subagents inherit the session model by default.** In a top-tier session, pass an
  explicit model on every single spawn. One forgotten spawn bills all its grunt work at
  the top rate.
- **Do not enforce routing with a global environment variable.** In Claude Code,
  `CLAUDE_CODE_SUBAGENT_MODEL` sits at the top of model resolution and overrides both
  agent config and the explicit per-call parameter, which flattens the whole table.
  Codex may differ here; treat this as UNVERIFIED for Codex and prefer per-call routing
  either way.

## Cases that always deserve the top tier

Named explicitly so they do not run casually on a cheap tier.

- **A prompt change to anything that shapes prices or measurements counts as a money
  change.** A rewrite of a quoting or analysis prompt moves customer prices. Treat it
  like pricing-engine math unless you can prove the text is byte-identical.
- **Re-anchoring golden test numbers is a money verdict.** Moving expected totals
  redefines what "correct" means for every future run. Itemize every cent of the delta
  first, then get the go-ahead.
- **Escalation when stuck.** When the same problem defeats the default seat twice (a
  fix loop bounces twice, a review keeps missing the root cause, a worker returns
  garbage twice on a corrected brief), offer the top tier for that one call, ask first,
  then drop back. Scoped to the single stuck problem, never the whole session.
