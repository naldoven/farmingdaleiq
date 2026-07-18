import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * completeRun coverage for the C2 regression: a run whose only question is
 * `photo_required` must complete when a photo_url was saved, and must still
 * fail when the photo is genuinely missing. The bug: completeRun rebuilt the
 * answers map for validateSubmission WITHOUT photoUrl, so `photo_required`
 * questions saw photoUrl=undefined and could NEVER be completed even with a
 * photo on file. These tests fake the Supabase client so they exercise the real
 * completeRun query flow end to end.
 */

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";

type Response = { data: unknown; error: { message: string } | null };

/**
 * Minimal fake PostgREST builder: chainable no-ops that resolve to the next
 * queued response for the table, via `.maybeSingle()`, `.single()`, or a plain
 * `await` (`.then`). One response is consumed per `from(table)` call, so a table
 * queried N times queues N responses in call order.
 */
function createFakeClient(responses: Record<string, Response[]>) {
  return {
    from(table: string) {
      const queue = responses[table];
      if (!queue || queue.length === 0) {
        throw new Error(`no mock response queued for table "${table}"`);
      }
      const response = queue.shift()!;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "eq", "neq", "in", "is", "order", "limit", "insert", "update", "delete"]) {
        builder[m] = chain;
      }
      builder.maybeSingle = async () => response;
      builder.single = async () => response;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } } }),
    },
  };
}

let client: ReturnType<typeof createFakeClient>;
const emitEventMock = vi.fn(async (key: string, payload?: Record<string, unknown>) => {
  void key;
  void payload;
  return undefined;
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return { ...actual, requirePermission: vi.fn(async () => undefined) };
});

vi.mock("@/lib/events/bus", () => ({
  emitEvent: (key: string, payload: Record<string, unknown>) => emitEventMock(key, payload),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => client,
}));

import { completeRun } from "./actions";

function runRow() {
  return {
    id: RUN_ID,
    status: "in_progress",
    template_id: "tpl-1",
    schedule_id: null,
    assigned_user_id: null,
  };
}

const photoQuestion = {
  id: "q1",
  type: "text",
  allow_na: false,
  choices: null,
  food_item_id: null,
  photo_required: true,
  prompt: "Photo of the walk-in thermometer",
  token_value: 0,
};

function answerRow(photoUrl: string | null) {
  return {
    id: "a1",
    question_id: "q1",
    value: "checked",
    is_na: false,
    corrective_action_note: null,
    comment: null,
    photo_url: photoUrl,
    flagged: false,
  };
}

beforeEach(() => {
  emitEventMock.mockClear();
});

describe("completeRun photo_required (C2)", () => {
  it("completes a run whose photo_required question has a saved photo_url", async () => {
    client = createFakeClient({
      checklist_runs: [
        { data: runRow(), error: null }, // initial select
        { data: [{ id: RUN_ID }], error: null }, // the completed claim update
      ],
      checklist_sections: [{ data: [{ id: "sec-1" }], error: null }],
      checklist_templates: [{ data: { name: "Opening" }, error: null }],
      checklist_questions: [{ data: [photoQuestion], error: null }],
      checklist_answers: [{ data: [answerRow("https://files.example/p.jpg")], error: null }],
    });

    const result = await completeRun({ runId: RUN_ID });

    expect(result.ok).toBe(true);
    // It actually ran the completion (claimed the run + emitted the event),
    // rather than short-circuiting on a phantom "photo required" error.
    expect(emitEventMock).toHaveBeenCalledWith("checklist_complete", expect.anything());
  });

  it("still refuses to complete when the photo is genuinely missing", async () => {
    client = createFakeClient({
      checklist_runs: [{ data: runRow(), error: null }],
      checklist_sections: [{ data: [{ id: "sec-1" }], error: null }],
      checklist_templates: [{ data: { name: "Opening" }, error: null }],
      checklist_questions: [{ data: [photoQuestion], error: null }],
      checklist_answers: [{ data: [answerRow(null)], error: null }],
    });

    const result = await completeRun({ runId: RUN_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/photo/i);
    }
    // Never claimed/completed, so no completion event fired.
    expect(emitEventMock).not.toHaveBeenCalledWith("checklist_complete", expect.anything());
  });
});
