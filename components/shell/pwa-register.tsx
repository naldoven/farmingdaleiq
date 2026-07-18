"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/** Chrome/Android's install prompt event. Not in lib.dom.d.ts yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "fiq-install-prompt-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIOS && isSafari;
}

/**
 * Registers the service worker on mount and renders an "Install app" prompt:
 * the native `beforeinstallprompt` flow on Chrome/Android/desktop, or
 * Share -> Add to Home Screen instructions on iOS Safari (which has no
 * install event at all).
 */
export function PwaRegister() {
  const hydrated = useHydrated();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [dismissedByUser, setDismissedByUser] = useState(false);

  // Browser facts (UA string, display-mode media query, localStorage) don't
  // exist during SSR, and reading them during the first render made it diverge
  // from the server render on iOS Safari (React #418). They're gated behind
  // `hydrated`, which is false on the server and the first client render and
  // only flips true after hydration, so the first render is always
  // "hidden / not dismissed" and matches SSR exactly.
  const persistedDismissed =
    hydrated &&
    typeof window !== "undefined" &&
    window.localStorage.getItem(DISMISSED_KEY) === "1";
  const dismissed = dismissedByUser || persistedDismissed;
  const showIOSInstructions = hydrated && !isStandalone() && isIOSSafari();

  // Register the service worker once on mount.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed", err);
      });
    }
  }, []);

  useEffect(() => {
    if (isStandalone() || dismissed) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [dismissed]);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setDismissedByUser(true);
    setDeferredPrompt(null);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (dismissed) return null;
  if (!deferredPrompt && !showIOSInstructions) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 md:px-0">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
          FIQ
        </span>
        <div className="min-w-0 flex-1">
          {deferredPrompt ? (
            <>
              <p className="text-sm font-medium">Install FarmingdaleIQ</p>
              <p className="text-xs text-muted-foreground">
                Add it to your home screen for faster access.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Install FarmingdaleIQ</p>
              <p className="text-xs text-muted-foreground">
                Tap Share, then &quot;Add to Home Screen&quot;.
              </p>
            </>
          )}
        </div>
        {deferredPrompt ? (
          <Button size="sm" onClick={handleInstall} className="shrink-0 gap-1.5">
            <Download className="h-4 w-4" />
            Install
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss install prompt"
          onClick={dismiss}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
