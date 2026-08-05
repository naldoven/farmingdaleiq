"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardCheck,
  Coins,
  GraduationCap,
  Home,
  LayoutGrid,
  ListTodo,
  Menu as MenuIcon,
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

import {
  activeNavGroupLabel,
  activeNavHref,
  visibleNavGroups,
  type NavGroup,
  type NavIconName,
} from "@/lib/nav/page-map";
import {
  expandNavToGroup,
  isNavGroupOpen,
  setNavGroupOpen,
  useNavPrefs,
} from "@/lib/nav/nav-prefs";
import { cn } from "@/lib/utils";

/**
 * Resolves the page map's icon keys to lucide components. Lives here, not in
 * page-map.ts, so that module stays plain data (see NavIconName).
 */
const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  home: Home,
  menu: MenuIcon,
  checklists: ClipboardCheck,
  tasks: ListTodo,
  setups: LayoutGrid,
  ratings: Star,
  waste: Trash2,
  accountability: ShieldAlert,
  rewards: Coins,
  team: Rss,
  people: Users,
  training: GraduationCap,
  vendors: Truck,
  maintenance: Wrench,
  catering: UtensilsCrossed,
  reports: BarChart3,
  notifications: Bell,
  settings: Settings,
};

const ROW_BASE =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium transition-colors";
const ROW_ACTIVE = "bg-accent-soft font-semibold text-accent-ink";
const ROW_IDLE = "text-ink hover:bg-secondary";

/**
 * Grouped navigation shared by the desktop sidebar and the mobile "Menu"
 * drawer. Light surface, navy text; the active route is highlighted in the
 * accent red (soft fill + red text).
 *
 * The page map has ~20 groups and ~35 destinations, which as one flat list
 * overwhelmed the sidebar. So it renders two ways:
 *
 *  - A group with a single destination (Home, Tasks, Waste, ...) is a plain
 *    link row — no disclosure for a section with nothing to disclose.
 *  - A group with several (Training, Catering, Settings, ...) is an accordion:
 *    the header toggles its pages. Only the section you are currently in is
 *    open by default, so the resting nav is ~20 rows instead of ~55.
 *
 * `collapsed` renders the icon-only rail instead. There is no room there for
 * sub-pages, so clicking a multi-page section's icon expands the sidebar with
 * that section already open, and a single-destination icon just navigates.
 *
 * Open/closed state and the rail toggle persist per browser (lib/nav/nav-prefs).
 *
 * `allowedPermissions` is the set of permission keys the signed-in user holds
 * (threaded from the server layout). Gated items the user can't reach are
 * hidden so the nav never offers a dead-end link that throws on click (S4).
 * When omitted, every item shows.
 */
export function NavLinks({
  onNavigate,
  allowedPermissions,
  collapsed = false,
}: {
  onNavigate?: () => void;
  allowedPermissions?: readonly string[];
  /** Render the icon-only rail (desktop sidebar shrunk). */
  collapsed?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const groups = visibleNavGroups(
    allowedPermissions ? new Set(allowedPermissions) : null,
  );
  const prefs = useNavPrefs();
  const activeLabel = activeNavGroupLabel(pathname, groups);
  // One winner across the whole nav, so a section landing page and the
  // sub-page inside it never both read as current.
  const activeHref = activeNavHref(pathname, groups);

  if (collapsed) {
    return (
      <nav aria-label="Sections" className="flex flex-col items-center gap-1">
        {groups.map((group) => (
          <RailButton
            key={group.label}
            group={group}
            active={group.label === activeLabel}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1">
      {groups.map((group) => {
        const Icon = NAV_ICONS[group.icon];

        // Single-destination group: the group *is* the link.
        if (group.items.length === 1) {
          const item = group.items[0];
          const active = item.href === activeHref;
          return (
            <Link
              key={group.label}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(ROW_BASE, active ? ROW_ACTIVE : ROW_IDLE)}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="truncate">{group.label}</span>
            </Link>
          );
        }

        const open = isNavGroupOpen(prefs, group.label, activeLabel);
        // A closed group still signals that the current page lives inside it.
        const holdsActive = group.label === activeLabel;

        return (
          <div key={group.label} className="flex flex-col">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setNavGroupOpen(group.label, !open)}
              className={cn(
                ROW_BASE,
                "text-left",
                !open && holdsActive
                  ? "font-semibold text-accent-ink hover:bg-secondary"
                  : ROW_IDLE,
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{group.label}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-ink transition-transform",
                  open ? "rotate-0" : "-rotate-90",
                )}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div className="flex flex-col gap-0.5 pt-0.5 pb-1">
                {group.items.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "ml-[19px] truncate border-l border-line py-1.5 pr-3 pl-4 text-[14px] font-medium transition-colors",
                        active
                          ? "border-accent font-semibold text-accent-ink"
                          : "text-muted-ink hover:border-muted-ink hover:text-ink",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * One icon in the collapsed rail. Single-destination sections navigate;
 * multi-page sections re-expand the sidebar onto that section, since a 4rem
 * rail has nowhere to show sub-pages.
 */
function RailButton({
  group,
  active,
  onNavigate,
}: {
  group: NavGroup;
  /** This section holds the current route. */
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = NAV_ICONS[group.icon];
  const className = cn(
    "inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
    active ? "bg-accent-soft text-accent-ink" : "text-ink hover:bg-secondary",
  );

  if (group.items.length === 1) {
    return (
      <Link
        href={group.items[0].href}
        onClick={onNavigate}
        title={group.label}
        aria-label={group.label}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => expandNavToGroup(group.label)}
      title={`${group.label} — expand menu`}
      aria-label={`${group.label} — expand menu`}
      aria-expanded={false}
      className={className}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
