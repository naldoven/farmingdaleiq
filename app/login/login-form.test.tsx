import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

const signInWithPassword = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword },
  }),
}));

import { LoginForm } from "./login-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Parse the server-rendered markup without mutating the live document. */
function serverRender(next = "/"): Document {
  const markup = renderToStaticMarkup(<LoginForm next={next} />);
  return new DOMParser().parseFromString(markup, "text/html");
}

/**
 * F-AUTH-1: if the login form is submitted before React hydration attaches its
 * onSubmit handler, the browser would do a native submit. Two defenses close
 * the plaintext-password-in-the-URL vector, and both are asserted against the
 * server render (which is exactly what a pre-hydration browser would act on):
 *   1. the <form> declares method="post" so any native fallback uses a POST
 *      body, never a URL query string;
 *   2. the submit button is disabled on the server render (mounted-gate), so a
 *      pre-hydration click/Enter cannot submit at all.
 */
describe("LoginForm credential-leak defense (F-AUTH-1)", () => {
  it("server-renders the form as method=post so a native fallback submit is never a URL-query GET", () => {
    const form = serverRender().querySelector("form");
    expect(form).not.toBeNull();
    // Plain DOM API (not jest-dom matchers) because DOMParser elements live in
    // a detached realm that jest-dom's HTMLElement guard rejects.
    expect(form?.getAttribute("method")).toBe("post");
  });

  it("server-renders the submit button disabled (mounted-gate) so a pre-hydration submit cannot fire", () => {
    const submit = serverRender().querySelector('button[type="submit"]');
    expect(submit).not.toBeNull();
    expect(submit?.hasAttribute("disabled")).toBe(true);
  });
});

describe("LoginForm happy path", () => {
  it("still calls signInWithPassword on a normal hydrated submit", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<LoginForm next="/next-path" />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "hunter2",
      });
    });
  });
});
