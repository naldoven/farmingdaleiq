# Staff sign-in plan

Status: approved and built 2026-11-16 on branch `naldo/staff-setup-links`.
Step 0 (the dashboard setting) is still Naldo's to do. Source: the 2026-11-16 attempt to add five new leaders
(Jeffery, Andrew, Emily, Cristian, Tiago), the Supabase auth logs from that attempt,
and Naldo's answers the same day.

## The problem

Getting a new person into the app does not work today.

1. **Invite links always fail.** The Invite screen calls `inviteUserByEmail`. The email
   link hands the session back in a `#` fragment, which `app/auth/callback/route.ts`
   cannot read on the server, so every invite lands on "That link is invalid or has
   expired". The first tap still uses up the link, so a second tap fails too. Auth log
   proof: Jeffery's `/verify` succeeded at 22:11:41 UTC, then he hit the login error.
2. **Text and email previews kill links.** The callback uses up the token on a plain
   page load. iMessage, Discord and some email apps open a link to build a preview,
   which can use it up before the person ever taps it.
3. **Links last one hour.** Too short for a manager who texts a link at night.
4. **Email is capped at 2 per hour.** Supabase's built-in sender. The third invite
   (Emily) failed with `over_email_send_rate_limit`, and Forgot password shows
   "Something went wrong" when the cap is hit.
5. **No way in without email.** A manager standing next to a new hire has nothing
   they can do on the spot.

Forgot password links are the one part that works: they use `?token_hash=` and
`verifyOtp` (PR #96).

## What we are building

A manager adds a person and gets a setup link right on the screen, with Copy and
Share buttons, and sends it by text or Discord. No email. The person taps the link,
taps one button, picks a password, and is in. Previews can't use the link up. If a
link expires or someone forgets their password, the manager taps "New setup link" on
that person's profile. A manager can also type a temporary password the person must
change the first time they sign in.

## Decisions (Naldo, 2026-11-16)

| Topic | Decision |
|---|---|
| How new staff get in | Copy/share setup link on the Invite screen. No invite emails. |
| Link expired or forgotten password | "New setup link" button on each profile. |
| Temporary passwords | Allowed. The person must choose a new one at first sign-in. |
| Link lifetime | 24 hours, the most Supabase allows. Never-expiring links are not possible. |
| Who can do this | People who already hold `people.manage` (Location Manager, Director, Assistant Director today), and only on people ranked below them. |
| Build | Plan first. Build after approval, as one PR. |

## Build order

### Step 0. Supabase setting (Naldo, dashboard, one minute)

Authentication, Sign In / Providers, Email: set **Email OTP Expiration** to `86400`.
This also lengthens Forgot password links. No code depends on it, so it can happen
any time.

### Step 1. Shared pieces

- `lib/auth/setup-link.ts` (server only): `makeSetupLink(email)` calls
  `admin.generateLink({ type: "recovery", email })` and returns
  `${origin}/auth/confirm?token_hash=...&type=recovery`. It never logs or stores the
  link. `generateLink` sends no email, so the hourly cap never applies.
- `lib/auth/rank-guard.ts`: a pure `canActOn(actorRank, targetRank, isSelf)` (true only
  when the target ranks strictly below the actor and is not the actor), plus a server
  helper that loads both ranks and throws the same way `requirePermission` does.

### Step 2. Preview-proof link page

- New `app/auth/confirm/page.tsx`. Opening it does nothing to the token. It shows
  "Set up your FarmingdaleIQ password" and one button.
- The button posts to a server action that calls `verifyOtp({ type, token_hash })`
  and redirects to `/set-password`. Failure redirects to `/login?error=auth`.
- Add `/auth/confirm` to `PUBLIC_PATHS` in `lib/supabase/middleware.ts`.
- `/auth/callback`: the `token_hash` branch stops verifying and redirects to
  `/auth/confirm` with the same params. Forgot password emails become preview-proof
  with no email template change. The `?code=` branch stays as it is.

### Step 3. Invite by share link

- Rewrite `inviteUser` in `app/(app)/people/actions.ts`: `admin.createUser({ email,
  email_confirm: true, user_metadata: { name } })` (no password, no email), fill in
  name, role and phone as today, then `makeSetupLink`. Return `{ userId, link }`.
- Remove the `inviteUserByEmail` call.
- `components/people/invite-form.tsx`: after success, show the link once with Copy
  and Share (the phone's share sheet through `navigator.share`) and the line "Send
  this only to {name}. It works once and expires in 24 hours."
- An email that already has an account returns: "{email} already has an account. Use
  New setup link on their profile." No second account, no crash.

### Step 4. "New setup link" on the profile

- New "Sign-in" section on `app/(app)/people/[id]/page.tsx`, shown only when the
  viewer holds `people.manage` and passes the rank guard for that person.
- Server action `newSetupLink(profileId)`: permission check, rank guard, look up the
  email on the server (never taken from the client), `makeSetupLink`, return the link.
  A new link replaces any older one.

### Step 5. Temporary password with forced change

- Same Sign-in section: "Set temporary password" field and button.
- Server action `setTemporaryPassword(profileId, password)`: permission check, rank
  guard, zod minimum of 8 characters (matches `MIN_LENGTH` in the set-password form),
  then `admin.updateUserById(id, { password, app_metadata: { must_change_password:
  true } })`. Use `app_metadata`, never `user_metadata`, because people can edit
  their own `user_metadata`.
- Middleware: a signed-in user with `must_change_password` is sent to `/set-password`
  for every page except `/set-password`, `/auth/*` and the public paths. The
  middleware already calls `getUser()`, which reads fresh from the server, so a
  cleared flag takes effect on the next page load.
- `/set-password`: after `updateUser({ password })` succeeds, call a server action
  that clears the flag for the signed-in user only (service role, own id only).

### Step 6. Rank guard on role changes

Checked 2026-11-16 against the live function. The database privilege guard
(`20260718000000_privilege_guard_rank_and_self.sql`) already blocks changing your own
role and assigning a role senior to your own. It never looks at the target's current
rank, so an Assistant Director could demote a Director or a Location Manager.
`assignRole` now calls the same rank guard, and migration
`20261116000000_privilege_guard_target_rank.sql` adds the rule to the database: a role
or active-status change may only touch someone ranked strictly below the actor. The
database rule matters most: without it, a lower manager could strip a senior's role
through a raw API call and then use the new tools on them. Tested 2026-11-16 against
the live database inside a rolled-back transaction (8 cases, no residue).

### Step 7. Audit trail

Add `people_setup_link_created` and `people_temp_password_set` to `EVENT_KEYS` in
`lib/events/bus.ts` (snake_case like the other keys), emitted with `actor_id` and
`target_id` only. Never the link, never the password. No Discord route.

## Tests first

Write these failing tests before the code:

- `/auth/confirm` page load never calls `verifyOtp`; only the button action does.
- `/auth/callback` with `token_hash` redirects to `/auth/confirm` without verifying.
- `canActOn`: blocks same rank, higher rank and self; allows lower rank.
- `newSetupLink` and `setTemporaryPassword` refuse without `people.manage`, refuse on a
  failed rank guard, and never return or log anything but the link to the caller.
- Invite with an existing email returns the friendly message and creates nothing.
- Temporary password under 8 characters is refused.
- Middleware sends a `must_change_password` user to `/set-password` and lets them
  reach `/set-password` itself.
- The flag clears after a successful password change and not after a failed one.

## Done means

- `npm run typecheck`, `lint`, `test`, `build` all green. Do not run `test:e2e` (it
  hits the live database).
- Draft PR with a plain-English body and the Step 0 dashboard step called out.
- After merge, a real check on prod: add a throwaway address, paste its link into
  iMessage so the preview builds, then open it. It must still work. Then set a
  temporary password on the same test person and confirm the forced change.
- Delete the throwaway account after the check.

## Not in this fix

- Forgot password emails stay capped at 2 per hour. Removing the cap needs a real
  mail service (for example Resend) and Naldo creating that account. Separate
  decision.
- The 7 "Test" accounts from July stay as they are (Naldo, 2026-11-16).
- 18 of 19 staff have no Discord ID linked. The Rollout screen already tracks this.

## Where things stand (2026-11-16)

The five new leaders exist with the right names and roles. Each was sent a setup QR
code generated by a scratch script, because texted links died in previews. Once this
ships, a manager uses New setup link on the profile instead.

Security review notes (2026-11-16):

- Opening a setup or reset link flags the account for a forced password change. A
  manager who opens a subordinate's link themselves therefore replaces that person's
  password, which the person notices, instead of silently using the app as them.
- The forced change is enforced by the middleware on app pages. A flagged session is
  still a real Supabase session, so direct database API calls work until the password
  is changed. Accepted: the person behind it already holds that account's access.
- A setup link is a key inside a URL. It can appear in Vercel request logs and in a
  chat app's preview fetch, and it stays usable until used or expired (24 hours after
  Step 0). Send it only to the person.

Follow-ups, not in this change:

- A lower-ranked manager can still rename a senior through `updateProfile` (name is
  not part of the new database rule).
- The `app_events` insert policy allows any signed-in person to write an event key it
  does not list, which includes the two new audit keys. Gate them on `people.manage`
  in a migration if the audit trail needs to be trusted.
