import { describe, expect, it } from "vitest";

import { decideSend, MAX_SEND_ATTEMPTS, retryDelayMs, type SendOutcome } from "./send-policy";

const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504, 599];
const HOLD_AT_ONCE_STATUSES = [400, 401, 403, 404, 405, 409, 410, 413, 415, 422, 451, 499];
// Not a real failure answer. Marking these done could drop an unconfirmed photo.
const UNEXPECTED_STATUSES = [0, 100, 200, 204, 301, 304, 399, 600, 999, Number.NaN];

describe("decideSend: ok", () => {
  it("is done on any attempt count", () => {
    for (const attempts of [0, 1, 5, MAX_SEND_ATTEMPTS, MAX_SEND_ATTEMPTS + 1, 100]) {
      expect(decideSend({ kind: "ok" }, attempts)).toBe("done");
    }
  });
});

describe("decideSend: failures a later try could fix", () => {
  const retryable: SendOutcome[] = [
    { kind: "network" },
    ...RETRYABLE_STATUSES.map((status): SendOutcome => ({ kind: "http", status })),
  ];

  it("retries on every attempt below the cap", () => {
    for (const outcome of retryable) {
      for (let attempts = 1; attempts < MAX_SEND_ATTEMPTS; attempts++) {
        expect(decideSend(outcome, attempts), `${JSON.stringify(outcome)} @ ${attempts}`).toBe("retry");
      }
    }
  });

  it("holds once the cap is reached, and stays held past it", () => {
    for (const outcome of retryable) {
      for (const attempts of [MAX_SEND_ATTEMPTS, MAX_SEND_ATTEMPTS + 1, 50]) {
        expect(decideSend(outcome, attempts), `${JSON.stringify(outcome)} @ ${attempts}`).toBe("hold");
      }
    }
  });

  it("boundary: the last retry is attempt cap-1, the first hold is the cap", () => {
    expect(decideSend({ kind: "network" }, MAX_SEND_ATTEMPTS - 1)).toBe("retry");
    expect(decideSend({ kind: "network" }, MAX_SEND_ATTEMPTS)).toBe("hold");
  });

  it("treats a count of 0 (nothing tried yet) as still retryable", () => {
    expect(decideSend({ kind: "network" }, 0)).toBe("retry");
  });

  it("covers 408, 429 and the whole 5xx range", () => {
    expect(decideSend({ kind: "http", status: 408 }, 1)).toBe("retry");
    expect(decideSend({ kind: "http", status: 429 }, 1)).toBe("retry");
    expect(decideSend({ kind: "http", status: 500 }, 1)).toBe("retry");
    expect(decideSend({ kind: "http", status: 599 }, 1)).toBe("retry");
  });
});

describe("decideSend: failures that need a person", () => {
  it("holds any other 4xx immediately, on the first failure", () => {
    for (const status of HOLD_AT_ONCE_STATUSES) {
      expect(decideSend({ kind: "http", status }, 1), `status ${status}`).toBe("hold");
    }
  });

  it("holds a non-retryable 4xx at every attempt count too", () => {
    for (const attempts of [0, 1, 3, MAX_SEND_ATTEMPTS, 50]) {
      expect(decideSend({ kind: "http", status: 400 }, attempts)).toBe("hold");
    }
  });

  it("holds the statuses it does not expect rather than calling them done or retrying", () => {
    for (const status of UNEXPECTED_STATUSES) {
      expect(decideSend({ kind: "http", status }, 1), `status ${status}`).toBe("hold");
    }
  });
});

describe("decideSend: a photo is never dropped", () => {
  it("never answers done for anything but ok", () => {
    const failures: SendOutcome[] = [
      { kind: "network" },
      ...[...RETRYABLE_STATUSES, ...HOLD_AT_ONCE_STATUSES, ...UNEXPECTED_STATUSES].map(
        (status): SendOutcome => ({ kind: "http", status }),
      ),
    ];
    for (const outcome of failures) {
      for (let attempts = 0; attempts <= 20; attempts++) {
        expect(["retry", "hold"]).toContain(decideSend(outcome, attempts));
      }
    }
  });
});

describe("retryDelayMs", () => {
  it("starts at 2 seconds and grows by 2 seconds a try", () => {
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(2)).toBe(4000);
    expect(retryDelayMs(3)).toBe(6000);
    expect(retryDelayMs(7)).toBe(14000);
  });

  it("stops at 15 seconds", () => {
    expect(retryDelayMs(8)).toBe(15000);
    expect(retryDelayMs(50)).toBe(15000);
    expect(retryDelayMs(Number.POSITIVE_INFINITY)).toBe(15000);
  });

  it("never shrinks as attempts grow, and stays between 2s and 15s", () => {
    let previous = 0;
    for (let attempt = 1; attempt <= 30; attempt++) {
      const delay = retryDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(15000);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  it("gives the shortest delay for a bad attempt count instead of a nonsense one", () => {
    expect(retryDelayMs(0)).toBe(2000);
    expect(retryDelayMs(-3)).toBe(2000);
    expect(retryDelayMs(Number.NaN)).toBe(2000);
  });

  it("pins the total automatic wait before a photo is held (2+4+6+8+10 = 30s)", () => {
    // A change here changes how long a leader's phone keeps trying through a
    // dead zone before showing a "tap to retry" state. Make it on purpose.
    let total = 0;
    for (let attempt = 1; attempt < MAX_SEND_ATTEMPTS; attempt++) total += retryDelayMs(attempt);
    expect(total).toBe(30000);
  });
});

describe("MAX_SEND_ATTEMPTS", () => {
  it("is 6", () => {
    expect(MAX_SEND_ATTEMPTS).toBe(6);
  });
});
