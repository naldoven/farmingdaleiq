import fs from "node:fs";

import { ADMIN_INFO_PATH, type AdminFixtureInfo } from "../global-setup";

/** Reads the ephemeral admin test user's id/email written by global-setup.ts. */
export function readAdminInfo(): AdminFixtureInfo {
  return JSON.parse(fs.readFileSync(ADMIN_INFO_PATH, "utf-8"));
}
