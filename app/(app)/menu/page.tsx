import { ActionPill, ListRow, SectionCard, SectionLabel } from "@/components/mobile";
import { hasPermission } from "@/lib/auth/permissions";

import { ASSIGN_ACTIONS, SEND_ACTIONS, VIEW_ITEMS, visibleActions } from "./menu-items";

/**
 * /menu -- the mobile nav hub behind the bottom "Menu" tab, matching the
 * KitchenIQ Menu screen: a "Send" row (recognition/infraction/broadcast), an
 * "Assign" row (checklist/task), and a "View" list linking to every module.
 * Visual/layout only: reuses the same permission checks the Team Feed and
 * Accountability pages already use to decide whether to show their forms, and
 * every destination is an existing route.
 */
export default async function MenuPage() {
  const [canRecognize, canIssueInfraction, canBroadcast] = await Promise.all([
    hasPermission("tokens.award"),
    hasPermission("accountability.issue"),
    hasPermission("feed.post_broadcast"),
  ]);

  const permissions = {
    "tokens.award": canRecognize,
    "accountability.issue": canIssueInfraction,
    "feed.post_broadcast": canBroadcast,
  } as const;

  const sendActions = visibleActions(SEND_ACTIONS, permissions);
  const assignActions = visibleActions(ASSIGN_ACTIONS, permissions);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-6">
      {sendActions.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Send</SectionLabel>
          <div className="flex gap-4">
            {sendActions.map((action) => (
              <ActionPill
                key={action.key}
                icon={action.icon}
                label={action.label}
                tone={action.tone}
                href={action.href}
              />
            ))}
          </div>
        </section>
      )}

      {assignActions.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Assign</SectionLabel>
          <div className="flex gap-4">
            {assignActions.map((action) => (
              <ActionPill
                key={action.key}
                icon={action.icon}
                label={action.label}
                tone={action.tone}
                href={action.href}
              />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionLabel>View</SectionLabel>
        <SectionCard flush>
          <div className="divide-y divide-line">
            {VIEW_ITEMS.map((item) => (
              <ListRow
                key={item.key}
                title={item.label}
                icon={item.icon}
                iconTone={item.iconTone}
                href={item.href}
              />
            ))}
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
