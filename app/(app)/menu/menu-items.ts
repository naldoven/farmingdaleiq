import {
  Award,
  BarChart3,
  Bell,
  ClipboardCheck,
  ClipboardList,
  Coffee,
  Coins,
  GraduationCap,
  Gift,
  LayoutGrid,
  ListTodo,
  Megaphone,
  Rss,
  Settings,
  ShieldAlert,
  Star,
  Trash2,
  Truck,
  Users,
  UtensilsCrossed,
  Wrench,
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

/** One row in the "View" list -- a link straight to a module. */
export interface MenuViewItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  iconTone: ListRowTone;
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
  { key: "settings", label: "Admin / Settings", href: "/settings", icon: Settings, iconTone: "neutral" },
  { key: "checklists", label: "Checklists", href: "/checklists", icon: ClipboardCheck, iconTone: "neutral" },
  { key: "setups", label: "Setups", href: "/setups", icon: LayoutGrid, iconTone: "neutral" },
  { key: "breaks", label: "Breaks", href: "/breaks", icon: Coffee, iconTone: "neutral" },
  { key: "ratings", label: "Ratings", href: "/ratings", icon: Star, iconTone: "neutral" },
  { key: "training", label: "Training", href: "/training", icon: GraduationCap, iconTone: "neutral" },
  { key: "waste", label: "Waste", href: "/waste", icon: Trash2, iconTone: "neutral" },
  { key: "accountability", label: "Accountability", href: "/accountability", icon: ShieldAlert, iconTone: "danger" },
  { key: "rewards", label: "Rewards", href: "/rewards", icon: Gift, iconTone: "neutral" },
  { key: "tokens", label: "Tokens", href: "/tokens", icon: Coins, iconTone: "warning" },
  { key: "team-feed", label: "Team Feed", href: "/team", icon: Rss, iconTone: "neutral" },
  { key: "people", label: "People", href: "/people", icon: Users, iconTone: "neutral" },
  { key: "vendors", label: "Vendors", href: "/vendors", icon: Truck, iconTone: "neutral" },
  { key: "maintenance", label: "Maintenance", href: "/maintenance", icon: Wrench, iconTone: "neutral" },
  { key: "catering", label: "Catering", href: "/catering", icon: UtensilsCrossed, iconTone: "neutral" },
  { key: "reporting", label: "Reporting", href: "/reports", icon: BarChart3, iconTone: "neutral" },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: Bell, iconTone: "neutral" },
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
