# Guest Recovery: going live

The screens work as soon as the migration is applied. Email and texts need the
steps below. Until they are done, a leader can still log a recovery, copy the
link, and read the guest the message.

## 1. Apply the migration

`supabase/migrations/20261102000000_guest_recovery.sql` is safe before the code
ships: nothing reads its tables until the screens do. It creates the tables, the
menu (seeded), and gives `guest_recovery.log` to Team Leader and above and
`guest_recovery.manage` to Shift Supervisor and above.

## 2. Email (Resend)

1. Buy a store domain (for example one that mirrors Avondale's). Keep it separate
   from the app address.
2. In Resend, add the domain and copy the DNS records it shows into the domain's
   DNS. Wait until Resend says Verified.
3. Create an API key. In Vercel, set:
   - `RESEND_API_KEY`
   - `GUEST_EMAIL_FROM`, for example `Chick-fil-A Farmingdale <recovery@yourdomain>`
   - `GUEST_EMAIL_REPLY_TO`, the store inbox that should get guest replies
   - `NEXT_PUBLIC_APP_URL`, the address guests' links open (no trailing slash)

## 3. Texts (Twilio)

Texting is off until `GUEST_SMS_ENABLED` is exactly `true`.

1. Create a Twilio account under the store's legal business name. Add a card.
2. Trust Hub: fill in the business profile (legal name, EIN, address, contact).
   The name must match the EIN record.
3. Register the brand, then a campaign (use case: customer care). It needs
   sample messages, how guests agree to texts (the leader asks on the call and
   ticks the box in the app), and a public page with a privacy policy and SMS
   terms.
4. Buy a local 631 number. Set in Vercel: `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.
5. When Twilio approves the campaign, set `GUEST_SMS_ENABLED=true`.

Rules the app already follows: a text only goes to a guest who agreed to one,
never to a number that replied STOP, and never carries a promotion. Have your
attorney or franchise contact read the final wording.

## 4. Test it

1. As a leader, log a recovery with your own email.
2. The email arrives with the item, the Show my code button and a QR.
3. Open the link signed out: it shows your first name and the items only.
4. Open it signed in as a leader: it lands on the redeem screen.
5. Tap Given. Scan again: it says already handed over.
