import fs from "node:fs";
import path from "node:path";

/**
 * Minimal `.env.local` loader for the Playwright config/runner process.
 * Next.js loads `.env.local` automatically for the app itself, but the
 * Playwright config and its globalSetup/globalTeardown run as a separate
 * Node process that does not -- and this repo has no `dotenv` dependency to
 * reach for, so this parses the same handful of `KEY=value` lines
 * `.env.example` documents. Real CI secrets (GitHub Actions `env:`/`secrets:`)
 * are already in `process.env` before this runs, so existing values always
 * win over the file; this only fills in what's missing, for local runs.
 */
export function loadEnvLocal(repoRoot: string): void {
  const envPath = path.join(repoRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf-8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
