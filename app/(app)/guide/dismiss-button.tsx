"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { dismissGuide } from "@/lib/guide/guide-prefs";

/** Marks the guide dismissed, then returns to Home where the card is now gone. */
export function DismissGuideButton() {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => {
        dismissGuide();
        router.push("/");
      }}
    >
      Hide this from Home
    </Button>
  );
}
