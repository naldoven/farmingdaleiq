/**
 * Single source of truth for the app's nav skeleton, mirroring
 * ARCHITECTURE.md "Page map" exactly. Used to render the sidebar AND the
 * placeholder content of every route not yet built out (PLAN.md P0 #1).
 *
 * `owner` is the PLAN.md stream that builds the real page in P1/P2; "P0"
 * means this repo (People & Teams) already has a real implementation.
 */

export interface NavItem {
  href: string;
  label: string;
  description: string;
  owner: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Home",
    items: [
      {
        href: "/",
        label: "Home",
        description: "My positions today, my to-dos, token balance, feed highlights.",
        owner: "P2 wiring",
      },
    ],
  },
  {
    label: "Checklists",
    items: [
      {
        href: "/checklists",
        label: "Checklists",
        description: "Today's runs to complete; run player UI.",
        owner: "S1",
      },
      {
        href: "/checklists/templates",
        label: "Templates",
        description: "Build/edit templates, sections, questions, schedules.",
        owner: "S1",
      },
    ],
  },
  {
    label: "Tasks",
    items: [
      {
        href: "/tasks",
        label: "Tasks",
        description: "My tasks + shift pool; create ad-hoc tasks.",
        owner: "S2",
      },
    ],
  },
  {
    label: "Setups & Shifts",
    items: [
      {
        href: "/setups",
        label: "Setup board",
        description:
          "Setup board (visual layout or list) by date/day-part; auto-place suggestions; create/assign/post; shift notes.",
        owner: "S3",
      },
      {
        href: "/setups/templates",
        label: "Setup templates",
        description: "Manage setup templates, groups, positions, and the store layout editor.",
        owner: "S3",
      },
      {
        href: "/breaks",
        label: "Breaks",
        description: "Break manager: today's entitlements, sequence, authorize/start/complete, overdue alerts.",
        owner: "S3",
      },
    ],
  },
  {
    label: "Ratings",
    items: [
      {
        href: "/ratings",
        label: "Ratings",
        description: "Skills matrix (people x positions, color-coded), rate/re-rate flows, re-rate queue.",
        owner: "S4",
      },
    ],
  },
  {
    label: "Waste",
    items: [
      {
        href: "/waste",
        label: "Waste",
        description: "Quick waste logging; admin: categories/items.",
        owner: "S5",
      },
    ],
  },
  {
    label: "Accountability",
    items: [
      {
        href: "/accountability",
        label: "Accountability",
        description: "Issue infractions; my record; admin: types, ladder, period settings.",
        owner: "S6",
      },
    ],
  },
  {
    label: "Tokens & Rewards",
    items: [
      {
        href: "/rewards",
        label: "Rewards",
        description: "Store + claims; admin: manage rewards.",
        owner: "S7",
      },
      {
        href: "/tokens",
        label: "Tokens",
        description: "Balance, history, send tokens.",
        owner: "S7",
      },
    ],
  },
  {
    label: "Team",
    items: [
      {
        href: "/team",
        label: "Team Feed",
        description: "Feed (recognitions, top performers, broadcasts), likes/comments.",
        owner: "S7",
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/people",
        label: "Roster",
        description: "Roster, profiles, roles & permissions, teams.",
        owner: "P0",
      },
      {
        href: "/people/org-chart",
        label: "Org Chart",
        description: "Editable org chart: tiers, goal counts, filled and vacant slots.",
        owner: "S4",
      },
    ],
  },
  {
    label: "Training",
    items: [
      {
        href: "/training",
        label: "Passports",
        description: "My progress, all passports, trainer sign-offs, leader stamping; admin: passport items, courses.",
        owner: "S4",
      },
      {
        href: "/training/grid",
        label: "Station Grid",
        description: "Station grid: trainees by stations, click-to-cycle and score, phase averages.",
        owner: "S4",
      },
      {
        href: "/training/schedule",
        label: "Trainee Schedule",
        description: "Trainee week schedule: station + time + trainer per day, session tags, print view.",
        owner: "S4",
      },
      {
        href: "/training/graduates",
        label: "Graduates",
        description: "Graduates list and 30-day audits (PASS / PIP).",
        owner: "S4",
      },
      {
        href: "/training/pipelines",
        label: "Pipelines",
        description: "Masters and leadership stage pipelines with per-person progress.",
        owner: "S4",
      },
    ],
  },
  {
    label: "Vendors",
    items: [
      {
        href: "/vendors",
        label: "Vendors",
        description: "Vendor directory.",
        owner: "S8",
      },
    ],
  },
  {
    label: "Maintenance",
    items: [
      {
        href: "/maintenance",
        label: "Maintenance",
        description: "Submit requests; triage queue; work order board & detail (comments, photos, cost).",
        owner: "S8",
      },
      {
        href: "/maintenance/equipment",
        label: "Equipment",
        description: "Equipment registry, unit pages with history, PM schedules.",
        owner: "S8",
      },
    ],
  },
  {
    label: "Catering",
    items: [
      {
        href: "/catering",
        label: "Pipeline",
        description: "Order pipeline board: stage columns, drag/dropdown moves, new-order intake.",
        owner: "S9",
      },
      {
        href: "/catering/week",
        label: "This Week",
        description: "This Week calendar of upcoming orders.",
        owner: "S9",
      },
      {
        href: "/catering/confirm",
        label: "Confirmation Calls",
        description: "Confirmation-call queue with per-order call checklist.",
        owner: "S9",
      },
      {
        href: "/catering/setup",
        label: "FOH Setup",
        description: "FOH setup queue: auto-scaled setup checklists per order.",
        owner: "S9",
      },
      {
        href: "/catering/dispatch",
        label: "Dispatch",
        description: "Pickup/delivery queue with handoff checklist.",
        owner: "S9",
      },
      {
        href: "/catering/history",
        label: "History",
        description: "Contacts, follow-ups due, order history with period filters.",
        owner: "S9",
      },
      {
        href: "/catering/analytics",
        label: "Analytics",
        description: "Catering volume, revenue, busiest days, top guests.",
        owner: "S9",
      },
      {
        href: "/catering/menu",
        label: "Menu",
        description: "Menu item catalog admin (components, scaling rules).",
        owner: "S9",
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        href: "/reports",
        label: "Reports",
        description: "Store dashboard + per-module reports, CSV export.",
        owner: "P2 reporting",
      },
    ],
  },
  {
    label: "Notifications",
    items: [
      {
        href: "/notifications",
        label: "Notifications",
        description: "Notification center.",
        owner: "S10",
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/settings",
        label: "Settings",
        description: "Day-parts, earning rules, store settings.",
        owner: "S10",
      },
      {
        href: "/settings/discord",
        label: "Discord",
        description: "Register channel webhooks, map event routes, link members' Discord IDs.",
        owner: "S10",
      },
    ],
  },
];

export function findNavItem(href: string): NavItem | undefined {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.href === href);
    if (item) return item;
  }
  return undefined;
}
