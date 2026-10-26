import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, downscale } = vi.hoisted(() => ({ refresh: vi.fn(), downscale: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/images/client-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/images/client-image")>()),
  downscaleImageToJpeg: downscale,
}));

import { FindPostButton } from "@/components/cleaning/find-post-button";

const ZONES = [
  { id: "a1111111-1111-4111-8111-111111111111", name: "Walk-in", color: "#16A34A", side: "boh" },
  { id: "b2222222-2222-4222-8222-222222222222", name: "Fryer line", color: "#E51636", side: "boh" },
  { id: "c3333333-3333-4333-8333-333333333333", name: "Front counter", color: "#2563EB", side: "foh" },
];

function jsonResponse(status: number, body: unknown, init: { redirected?: boolean } = {}) {
  const res = new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (init.redirected) Object.defineProperty(res, "redirected", { value: true });
  return res;
}

const shrunk = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });
const original = () => new File([new Uint8Array([1, 2, 3])], "IMG_1.jpg", { type: "image/jpeg" });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  refresh.mockReset();
  downscale.mockReset();
  downscale.mockResolvedValue(shrunk());
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(zones = ZONES) {
  const view = render(<FindPostButton zones={zones} />);
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...view, input };
}

async function takePhoto(input: HTMLInputElement) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [original()] } });
  });
}

/** Photo taken, sheet open. */
async function openSheet() {
  const made = setup();
  fireEvent.click(screen.getByRole("button", { name: "Post a find" }));
  await takePhoto(made.input);
  const dialog = await screen.findByRole("dialog");
  return { ...made, dialog };
}

function fill(zoneName: string, note: string) {
  fireEvent.click(screen.getByRole("button", { name: zoneName }));
  fireEvent.change(screen.getByLabelText("What did you find?"), { target: { value: note } });
}

const postButton = () => screen.getByRole("button", { name: /^(Post|Retry)$/ });

function sentPayload(call = 0) {
  const [url, init] = fetchMock.mock.calls[call]!;
  const body = init.body as FormData;
  return { url, init, photo: body.get("photo") as File, payload: JSON.parse(body.get("payload") as string) };
}

describe("FindPostButton", () => {
  it("opens the rear camera when Post a find is tapped", () => {
    const { input } = setup();
    expect(input).toHaveAttribute("capture", "environment");
    expect(input).toHaveAttribute("accept", "image/*");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Post a find" }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("shrinks the photo, then offers only the areas it was given", async () => {
    const { dialog } = await openSheet();
    expect(downscale).toHaveBeenCalledTimes(1);
    const areas = within(within(dialog).getByRole("group", { name: "Area" }));
    expect(areas.getAllByRole("button").map((b) => b.textContent)).toEqual(["Walk-in", "Fryer line", "Front counter"]);
  });

  it("will not post until an area is picked and a note is written", async () => {
    await openSheet();
    expect(postButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Fryer line" }));
    expect(postButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What did you find?"), { target: { value: "   " } });
    expect(postButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What did you find?"), { target: { value: "Grease behind the fryer" } });
    expect(postButton()).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps the note at 200 characters and shows the count", async () => {
    await openSheet();
    const note = screen.getByLabelText("What did you find?");
    expect(note).toHaveAttribute("maxlength", "200");
    fireEvent.change(note, { target: { value: "Vent was dusty" } });
    expect(screen.getByText("14/200")).toBeInTheDocument();
  });

  it("posts the photo with a fresh photo id, the area and the trimmed note, then refreshes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "posted" }));
    await openSheet();
    fill("Fryer line", "  Grease behind the fryer  ");
    fireEvent.click(postButton());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const sent = sentPayload();
    expect(sent.url).toBe("/api/cleaning/finds");
    expect(sent.init.method).toBe("POST");
    expect(sent.photo).toBeInstanceOf(File);
    expect(sent.photo.type).toBe("image/jpeg");
    expect(sent.payload).toEqual({
      photoId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      zoneId: ZONES[1]!.id,
      note: "Grease behind the fryer",
    });
    // The sheet closes and the form starts empty for the next find.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("starts the next find with nothing picked", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "posted" }));
    const { input } = await openSheet();
    fill("Walk-in", "Shelf label peeling");
    fireEvent.click(postButton());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await waitFor(() => expect(screen.getByRole("button", { name: "Post a find" })).toBeInTheDocument());
    await takePhoto(input);
    await screen.findByRole("dialog");
    expect(screen.getByLabelText("What did you find?")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Walk-in" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the shot after a failed send, and Retry reuses the same photo id", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { ok: false, error: "Could not store the photo. Tap Retry." }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "posted" }));
    await openSheet();
    fill("Fryer line", "Grease behind the fryer");
    fireEvent.click(postButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not store the photo. Tap Retry.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText("What did you find?")).toHaveValue("Grease behind the fryer");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentPayload(1).payload.photoId).toBe(sentPayload(0).payload.photoId);
    // The photo is not shrunk again for a retry.
    expect(downscale).toHaveBeenCalledTimes(1);
  });

  it("asks to retry when the network is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await openSheet();
    fill("Walk-in", "Dusty vent");
    fireEvent.click(postButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection. Tap Retry when you are back online.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("reads a redirect to the login page as signed out, not as a saved find", async () => {
    fetchMock.mockResolvedValue(new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }));
    await openSheet();
    fill("Walk-in", "Dusty vent");
    fireEvent.click(postButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Signed out. Sign in again, then tap Retry.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads a redirected JSON answer as signed out too", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }, { redirected: true }));
    await openSheet();
    fill("Walk-in", "Dusty vent");
    fireEvent.click(postButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Signed out");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads a 401 as signed out", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { ok: false, error: "Sign in again to keep saving." }));
    await openSheet();
    fill("Walk-in", "Dusty vent");
    fireEvent.click(postButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Signed out. Sign in again, then tap Retry.");
  });

  it("shows the server's reason for a refusal, such as an area switched off", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { ok: false, error: "That area is not available. Pick another one." }));
    await openSheet();
    fill("Front counter", "Sticky floor");
    fireEvent.click(postButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("That area is not available. Pick another one.");
  });

  it("sends once when Post is tapped twice", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    await openSheet();
    fill("Walk-in", "Dusty vent");
    const post = postButton();
    fireEvent.click(post);
    fireEvent.click(post);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sending..."));
  });

  it("uses a new photo id after Retake photo, keeping the area and note", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { ok: false, error: "Could not save. Tap Retry." }))
      .mockResolvedValueOnce(jsonResponse(201, { ok: true, status: "posted" }));
    const { input } = await openSheet();
    fill("Fryer line", "Grease behind the fryer");
    fireEvent.click(postButton());
    await screen.findByRole("alert");

    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Retake photo" }));
    expect(click).toHaveBeenCalledTimes(1);
    await takePhoto(input);
    await waitFor(() => expect(downscale).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());

    fireEvent.click(postButton());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(sentPayload(1).payload.photoId).not.toBe(sentPayload(0).payload.photoId);
    expect(sentPayload(1).payload).toMatchObject({ zoneId: ZONES[1]!.id, note: "Grease behind the fryer" });
  });

  it("throws the shot away when the sheet is closed, and sends nothing", async () => {
    await openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Post a find" })).toBeEnabled();
  });

  it("refuses a photo the server cannot read, with no sheet", async () => {
    downscale.mockResolvedValue(new Blob([new Uint8Array([1])], { type: "image/heic" }));
    const { input } = setup();
    await takePhoto(input);
    expect(await screen.findByRole("alert")).toHaveTextContent("format the app can't read");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the photo it took and lets go of the preview when the sheet closes", async () => {
    // jsdom has no object URLs; add them for this test and put the page back after.
    const urls = URL as unknown as Record<string, unknown>;
    const createObjectURL = vi.fn(() => "blob:preview-1");
    const revokeObjectURL = vi.fn();
    urls.createObjectURL = createObjectURL;
    urls.revokeObjectURL = revokeObjectURL;
    try {
      await openSheet();
      expect(screen.getByAltText("The photo you took")).toHaveAttribute("src", "blob:preview-1");

      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    } finally {
      delete urls.createObjectURL;
      delete urls.revokeObjectURL;
    }
  });

  it("disables the button and says why when no areas are switched on", () => {
    setup([]);
    expect(screen.getByRole("button", { name: "Post a find" })).toBeDisabled();
    expect(screen.getByText(/No areas are set up yet/)).toBeInTheDocument();
  });
});
