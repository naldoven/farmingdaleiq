import {
  ClipboardCheck,
  Coins,
  GraduationCap,
  LayoutDashboard,
  ShieldAlert,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { ListRowTone } from "@/components/mobile";

export type ReportSlug =
  | "overview"
  | "waste"
  | "accountability"
  | "checklists"
  | "tokens"
  | "training"
  | "maintenance";

export interface ReportTypeMeta {
  slug: ReportSlug;
  label: string;
  description: string;
  icon: LucideIcon;
  iconTone: ListRowTone;
}

/**
 * The /reports hub's report-type list (KitchenIQ Reporting screen): a plain
 * ListRow per report type, each linking to its own /reports/<slug> page. One
 * source of truth for the hub's ListRows and each sub-page's local heading,
 * so the label/description never drift between the two.
 */
export const REPORT_TYPES: ReportTypeMeta[] = [
  {
    slug: "overview",
    label: "Overview",
    description: "Cross-module alerts: overdue to-dos, waste spikes, work orders, and more.",
    icon: LayoutDashboard,
    iconTone: "accent",
  },
  {
    slug: "waste",
    label: "Waste",
    description: "Waste logged by item and category, sliced by period.",
    icon: Trash2,
    iconTone: "danger",
  },
  {
    slug: "accountability",
    label: "Accountability",
    description: "Active points and lifetime infractions by employee.",
    icon: ShieldAlert,
    iconTone: "warning",
  },
  {
    slug: "checklists",
    label: "Checklists",
    description: "Completion and flagged answers by template.",
    icon: ClipboardCheck,
    iconTone: "accent",
  },
  {
    slug: "tokens",
    label: "Tokens & rewards",
    description: "Token activity by employee and reward claims summary.",
    icon: Coins,
    iconTone: "warning",
  },
  {
    slug: "training",
    label: "Training",
    description: "Development passport and trainee lifecycle completion.",
    icon: GraduationCap,
    iconTone: "info",
  },
  {
    slug: "maintenance",
    label: "Maintenance",
    description: "Time to resolution, spend, and repeat failures by equipment.",
    icon: Wrench,
    iconTone: "neutral",
  },
];

export function findReportType(slug: string): ReportTypeMeta | undefined {
  return REPORT_TYPES.find((r) => r.slug === slug);
}
