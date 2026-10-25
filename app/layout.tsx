import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { PwaRegister } from "@/components/shell/pwa-register";

// Plus Jakarta Sans: a slightly-rounded geometric sans with real character,
// used for both display and body. Loaded via next/font so there is no CDN
// dependency at runtime and no layout shift.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FarmingdaleIQ",
    template: "%s - FarmingdaleIQ",
  },
  description: "FarmingdaleIQ: shift setups, checklists, tasks, and team tools for the store.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FarmingdaleIQ",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  other: {
    // Next's `appleWebApp.capable` only emits the modern
    // `mobile-web-app-capable` meta tag; older iOS Safari (pre-17.4) only
    // recognizes the apple-prefixed one, so set both.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#E51636",
  // Draw under the iOS home indicator so env(safe-area-inset-*) is non-zero.
  // The fixed bottom tab bar relies on that inset to lift its tap targets clear
  // of the home-swipe gesture zone; without cover the inset is 0 and the tabs
  // sit under the indicator where taps get eaten.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
