# Catering email ingestion

CFA catering order emails become app orders automatically:

```
CFA catering system (sends order notifications directly)
  -> dedicated Gmail inbox (Apps Script checks every minute)
  -> POST /api/inbound/catering (secret-protected)
  -> catering order created at NEW stage (+ checklists, + contact)
  -> catering_order_new event -> Discord outbox -> #catering summary card
```

Parser: `lib/catering/inbound-email.ts` (built from the real order 04093
sample). Route: `app/api/inbound/catering/route.ts`. Duplicates are keyed on
the CFA order number (`catering_orders.source = "email:<number>"`), so retries
and re-forwards never double-create. Unparseable emails still create a
NEEDS REVIEW stub order with the raw email in its notes.

## One-time setup (Naldo)

### 1. Vercel secret

Vercel project -> Settings -> Environment Variables -> add
`CATERING_INBOUND_SECRET` = a long random string (e.g. from a password
generator; 32+ chars). Redeploy. Without it the route rejects everything.

### 2. Dedicated Gmail + direct CFA delivery

1. Create (or reuse) a dedicated Gmail inbox for catering orders, e.g.
   `cfafarmingdalecatering@gmail.com`.
2. In the CFA catering admin, add that address as a recipient of the
   "Incoming Catering Order" notifications, so orders arrive directly -- no
   forwarding rule needed. (The parser also tolerates forwarded copies.)

### 3. Gmail Apps Script

The script runs inside that Gmail account on Google's servers -- nobody else
ever holds the mailbox credentials.

1. Go to https://script.google.com while signed in as the dedicated account ->
   New project. Name it `FIQ catering ingest`.
2. Paste the script below. Fill in `ENDPOINT` (production URL) and `SECRET`
   (same value as step 1).
3. Run `setup` once (grants Gmail permission, creates the every-minute
   trigger and the `fiq-ingested` label).

```javascript
const ENDPOINT = "https://YOUR-PRODUCTION-DOMAIN/api/inbound/catering";
const SECRET = "PASTE-CATERING_INBOUND_SECRET-HERE";
const LABEL = "fiq-ingested";
const QUERY = 'subject:"Incoming Catering Order" newer_than:2d -label:' + LABEL;

function setup() {
  GmailApp.createLabel(LABEL);
  ScriptApp.newTrigger("ingest").timeBased().everyMinutes(1).create();
  ingest();
}

function ingest() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const threads = GmailApp.search(QUERY, 0, 10);
  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      const response = UrlFetchApp.fetch(ENDPOINT, {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + SECRET },
        payload: JSON.stringify({
          subject: message.getSubject(),
          body: message.getPlainBody(),
          messageId: message.getId(),
        }),
        muteHttpExceptions: true,
      });
      if (response.getResponseCode() !== 200) {
        console.error("ingest failed", response.getResponseCode(), response.getContentText());
        return; // leave unlabeled so the next run retries
      }
    }
    thread.addLabel(label);
  }
}
```

Notes: the label marks processed threads; the server-side duplicate guard
makes retries safe even if labeling fails. `newer_than:2d` keeps the search
cheap.

### 4. Discord channel

Discord server -> #catering channel -> Settings -> Integrations -> Webhooks ->
New Webhook -> copy URL. In FarmingdaleIQ: Settings -> Discord -> add the
channel with that webhook URL, then route the `catering_order_new` event to it.

## Testing end to end

Forward any real catering order email to the dedicated inbox (or wait for the
next real one). Within ~1 minute: order appears in Catering at the New
stage, and the summary card posts to #catering. Re-forwarding the same email
must NOT create a second order.
