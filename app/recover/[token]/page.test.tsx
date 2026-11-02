import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.example.com" }) }));
vi.mock("@/lib/auth/permissions", () => ({ hasPermission: vi.fn(async () => false) }));
vi.mock("@/lib/guest-recovery/qr", () => ({ qrSvg: vi.fn(async () => "<svg></svg>") }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

import { hasPermission } from "@/lib/auth/permissions";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import RecoverPage from "@/app/recover/[token]/page";

const TOKEN = "d".repeat(64);

function serviceReturning(recovery: Record<string, unknown> | null, items: { name: string; qty: number }[] = []) {
  const make = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order"]) builder[method] = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: recovery, error: null }));
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: table === "guest_recovery_items" ? items : [], error: null }).then(resolve);
    return builder;
  };
  vi.mocked(createServiceRoleClient).mockReturnValue({ from: vi.fn(make) } as never);
}

async function render(token: string) {
  const element = await RecoverPage({ params: Promise.resolve({ token }) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasPermission).mockResolvedValue(false);
});

describe("the public guest page", () => {
  it("shows the first name and the items, and nothing else about the guest", async () => {
    serviceReturning(
      {
        id: "r1",
        guest_name: "Nolan Patrick",
        guest_email: "nolan@example.com",
        guest_phone: "+16315550142",
        order_number: "8407578",
        status: "owed",
        created_at: "2026-10-22T19:00:00.000Z",
        given_at: null,
      },
      [{ name: "Cobb Salad", qty: 2 }],
    );
    const html = await render(TOKEN);
    expect(html).toContain("Nolan");
    expect(html).not.toContain("Patrick");
    expect(html).toContain("2 x Cobb Salad");
    expect(html).not.toContain("nolan@example.com");
    expect(html).not.toContain("6315550142");
    expect(html).not.toContain("8407578");
    expect(html).toMatch(/Receipt required/);
  });

  it("is a 404 for anything that is not a 64-character token, without touching the database", async () => {
    await expect(render("abc")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(render("G".repeat(64))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("is a 404 for a token that matches no recovery", async () => {
    serviceReturning(null);
    await expect(render(TOKEN)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("tells a guest an already-handed-over code was used, and shows no items", async () => {
    serviceReturning(
      { id: "r1", guest_name: "Nolan Patrick", status: "given", created_at: "2026-10-22T19:00:00.000Z", given_at: "2026-10-23T19:00:00.000Z" },
      [{ name: "Cobb Salad", qty: 1 }],
    );
    const html = await render(TOKEN);
    expect(html).toMatch(/handed over/i);
    expect(html).not.toContain("Cobb Salad");
  });

  it("sends a signed-in leader to the redeem screen", async () => {
    vi.mocked(hasPermission).mockResolvedValue(true);
    const maybeSingle = vi.fn(async () => ({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }));
    const builder: Record<string, unknown> = { select: vi.fn(() => builder), eq: vi.fn(() => builder), maybeSingle };
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => builder) } as never);
    await expect(render(TOKEN)).rejects.toThrow("NEXT_REDIRECT:/guest-recovery/11111111-1111-4111-8111-111111111111");
  });
});
