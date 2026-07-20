import { ActionPill, ListRow, SectionLabel } from "@/components/mobile";
import { SignOutRow } from "@/components/shell/sign-out-row";
import { hasPermission, type PermissionKey } from "@/lib/auth/permissions";

import {
  ASSIGN_ACTIONS,
  SEND_ACTIONS,
  VIEW_ITEMS,
  visibleActions,
  visibleViewItems,
  viewPermissionKeys,
} from "./menu-items";

/**
 * /menu -- the mobile nav hub behind the bottom "Menu" tab, matching the
 * KitchenIQ Menu screen: a "Send" row (recognition/infraction/broadcast), an
 * "Assign" row (checklist/task), and a "View" list linking to every module.
 * Visual/layout only: reuses the same permission checks the Team Feed and
 * Accountability pages already use to decide whether to show their forms, and
 * every destination is an existing route.
 */
export const metadata = { title: "Menu" };

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

  // S3-NEW-MENU-GATE: the View list links straight to modules, so gate it the
  // same way the sidebar is (S4). Fan out hasPermission over exactly the keys
  // the page map says gate these destinations; ungated modules always show.
  const viewKeys = viewPermissionKeys(VIEW_ITEMS);
  const viewGrants = await Promise.all(viewKeys.map((key) => hasPermission(key)));
  const viewPermissions = Object.fromEntries(
    viewKeys.map((key, i) => [key, viewGrants[i]]),
  ) as Partial<Record<PermissionKey, boolean>>;
  const viewItems = visibleViewItems(VIEW_ITEMS, viewPermissions);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-6">
      {sendActions.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Send</SectionLabel>
          <div className="flex flex-wrap gap-3">
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
          <div className="flex flex-wrap gap-3">
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
        <div className="flex flex-col gap-2.5">
          {viewItems.map((item) => (
            <ListRow
              key={item.key}
              title={item.label}
              icon={item.icon}
              iconTone={item.iconTone}
              href={item.href}
              className="rounded-2xl border border-line bg-card"
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Account</SectionLabel>
        <SignOutRow />
      </section>
    </div>
  );
}
