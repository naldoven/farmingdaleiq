"use client";

import {
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardCheck,
  Coffee,
  Coins,
  Gift,
  GraduationCap,
  LayoutGrid,
  Rss,
  Settings,
  ShieldAlert,
  Star,
  Trash2,
  Truck,
  Users,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { ListRow } from "@/components/mobile";
import {
  isNavGroupOpen,
  setNavGroupOpen,
  useNavPrefs,
} from "@/lib/nav/nav-prefs";
import { cn } from "@/lib/utils";

import type { MenuViewIconName, MenuViewSection } from "./menu-items";

/** The one section open on a first visit — what most of the team needs daily. */
const DEFAULT_OPEN_SECTION = "Daily Ops";

/** Resolve serializable server-provided icon keys on the client side. */
const VIEW_ICONS: Record<MenuViewIconName, LucideIcon> = {
  settings: Settings,
  checklists: ClipboardCheck,
  setups: LayoutGrid,
  breaks: Coffee,
  ratings: Star,
  training: GraduationCap,
  waste: Trash2,
  accountability: ShieldAlert,
  rewards: Gift,
  tokens: Coins,
  "team-feed": Rss,
  people: Users,
  vendors: Truck,
  maintenance: Wrench,
  catering: UtensilsCrossed,
  reporting: BarChart3,
  notifications: Bell,
};

/**
 * The Menu tab's "View" list, grouped into collapsible sections. Seventeen
 * modules in one scroll made the hub hard to skim on a phone; five headings
 * fit on screen at once and you open only the one you want.
 *
 * Open/closed state shares the sidebar's persisted store (lib/nav/nav-prefs),
 * so a section stays how a user left it across visits. Section labels are
 * distinct from the sidebar's group labels, so the two never collide in that
 * store.
 */
export function MenuViewSections({ sections }: { sections: MenuViewSection[] }) {
  const prefs = useNavPrefs();

  return (
    <div className="flex flex-col gap-2.5">
      {sections.map((group) => {
        const open = isNavGroupOpen(prefs, group.section, DEFAULT_OPEN_SECTION);
        return (
          <div
            key={group.section}
            className="overflow-hidden rounded-2xl border border-line bg-card"
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setNavGroupOpen(group.section, !open)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                {group.section}
              </span>
              <span className="shrink-0 text-[13px] text-muted-ink">
                {group.items.length}
              </span>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-muted-ink transition-transform",
                  open ? "rotate-0" : "-rotate-90",
                )}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div className="divide-y divide-line border-t border-line">
                {group.items.map((item) => (
                  <ListRow
                    key={item.key}
                    title={item.label}
                    icon={VIEW_ICONS[item.icon]}
                    iconTone={item.iconTone}
                    href={item.href}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
