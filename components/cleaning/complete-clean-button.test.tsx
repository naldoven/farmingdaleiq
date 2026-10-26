import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, downscale } = vi.hoisted(() => ({ refresh: vi.fn(), downscale: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/images/client-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/images/client-image")>()),
  downscaleImageToJpeg: downscale,
}));

import { CompleteCleanButton } from "@/components/cleaning/complete-clean-button";

const ASSIGNMENT = "a1111111-1111-4111-8111-111111111111";

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

function setup(props: Partial<React.ComponentProps<typeof CompleteCleanButton>> = {}) {
  const view = render(<CompleteCleanButton assignmentId={ASSIGNMENT} itemName="Mop sink" ifNeeded={false} {...props} />);
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...view, input };
}

async function takePhoto(input: HTMLInputElement) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [original()] } });
  });
}

function sentPayload(call = 0) {
  const [url, init] = fetchMock.mock.calls[call]!;
  const body = init.body as FormData;
  return { url, init, photo: body.get("photo") as File, payload: JSON.parse(body.get("payload") as string) };
}

describe("CompleteCleanButton", () => {
  it("opens the rear camera when Done is tapped", () => {
    const { input } = setup();
    expect(input).toHaveAttribute("capture", "environment");
    expect(input).toHaveAttribute("accept", "image/*");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("shrinks the photo, posts it with the clean's id and a fresh photo id, then refreshes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, status: "done" }));
    const { input } = setup();

    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(downscale).toHaveBeenCalledTimes(1);
    const sent = sentPayload();
    expect(sent.url).toBe("/api/cleaning/complete");
    expect(sent.init.method).toBe("POST");
    expect(sent.photo).toBeInstanceOf(File);
    expect(sent.photo.type).toBe("image/jpeg");
    expect(sent.payload).toEqual({
      assignmentId: ASSIGNMENT,
      photoId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      notNeeded: false,
    });
  });

  it("offers 'Checked, not needed' only for an if-needed clean", () => {
    setup();
    expect(screen.queryByRole("button", { name: /Checked, not needed/ })).toBeNull();
    cleanup();
    setup({ ifNeeded: true });
    expect(screen.getByRole("button", { name: /Checked, not needed/ })).toBeInTheDocument();
  });

  it("sends notNeeded for 'Checked, not needed', and still needs a photo", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, status: "done" }));
    const { input } = setup({ ifNeeded: true });
    const click = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: /Checked, not needed/ }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    await takePhoto(input);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sentPayload().payload.notNeeded).toBe(true);
    expect(sentPayload().photo).toBeInstanceOf(File);
  });

  it("keeps the shot after a failure: Retry resends the same photo id and the same photo, with no new capture", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { ok: false, error: "Could not save. Tap Retry." }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, status: "done" }));
    const { input } = setup();

    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Tap Retry.");
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Retry/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(downscale).toHaveBeenCalledTimes(1);
    expect(sentPayload(1).payload.photoId).toBe(sentPayload(0).payload.photoId);
    expect(sentPayload(1).payload.notNeeded).toBe(false);
  });

  it("keeps the not-needed choice on Retry", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, status: "done" }));
    const { input } = setup({ ifNeeded: true });

    fireEvent.click(screen.getByRole("button", { name: /Checked, not needed/ }));
    await takePhoto(input);
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection");

    fireEvent.click(screen.getByRole("button", { name: /^Retry/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sentPayload(1).payload.notNeeded).toBe(true);
  });

  it("reads a redirect to the login page as signed out, never as a saved clean", async () => {
    fetchMock.mockResolvedValue(new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }));
    const { input } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    expect(await screen.findByRole("alert")).toHaveTextContent("Signed out");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Retry/ })).toBeInTheDocument();
  });

  it("reads a followed redirect as signed out even when the final page is JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }, { redirected: true }));
    const { input } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    expect(await screen.findByRole("alert")).toHaveTextContent("Signed out");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads a 401 answer as signed out", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { ok: false, error: "Sign in again to keep saving." }));
    const { input } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    expect(await screen.findByRole("alert")).toHaveTextContent("Signed out");
  });

  it("treats 'someone else already finished it' as success and refreshes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, status: "already_done" }));
    const { input } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the server's message and refreshes when the clean is no longer open", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { ok: false, error: "This clean is no longer open." }));
    const { input } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("'New photo' drops the held shot and the next shot gets a fresh photo id", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { ok: false, error: "Could not save. Tap Retry." }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, status: "done" }));
    const { input } = setup();

    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: /^New photo/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(sentPayload(1).payload.photoId).not.toBe(sentPayload(0).payload.photoId);
  });

  it("removes the buttons while a photo is on its way, so a second tap has nothing to hit", async () => {
    let finish: (res: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    const { input } = setup();

    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    expect(await screen.findByRole("status")).toHaveTextContent("Sending photo...");
    expect(screen.queryByRole("button", { name: /^Done/ })).toBeNull();

    // A second photo arriving mid-send (a stray second change event) is ignored.
    await takePhoto(input);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => finish(jsonResponse(200, { ok: true, status: "done" })));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not send a photo format the server would refuse", async () => {
    downscale.mockResolvedValue(new Blob([new Uint8Array([0, 0, 0, 0x18])], { type: "image/heic" }));
    const { input } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await takePhoto(input);

    expect(await screen.findByRole("alert")).toHaveTextContent("format the app can't read");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Done/ })).toBeInTheDocument();
  });
});
