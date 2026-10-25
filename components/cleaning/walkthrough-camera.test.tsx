import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WalkthroughCamera } from "@/components/cleaning/walkthrough-camera";
import { setShotStoreBackendForTest, type ShotStoreBackend, type StoredShot } from "@/lib/cleaning/shot-queue-storage";

/**
 * The walkthrough camera end to end on the client: a photo goes in, details
 * get filled, the upload runs, and every server answer lands in the right
 * queue state. jsdom has no camera, so the live viewfinder shows its
 * "blocked" fallback and photos come in through the phone-camera file input,
 * which runs the same queue and send path as the shutter.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ZONE_GREEN = "11111111-1111-4111-8111-111111111111";
const ZONE_BLUE = "22222222-2222-4222-8222-222222222222";
const ITEM_MOP = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";

const zones = [
  { id: ZONE_GREEN, name: "Green", color: "#16A34A", side: "boh" },
  { id: ZONE_BLUE, name: "Blue", color: "#1D4ED8", side: "boh" },
];
const items = [
  { id: ITEM_MOP, zone_id: ZONE_BLUE, name: "Mop sink", kind: "constant", days_of_week: [5], half: "pm", interval_weeks: null },
];

function memoryStore(initial: StoredShot[] = []) {
  const rows = new Map(initial.map((s) => [s.id, s]));
  const backend: ShotStoreBackend = {
    async put(shot) {
      rows.set(shot.id, shot);
      return true;
    },
    async setPayload(id, payload) {
      const row = rows.get(id);
      if (!row) return false;
      rows.set(id, { ...row, payload });
      return true;
    },
    async delete(id) {
      rows.delete(id);
      return true;
    },
    async getAll() {
      return [...rows.values()];
    },
  };
  return { rows, backend };
}

function jsonResponse(status: number, body: unknown, init: { redirected?: boolean } = {}) {
  const res = new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (init.redirected) Object.defineProperty(res, "redirected", { value: true });
  return res;
}

function jpegFile() {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "shot.jpg", { type: "image/jpeg" });
}

async function addPhoto(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [jpegFile()] } });
  });
  return screen.findByText("Photo details");
}

function fillVariable(name: string) {
  fireEvent.change(screen.getByPlaceholderText("What needs cleaning?"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Variable" }));
  fireEvent.click(screen.getByRole("button", { name: "6 wks" }));
}

let store: ReturnType<typeof memoryStore>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = memoryStore();
  setShotStoreBackendForTest(store.backend);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  setShotStoreBackendForTest(null);
  vi.unstubAllGlobals();
});

describe("WalkthroughCamera", () => {
  it("falls back to the phone camera when the live camera is unavailable", async () => {
    render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);
    expect(await screen.findByText("The camera is blocked for this site.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
  });

  it("saves a new item: details on the spot, one upload, shot cleared from the phone", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, itemId: "x", duplicate: false }));
    const { container } = render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);

    await addPhoto(container);
    expect(store.rows.size).toBe(1);
    fillVariable("Vent above boards");
    fireEvent.click(screen.getByRole("button", { name: "Save and keep shooting" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cleaning/walkthrough");
    const payload = JSON.parse((init.body as FormData).get("payload") as string);
    expect(payload.captureSource).toBe("file");
    expect(payload.target).toEqual({
      mode: "new",
      details: expect.objectContaining({ name: "Vent above boards", kind: "variable", intervalWeeks: 6, zoneId: ZONE_GREEN }),
    });
    await waitFor(() => expect(screen.getByText("1 saved")).toBeInTheDocument());
    expect(store.rows.size).toBe(0);
  });

  it("will not save until the details are complete", async () => {
    const { container } = render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);
    await addPhoto(container);
    fireEvent.click(screen.getByRole("button", { name: "Save and keep shooting" }));
    expect(await screen.findByText("Name the item")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches a photo to an existing item from another zone", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, itemId: ITEM_MOP, duplicate: false }));
    const { container } = render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);
    await addPhoto(container);
    fireEvent.click(screen.getByRole("button", { name: "Already on the list" }));
    fireEvent.click(screen.getByLabelText("Show every zone"));
    fireEvent.click(screen.getByRole("button", { name: /Mop sink/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save and keep shooting" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const payload = JSON.parse((fetchMock.mock.calls[0][1].body as FormData).get("payload") as string);
    expect(payload.target).toEqual({ mode: "existing", itemId: ITEM_MOP });
  });

  it("holds a refused shot with the server's reason and keeps it on the phone", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { ok: false, error: "Check its details." }));
    const { container } = render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);
    await addPhoto(container);
    fillVariable("Bad one");
    fireEvent.click(screen.getByRole("button", { name: "Save and keep shooting" }));
    await waitFor(() => expect(screen.getByText("1 stuck")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.rows.size).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /Photo queue/ }));
    expect(screen.getByText("Check its details.")).toBeInTheDocument();
  });

  it("never treats a login redirect as a save", async () => {
    fetchMock.mockResolvedValue(
      Object.defineProperty(new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }), "redirected", {
        value: true,
      }),
    );
    const { container } = render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);
    await addPhoto(container);
    fillVariable("Prep shelf");
    fireEvent.click(screen.getByRole("button", { name: "Save and keep shooting" }));
    await waitFor(() => expect(screen.getByText("1 stuck")).toBeInTheDocument());
    expect(store.rows.size).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /Photo queue/ }));
    expect(screen.getByText(/Signed out/)).toBeInTheDocument();
  });

  it("retries a server error on its own, then saves", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(500, { ok: false, error: "Could not store the photo." }))
        .mockResolvedValueOnce(jsonResponse(201, { ok: true, itemId: "x", duplicate: false }));
      const { container } = render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);
      await addPhoto(container);
      fillVariable("Walk-in rack 1");
      fireEvent.click(screen.getByRole("button", { name: "Save and keep shooting" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByText("1 saved")).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });

  it("'Later' keeps the shot on the phone and does not send it", async () => {
    const { container } = render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);
    await addPhoto(container);
    fireEvent.change(screen.getByPlaceholderText("What needs cleaning?"), { target: { value: "Half done" } });
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.getByText("1 needs details")).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    const stored = [...store.rows.values()][0].payload as { ready: boolean; form: { details: { name: string } } };
    expect(stored.ready).toBe(false);
    expect(stored.form.details.name).toBe("Half done");
  });

  it("after a closed tab, resends saved shots and waits on unfinished ones", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, itemId: "x", duplicate: true }));
    const form = (name: string) => ({
      mode: "new",
      details: { zoneId: ZONE_GREEN, name, kind: "variable", daysOfWeek: [], half: "pm", intervalWeeks: 2, ifNeeded: false, note: "" },
      existingItemId: null,
      existingItemName: null,
      markup: null,
      captureSource: "live",
    });
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    store = memoryStore([
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", blob, capturedAt: "2026-10-26T22:00:00.000Z", createdAt: 1, payload: { v: 1, aspect: 0.75, form: form("Ready one"), ready: true, userId: USER } },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", blob, capturedAt: "2026-10-26T22:01:00.000Z", createdAt: 2, payload: { v: 1, aspect: 0.75, form: form("Unfinished"), ready: false, userId: USER } },
      // Another leader's ready shot on the same store phone.
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", blob, capturedAt: "2026-10-26T21:00:00.000Z", createdAt: 0, payload: { v: 1, aspect: 0.75, form: form("Not mine"), ready: true, userId: OTHER } },
    ]);
    setShotStoreBackendForTest(store.backend);

    render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const payload = JSON.parse((fetchMock.mock.calls[0][1].body as FormData).get("payload") as string);
    expect(payload.photoId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await waitFor(() => expect(screen.getByText("1 needs details, 1 saved")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.rows.has("cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Photo queue/ }));
    const sheet = screen.getByText("This walk").closest("div")!.parentElement!;
    expect(within(sheet).getByText("Unfinished")).toBeInTheDocument();
    expect(within(sheet).queryByText("Not mine")).not.toBeInTheDocument();
  });

  it("warns when edits after a send did not apply because the first try had landed", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { ok: false, error: "Check its details." }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, itemId: "x", duplicate: true }));
    const { container } = render(<WalkthroughCamera zones={zones} items={items} exitHref="/cleaning/items" userId={USER} />);
    await addPhoto(container);
    fillVariable("First name");
    fireEvent.click(screen.getByRole("button", { name: "Save and keep shooting" }));
    await waitFor(() => expect(screen.getByText("1 stuck")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Photo queue/ }));
    fireEvent.click(screen.getByRole("button", { name: /First name/ }));
    fireEvent.change(await screen.findByPlaceholderText("What needs cleaning?"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and keep shooting" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("1 saved")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Photo queue/ }));
    expect(screen.getByText(/Later changes did not apply/)).toBeInTheDocument();
  });
});
