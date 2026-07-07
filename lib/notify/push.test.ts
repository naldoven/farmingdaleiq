import { describe, expect, it } from "vitest";

import { savePushSubscription } from "@/lib/notify/push";
import { FakeSupabase } from "@/lib/notify/test-support/fake-supabase";

describe("savePushSubscription idempotency", () => {
  it("does not stack duplicate rows when the same endpoint opts in twice", async () => {
    const db = new FakeSupabase({ push_subscriptions: [] });
    const client = db as unknown as Parameters<typeof savePushSubscription>[2];

    const sub = { endpoint: "https://push.example/abc", p256dh: "key1", auth: "auth1" };

    await savePushSubscription("user-1", sub, client);
    await savePushSubscription("user-1", sub, client);

    const rows = db.rowsOf("push_subscriptions");
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe("user-1");
    expect(rows[0].endpoint).toBe(sub.endpoint);
  });

  it("refreshes rotated keys for an existing endpoint instead of duplicating", async () => {
    const db = new FakeSupabase({ push_subscriptions: [] });
    const client = db as unknown as Parameters<typeof savePushSubscription>[2];

    await savePushSubscription("user-1", {
      endpoint: "https://push.example/abc",
      p256dh: "old",
      auth: "old",
    }, client);
    await savePushSubscription("user-1", {
      endpoint: "https://push.example/abc",
      p256dh: "new",
      auth: "new",
    }, client);

    const rows = db.rowsOf("push_subscriptions");
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("new");
    expect(rows[0].auth).toBe("new");
  });

  it("keeps distinct endpoints as separate subscriptions", async () => {
    const db = new FakeSupabase({ push_subscriptions: [] });
    const client = db as unknown as Parameters<typeof savePushSubscription>[2];

    await savePushSubscription("user-1", {
      endpoint: "https://push.example/one",
      p256dh: "k",
      auth: "a",
    }, client);
    await savePushSubscription("user-1", {
      endpoint: "https://push.example/two",
      p256dh: "k",
      auth: "a",
    }, client);

    expect(db.rowsOf("push_subscriptions")).toHaveLength(2);
  });
});
