import {
  Clock,
  Coffee,
  Coins,
  Gift,
  LayoutGrid,
  Layers,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Users2,
} from "lucide-react";

import { ListRow, SectionCard, StatusBadge } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * /settings — Admin hub (ARCHITECTURE.md page map: "Day-parts, earning
 * rules, store settings"; docs/agent-map.md assigns the `/settings` route
 * itself to S10). Restyled to the KitchenIQ mobile design system
 * (docs/DESIGN-SYSTEM.md): a single flush SectionCard of ListRows, one per
 * admin destination, matching the KitchenIQ Admin screen (icon chip + bold
 * title + one-line description + chevron).
 *
 * Visual/layout only — this hub creates no new business logic, tables, or
 * permissions. `settings.manage` gates the hub itself the same as before;
 * each destination re-checks its own permission on arrival. Day-parts and
 * break rules (S3's Setups & Shifts stream) have no admin editor anywhere
 * in the app yet — they're seeded, read-only data (supabase/migrations/
 * 20260707001900_seed_store_config.sql) — so those two rows are flagged
 * "Coming soon" rather than linked to a page that doesn't exist. Areas
 * (position groups) and Setups (templates) both live on `/setups/templates`
 * and `/setups`, which already exist, so those stay real links. Token
 * earning rules already have a real admin editor — `EarningRulesAdmin` on
 * `/tokens` (app/(app)/tokens/page.tsx) — so that row links there instead of
 * repeating the old placeholder (PLAN.md hard boundary: this stream doesn't
 * build editors for tables it doesn't own).
 */
export default async function SettingsPage() {
  await requirePermission("settings.manage");

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <SectionCard flush>
        <div className="divide-y divide-line">
          <ListRow
            icon={ShieldAlert}
            iconTone="danger"
            title="Accountability"
            description="Infraction types, the disciplinary ladder, and period settings."
            href="/accountability"
          />
          <ListRow
            icon={Layers}
            iconTone="info"
            title="Areas"
            description="Position groups and the store layout editor."
            href="/setups/templates"
          />
          <ListRow
            icon={Coffee}
            iconTone="neutral"
            title="Break Rules"
            description="Rest and meal break entitlements by shift length."
            trailing={
              <StatusBadge tone="neutral">Coming soon</StatusBadge>
            }
          />
          <ListRow
            icon={Clock}
            iconTone="neutral"
            title="Dayparts"
            description="Morning through closing day-part windows."
            trailing={
              <StatusBadge tone="neutral">Coming soon</StatusBadge>
            }
          />
          <ListRow
            icon={Gift}
            iconTone="warning"
            title="Rewards"
            description="Store catalog, claims, and reward management."
            href="/rewards"
          />
          <ListRow
            icon={ShieldCheck}
            iconTone="accent"
            title="Roles & Users"
            description="Roles, permissions, and account access."
            href="/people/roles"
          />
          <ListRow
            icon={LayoutGrid}
            iconTone="info"
            title="Setups"
            description="Today's setup board and shift assignments."
            href="/setups"
          />
          <ListRow
            icon={Users2}
            iconTone="success"
            title="Teams"
            description="Team rosters and assignments."
            href="/people/teams"
          />
          <ListRow
            icon={Coins}
            iconTone="warning"
            title="Token Earning Rules"
            description="How many tokens each event awards."
            href="/tokens"
          />
          <ListRow
            icon={MessageSquare}
            iconTone="accent"
            title="Discord"
            description="Channel webhooks, event routing, and member links."
            href="/settings/discord"
          />
        </div>
      </SectionCard>
    </div>
  );
}
