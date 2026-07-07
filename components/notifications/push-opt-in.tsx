"use client";

import { useState } from "react";
import { Bell, BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveMyPushSubscription } from "@/app/(app)/notifications/actions";

/**
 * PWA push opt-in (ARCHITECTURE.md "Notifications" > Delivery: "Web Push
 * via service worker (users on iPhone must add the PWA to their home
 * screen; the app will prompt with instructions)"). The iOS "add to home
 * screen" instruction flow itself is P0's `components/shell/pwa-register.tsx`;
 * this component is the next step once installed — actually asking for
 * Notification permission and registering a push subscription.
 *
 * Requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (see lib/notify/push.ts). Renders
 * nothing if that isn't configured, Notifications aren't supported, or the
 * user already granted/denied permission — this is meant to appear once,
 * not nag every visit.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function PushOptIn() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  if (!vapidPublicKey || !supported || dismissed) return null;
  if (typeof window !== "undefined" && Notification.permission !== "default") return null;

  const enable = async () => {
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("error");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const json = subscription.toJSON();
      const result = await saveMyPushSubscription({
        endpoint: json.endpoint ?? "",
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });

      setStatus(result.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {status === "done" ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          Turn on push notifications
        </CardTitle>
        <CardDescription>
          Get an alert on this device for schedule posts, to-dos, and recognitions.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Button size="sm" disabled={status === "working" || status === "done"} onClick={enable}>
          {status === "done" ? "Enabled" : status === "working" ? "Enabling..." : "Enable"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          Not now
        </Button>
        {status === "error" && (
          <p className="text-sm text-destructive">Couldn&apos;t enable notifications.</p>
        )}
      </CardContent>
    </Card>
  );
}
