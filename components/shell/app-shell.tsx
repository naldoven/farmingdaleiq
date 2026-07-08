/**
 * Back-compat re-export. The responsive AppShell now lives under
 * components/mobile so the whole mobile design system sits in one place.
 * Existing imports of "@/components/shell/app-shell" keep working.
 */
export { AppShell, type CurrentUser, type AppShellProps } from "@/components/mobile/app-shell";
