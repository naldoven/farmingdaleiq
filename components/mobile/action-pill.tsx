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
  assign: "bg-accent-soft text-accent-ink",
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
 * Tappable pill with a tinted round icon chip over a bold label. The four tones
 * match the KitchenIQ action row: recognition (green), infraction (red),
 * broadcast (amber), assign (accent red). Renders as a link when `href` is set,
 * otherwise a button.
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
      <span
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-full",
          TONE_STYLES[tone],
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-[13px] font-semibold text-ink">{label}</span>
    </>
  );

  const shared = cn(
    "flex flex-col items-center gap-2 rounded-2xl p-1 text-center transition-transform active:scale-95",
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
