import { notFound } from "next/navigation";

import { APP_FEATURES } from "@/lib/features";

/** Blocks the complete Breaks route tree while preserving its implementation. */
export default function BreaksLayout({ children }: { children: React.ReactNode }) {
  if (!APP_FEATURES.breaks) notFound();
  return children;
}
