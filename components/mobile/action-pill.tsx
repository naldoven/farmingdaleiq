import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type ActionPillTone =
  | "recognition"
  | "infraction"
  | "broadcast"
  | "assign";

const TONE_STYLES: Record<ActionPillTone, string> = {
  recognition: "bg-success-soft text-success",
  infraction: "bg-danger-soft text-danger",
  broadcast: "bg-warning-soft text-warning",
  assign: "bg-info-soft text-info",
};

interface ActionPillBaseProps {
  icon: LucideIcon;
  label: string;
  tone?: ActionPillTone;
  className?: string;
}

type ActionPillProps = ActionPillBaseProps &
  (
    | ({ href: string } & Omit<
        React.AnchorHTMLAttributes<HTMLAnchorElement>,
        keyof ActionPillBaseProps | "href"
      >)
    | ({ href?: undefined } & Omit<
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        keyof ActionPillBaseProps
      >)
  );

/**
 * Tappable soft-tinted pill: an icon beside a bold label inside a rounded
 * rectangle. The four tones match the KitchenIQ action row: recognition
 * (green), infraction (red), broadcast (amber), assign (blue). Renders as a
 * link when `href` is set, otherwise a button.
 */
export function ActionPill({
  icon: Icon,
  label,
  tone = "assign",
  className,
  ...props
}: ActionPillProps) {
  const inner = (
    <>
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="text-[15px] font-semibold">{label}</span>
    </>
  );

  const shared = cn(
    "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 transition-transform active:scale-95",
    TONE_STYLES[tone],
    className,
  );

  if ("href" in props && props.href) {
    const { href, ...rest } = props;
    return (
      <Link href={href} className={shared} {...rest}>
        {inner}
      </Link>
    );
  }

  const { href: _omit, ...rest } = props as { href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>;
  void _omit;
  return (
    <button type="button" className={shared} {...rest}>
      {inner}
    </button>
  );
}
