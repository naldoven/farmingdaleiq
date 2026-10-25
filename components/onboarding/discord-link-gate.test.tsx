import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const linkMyDiscordId = vi.hoisted(() => vi.fn<(input: { discordUserId: string }) => Promise<Result>>());
const sendMyDiscordTestPing = vi.hoisted(() =>
  vi.fn<() => Promise<Result<{ queued: boolean; delivered: boolean }>>>(),
);
const skipDiscordLinkForNow = vi.hoisted(() => vi.fn<() => Promise<Result>>());
vi.mock("@/app/(app)/onboarding/discord-link/actions", () => ({
  linkMyDiscordId: (input: { discordUserId: string }) => linkMyDiscordId(input),
  sendMyDiscordTestPing: () => sendMyDiscordTestPing(),
  skipDiscordLinkForNow: () => skipDiscordLinkForNow(),
}));

import { DiscordLinkGate } from "./discord-link-gate";

const GOOD_ID = "123456789012345678";

beforeEach(() => {
  vi.clearAllMocks();
  linkMyDiscordId.mockResolvedValue({ ok: true, data: undefined });
  sendMyDiscordTestPing.mockResolvedValue({ ok: true, data: { queued: true, delivered: true } });
  skipDiscordLinkForNow.mockResolvedValue({ ok: true, data: undefined });
});

afterEach(() => {
  cleanup();
});

async function saveId() {
  fireEvent.change(screen.getByLabelText("Discord user ID"), { target: { value: GOOD_ID } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("button", { name: "Send me a test ping" });
}

describe("DiscordLinkGate", () => {
  it("starts on the paste-and-save step", () => {
    render(<DiscordLinkGate />);

    expect(screen.getByLabelText("Discord user ID")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Send me a test ping" })).not.toBeInTheDocument();
  });

  it("after a successful save shows the ping step, Done, and the no-ping help, without refreshing", async () => {
    render(<DiscordLinkGate />);

    await saveId();

    expect(linkMyDiscordId).toHaveBeenCalledWith({ discordUserId: GOOD_ID });
    expect(screen.getByText("Discord linked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByText(/No ping\?/)).toBeInTheDocument();
    // A refresh here would re-run the layout, which would drop the gate.
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stays on the form and shows the message when the save is refused", async () => {
    linkMyDiscordId.mockResolvedValue({
      ok: false,
      error: "That Discord ID is already linked to another person.",
    });
    render(<DiscordLinkGate />);

    fireEvent.change(screen.getByLabelText("Discord user ID"), { target: { value: GOOD_ID } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("That Discord ID is already linked to another person."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send me a test ping" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Discord user ID")).toBeInTheDocument();
  });

  it("shows the sent note after a test ping, and Done is what refreshes the shell", async () => {
    render(<DiscordLinkGate />);
    await saveId();

    fireEvent.click(screen.getByRole("button", { name: "Send me a test ping" }));
    expect(await screen.findByText("Sent. Check Discord for the ping.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    // The buttons stay disabled until the transition settles.
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("shows a refused ping message and keeps the ping step up", async () => {
    sendMyDiscordTestPing.mockResolvedValue({
      ok: false,
      error: "You have sent 3 test pings today. Try again tomorrow, or ask a manager to check your ID.",
    });
    render(<DiscordLinkGate />);
    await saveId();

    fireEvent.click(screen.getByRole("button", { name: "Send me a test ping" }));

    expect(await screen.findByText(/You have sent 3 test pings today/)).toBeInTheDocument();
    // The label reads "Sending..." until the transition settles.
    expect(await screen.findByRole("button", { name: "Send me a test ping" })).toBeInTheDocument();
  });

  it("skip saves the skip cookie and refreshes", async () => {
    render(<DiscordLinkGate />);

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(skipDiscordLinkForNow).toHaveBeenCalledTimes(1);
  });
});
