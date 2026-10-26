"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog. Hidden on the printed page itself. */
export function PrintButton() {
  return (
    <Button className="h-11 rounded-lg px-5 text-[15px] print:hidden" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden="true" />
      Print
    </Button>
  );
}
