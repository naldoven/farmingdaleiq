"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Disabled while the form is sending. The token works once, so a second tap
 * would fail and bounce the person to the "link expired" screen even though
 * the first tap worked (AGENTS.md invariant 6: guard double submits at the form).
 */
export function ContinueButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-11 w-full rounded-lg text-[15px]" disabled={pending}>
      {pending ? "Opening..." : "Continue"}
    </Button>
  );
}
