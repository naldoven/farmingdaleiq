import { notFound } from "next/navigation";

import { DEFAULT_EXPIRY_DAYS } from "@/app/(app)/guest-recovery/constants";
import { GuestRecoveryTabs } from "@/components/guest-recovery/section-tabs";
import { SettingsForm, type PersonOption } from "@/components/guest-recovery/settings-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /guest-recovery/menu/settings: managers choose how long a guest's code is good
 * for and who sends the Spotlight rewards (overseer and backup).
 */
export const metadata = { title: "Recovery settings" };

export default async function RecoverySettingsPage() {
  if (!(await hasPermission("guest_recovery.manage"))) notFound();

  const supabase = await createClient();

  const { data: settings, error: settingsError } = await supabase
    .from("guest_recovery_settings")
    .select("expiry_days, overseer_id, backup_id, store_phone")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) throw new Error(`Could not load the settings: ${settingsError.message}`);

  const { data: roleRows, error: roleError } = await supabase
    .from("role_permissions")
    .select("role_id")
    .eq("permission_key", "guest_recovery.log");
  if (roleError) throw new Error(`Could not load roles: ${roleError.message}`);
  const roleIds = (roleRows ?? []).map((r) => r.role_id);

  let people: PersonOption[] = [];
  if (roleIds.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name")
      .in("role_id", roleIds)
      .eq("active", true)
      .order("name");
    if (error) throw new Error(`Could not load people: ${error.message}`);
    people = data ?? [];
  }

  return (
    <div className="mx-auto max-w-[480px] space-y-4">
      <GuestRecoveryTabs group="setup" />
      <p className="text-[15px] text-muted-ink">
        Spotlight guests have the Chick-fil-A app. Their reward is sent by hand by the overseer.
      </p>
      <SettingsForm
        people={people}
        expiryDays={settings?.expiry_days ?? DEFAULT_EXPIRY_DAYS}
        overseerId={settings?.overseer_id ?? null}
        backupId={settings?.backup_id ?? null}
        storePhone={settings?.store_phone ?? null}
      />
    </div>
  );
}
