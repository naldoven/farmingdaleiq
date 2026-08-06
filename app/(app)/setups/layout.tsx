import { notFound } from "next/navigation";

import { APP_FEATURES } from "@/lib/features";

/** Blocks the complete Setups route tree while preserving its implementation. */
export default function SetupsLayout({ children }: { children: React.ReactNode }) {
  if (!APP_FEATURES.setups) notFound();
  return children;
}
