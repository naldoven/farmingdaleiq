# Store setup: every default value and where to fix it

Audit date: 2026-10-25. The app shipped with Avondale guesses wherever a
Farmingdale value was unknown (PLAN.md ground rules: seed the Avondale default
and mark it `SEED-DEFAULT`). This page lists every such value, every open
question from ARCHITECTURE.md, and the screen that edits it today. The in-app
version is `/settings/setup` (Store setup), which reads the same list from
`lib/store-setup/areas.ts`.

How confirmation works: a manager opens the editor, fixes the values, and taps
Mark confirmed on Store setup. That writes one row to `store_setup_areas`
(migration `20261025010000_store_setup_areas.sql`). While the row is missing,
the editor shows a small "Default, not confirmed" tag. Marking an area default
again deletes the row. Both actions need `settings.manage`.

## Areas that need a manager's answer

| Area | What shipped | Editor today | Edit needs | Money |
|---|---|---|---|---|
| Positions and groups | Avondale list in `app/(app)/setups/templates/constants.ts` (Front Counter, Drive Thru, Dining Room, Kitchen, BOH Support) plus 21 FOH onboarding stations from the training seed. Ratings and setups both read it. | None reachable. The only editor is `/setups/templates`, and the Setups module is switched off in `lib/features.ts`. | `settings.manage` (next PR) | No |
| Waste items and costs | 31 real item names from KitchenIQ screenshots. 12 items carry a `$0.10` placeholder cost; Chicken Noodle Soup and Tortilla Soup are priced per ounce at what look like per-cup prices. | `/waste?tab=admin` (Items card) | `waste.manage` | Yes |
| Token earning rules | `task_complete` 5, `checklist_complete` 5, `top_performer` 20. All placeholders. | `/tokens` (Earning rules) | `tokens.manage` | Yes |
| Rewards and prices | First 7 rewards and prices are real; the tail of the KitchenIQ list was never captured. | `/rewards` (Manage rewards) | `rewards.manage` | Yes |
| Infraction types and ladder | Corrected from screenshots on 2026-09-26. Needs a last check that nothing sits below the final screenshot. | `/accountability` (Infraction types, Disciplinary ladder, period) | `accountability.manage` | No |
| Role permissions | Cascading default per role (Team Member up to Location Manager). | `/people/roles` | `roles.manage` | No |
| Rating rubrics | No position has a 4-category rubric, so every station is quick-rate only. | `/settings/rubrics` | `training.manage` | No |
| Onboarding roadmap stations | FOH roadmap is the Avondale 21-station list in 5 phases. Kitchen roadmap is inactive and empty. | `/training/grid` shows it; no screen adds or removes stations. | `training.manage` | No |
| Passports and pipelines | Position passports auto-create per position. Masters and Leads pipelines carry Avondale stage names and promote into Avondale target roles and tiers. | `/training` and `/training/pipelines` edit items; no screen creates a pipeline or changes its target role. | `training.manage` | No |
| Org chart tiers | 5 placeholder tiers with goal counts. | `/people/org-chart` | `training.org_chart_manage` | No |
| Equipment service schedules | Equipment list imported from manuals. No preventive maintenance schedule exists. | `/maintenance/equipment/[id]` (per unit) | `maintenance.manage` | No |
| Catering menu and scaling rules | 5 starter items with invented sauce, napkin, and cup scaling. | `/catering/menu`, but scaling rules are a raw JSON textarea. | `catering.manage` | Yes |
| Catering stage checklists | Confirm, setup, kitchen prep, and handoff steps copied from the Avondale Catering Hub. | `/catering/menu` (Per-stage checklist defaults) | `catering.manage` | No |
| Discord channels | No channels until webhook URLs are pasted and events routed. | `/settings/discord` | `discord.manage` | No |

## Defaults that live in code

No editor. Store setup lists them read-only. Changing one is a code change.

| Default | Value | Where | Module |
|---|---|---|---|
| Catering re-book follow-up | 30 days after the event | `app/(app)/catering/logic.ts` `defaultFollowUpDueDate` | Live |
| Waste spike alert | 1.5x the trailing 4-week average | `app/(app)/reports/logic.ts` `findWasteSpikes` | Live |
| Near a disciplinary threshold | within 2 points | `app/(app)/reports/logic.ts` `findEmployeesNearThreshold` | Live |
| Repeat equipment failure | 2 or more work orders | `app/(app)/reports/logic.ts` `computeRepeatFailures` | Live |
| Break overdue grace | 10 minutes | `lib/breaks/entitlement.ts` `OVERDUE_GRACE_MINUTES` | Off |
| Minor break rule | 4 hours earns a 30-minute meal break (NY-law preset) | `20260707001900_seed_store_config.sql` `break_rules` | Off |
| New hire badge window | 30 days | `lib/setups/badges.ts` `NEW_HIRE_WINDOW_DAYS` | Off |
| Birthday badge window | 7 days | `lib/setups/badges.ts` `BIRTHDAY_WINDOW_DAYS` | Off |
| Shift leader rank cutoff | rank 6 (Team Leader) and above | `lib/setups/badges.ts` `LEADER_RANK_THRESHOLD` | Off |
| Store layout | No default layout; the editor is at `/setups/templates` | `components/setups/layout-editor.tsx` | Off |

## Values captured from the live KitchenIQ portal (not defaults)

These are real and need no confirmation: 6 dayparts, 10 ranked roles, the
rolling 60-day accountability period, the disciplinary ladder, the one live
break rule (6 hours earns 30 minutes), food holding ranges, the checklist
template inventory, and the course inventory. Dayparts and break rules have no
editor; the Settings hub marks them "Coming soon".

## Open questions from ARCHITECTURE.md, mapped

| # | Question | Covered by |
|---|---|---|
| 1 | Positions and groups | Positions area |
| 2 | Waste categories, items, costs | Waste area |
| 3 | Token amounts, reward tail, infraction tail | Token rules, Rewards, Infractions areas |
| 4 | Passport content, leadership passports, pipeline stages | Passports area |
| 5 | Which positions get the full rubric | Rating rubrics area |
| 6 | Org chart tiers and goal counts | Org chart area |
| 7 | Store layout sketch | Setups module is off; no area |
| 8 | Per-role permission differences | Role permissions area |
| 9 | Which reports get pulled | Not data; nothing to edit |
| 10 | Branding | Not data; a code change |
| 11 | Screenshots of the screens the team uses | Requested from Naldo at kickoff |
| 12 | Equipment list and service schedules | Equipment area (list is imported) |
| 13 | Discord channel plan, webhooks, member IDs | Discord area; member IDs on each profile |
| 14 | Catering menu, scaling rules, stage checklists, order sources | Catering menu and Catering checklists areas |
| 15 | Catering contacts export | Not a default; contacts build up from orders |

## Build order

1. This PR: the audit, the `store_setup_areas` migration, the Store setup page,
   and the "Default, not confirmed" tag on every existing editor.
2. Positions and groups editor at `/settings/positions` (the dormant Setups
   editor stays off).
3. Catering scaling rules as a row editor instead of raw JSON.
4. Rating rubrics editor at `/settings/rubrics`. Done.
5. Roadmap stations and pipeline creation, if Naldo wants them before launch.
