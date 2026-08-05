import {
  Award,
  ClipboardList,
  ListTodo,
  Megaphone,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ActionPillTone, ListRowTone } from "@/components/mobile";
import type { PermissionKey } from "@/lib/auth/permissions";
import { findNavItem } from "@/lib/nav/page-map";

/** One tappable "Send" or "Assign" action pill on the Menu hub. */
export interface MenuActionItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  tone: ActionPillTone;
  /** Permission required to see this action; null means always visible. */
  permission: PermissionKey | null;
}

/**
 * The View list is grouped into these sections so the Menu tab is a short
 * index of five collapsible headings instead of one 17-row scroll. Order here
 * is the order they render in.
 */
export const MENU_SECTIONS = [
  "Daily Ops",
  "People & Training",
  "Recognition",
  "Operations",
  "Admin",
] as const;

export type MenuSection = (typeof MENU_SECTIONS)[number];

/** Serializable icon key resolved inside the client-side menu renderer. */
export type MenuViewIconName =
  | "settings"
  | "checklists"
  | "setups"
  | "breaks"
  | "ratings"
  | "training"
  | "waste"
  | "accountability"
  | "rewards"
  | "tokens"
  | "team-feed"
  | "people"
  | "vendors"
  | "maintenance"
  | "catering"
  | "reporting"
  | "notifications";

/** One row in the "View" list -- a link straight to a module. */
export interface MenuViewItem {
  key: string;
  label: string;
  href: string;
  /** String rather than a component function so MenuPage can pass it to the client. */
  icon: MenuViewIconName;
  iconTone: ListRowTone;
  /** Which collapsible heading this module sits under. */
  section: MenuSection;
}

/** A View section with the modules the current user can actually reach. */
export interface MenuViewSection {
  section: MenuSection;
  items: MenuViewItem[];
}

/**
 * The "Send" row: quick actions that post something (a recognition, an
 * infraction, a broadcast). Recognition and Broadcast open the forms already
 * on the Team Feed page; Infraction opens the issue form on Accountability.
 * Gated by the same permissions those pages already use to hide their forms.
 */
export const SEND_ACTIONS: MenuActionItem[] = [
  {
    key: "recognition",
    label: "Recognition",
    href: "/team",
    icon: Award,
    tone: "recognition",
    permission: "tokens.award",
  },
  {
    key: "infraction",
    label: "Infraction",
    href: "/accountability",
    icon: ShieldAlert,
    tone: "infraction",
    permission: "accountability.issue",
  },
  {
    key: "broadcast",
    label: "Broadcast",
    href: "/team",
    icon: Megaphone,
    tone: "broadcast",
    permission: "feed.post_broadcast",
  },
];

/** The "Assign" row: create/manage checklists and tasks. Always visible. */
export const ASSIGN_ACTIONS: MenuActionItem[] = [
  {
    key: "checklist",
    label: "Checklist",
    href: "/checklists",
    icon: ClipboardList,
    tone: "assign",
    permission: null,
  },
  {
    key: "task",
    label: "Task",
    href: "/tasks",
    icon: ListTodo,
    tone: "assign",
    permission: null,
  },
];

/**
 * The "View" list: every module in the app, in the order they appear in the
 * real KitchenIQ Menu screen. Mirrors NAV_GROUPS (lib/nav/page-map.ts) so the
 * destinations stay correct as routes evolve, but keeps its own icon/label
 * choices tuned for this screen.
 */
export const VIEW_ITEMS: MenuViewItem[] = [
  { key: "settings", label: "Admin / Settings", href: "/settings", icon: "settings", iconTone: "neutral", section: "Admin" },
  { key: "checklists", label: "Checklists", href: "/checklists", icon: "checklists", iconTone: "neutral", section: "Daily Ops" },
  { key: "setups", label: "Setups", href: "/setups", icon: "setups", iconTone: "neutral", section: "Daily Ops" },
  { key: "breaks", label: "Breaks", href: "/breaks", icon: "breaks", iconTone: "neutral", section: "Daily Ops" },
  { key: "ratings", label: "Ratings", href: "/ratings", icon: "ratings", iconTone: "neutral", section: "People & Training" },
  { key: "training", label: "Training", href: "/training", icon: "training", iconTone: "neutral", section: "People & Training" },
  { key: "waste", label: "Waste", href: "/waste", icon: "waste", iconTone: "neutral", section: "Daily Ops" },
  { key: "accountability", label: "Accountability", href: "/accountability", icon: "accountability", iconTone: "danger", section: "People & Training" },
  { key: "rewards", label: "Rewards", href: "/rewards", icon: "rewards", iconTone: "neutral", section: "Recognition" },
  { key: "tokens", label: "Tokens", href: "/tokens", icon: "tokens", iconTone: "warning", section: "Recognition" },
  { key: "team-feed", label: "Team Feed", href: "/team", icon: "team-feed", iconTone: "neutral", section: "Recognition" },
  { key: "people", label: "People", href: "/people", icon: "people", iconTone: "neutral", section: "People & Training" },
  { key: "vendors", label: "Vendors", href: "/vendors", icon: "vendors", iconTone: "neutral", section: "Operations" },
  { key: "maintenance", label: "Maintenance", href: "/maintenance", icon: "maintenance", iconTone: "neutral", section: "Operations" },
  { key: "catering", label: "Catering", href: "/catering", icon: "catering", iconTone: "neutral", section: "Operations" },
  { key: "reporting", label: "Reporting", href: "/reports", icon: "reporting", iconTone: "neutral", section: "Admin" },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: "notifications", iconTone: "neutral", section: "Admin" },
];

/** Filters a list of Send/Assign actions down to the ones a user may see. */
export function visibleActions(
  items: MenuActionItem[],
  permissions: Partial<Record<PermissionKey, boolean>>,
): MenuActionItem[] {
  return items.filter((item) => item.permission === null || permissions[item.permission] === true);
}

/**
 * The permission (if any) gating a View item, resolved from the page map by
 * href so it never drifts from the destination page's own requirePermission.
 * Ungated destinations return null.
 */
function viewItemPermission(item: MenuViewItem): PermissionKey | null {
  return findNavItem(item.href)?.permission ?? null;
}

/**
 * The distinct permission keys gating the View list, so the page can fan out
 * hasPermission over exactly the keys it needs instead of hand-listing them
 * (mirrors navPermissionKeys() for the sidebar).
 */
export function viewPermissionKeys(items: MenuViewItem[]): PermissionKey[] {
  const keys = new Set<PermissionKey>();
  for (const item of items) {
    const permission = viewItemPermission(item);
    if (permission) keys.add(permission);
  }
  return [...keys];
}

/**
 * Filters the View list down to the modules a user can actually reach, using
 * each destination's page-map permission. Ungated items (no page-map
 * permission) are always kept -- same rule as visibleNavGroups.
 */
export function visibleViewItems(
  items: MenuViewItem[],
  permissions: Partial<Record<PermissionKey, boolean>>,
): MenuViewItem[] {
  return items.filter((item) => {
    const permission = viewItemPermission(item);
    return permission === null || permissions[permission] === true;
  });
}

/**
 * Buckets View items into their sections, in MENU_SECTIONS order, dropping any
 * section the user has no reachable modules in. Grouping happens here rather
 * than by reordering VIEW_ITEMS so that list stays the flat, stable roster of
 * every module.
 */
export function groupViewItems(items: MenuViewItem[]): MenuViewSection[] {
  return MENU_SECTIONS.map((section) => ({
    section,
    items: items.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0);
}
