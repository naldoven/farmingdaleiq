import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/events/bus", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

import { emitEvent } from "@/lib/events/bus";
import type { Database } from "@/lib/db/types";
import { markOverdueTasks } from "./overdue";

function fakeSupabase(overdueRows: Array<{ id: string; title: string; assigned_user_id: string | null; assigned_position_id: string | null }>) {
  return {
    from(table: string) {
      if (table !== "tasks") throw new Error(`unexpected table ${table}`);
      return {
        update() {
          return {
            eq() {
              return {
                not() {
                  return {
                    lt() {
                      return {
                        select() {
                          return Promise.resolve({ data: overdueRows, error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

describe("markOverdueTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits task_overdue once per newly-overdue task", async () => {
    const supabase = fakeSupabase([
      { id: "task-1", title: "Restock cups", assigned_user_id: "user-1", assigned_position_id: null },
      { id: "task-2", title: "Sweep lobby", assigned_user_id: null, assigned_position_id: "pos-1" },
    ]);

    const result = await markOverdueTasks(supabase);

    expect(result).toEqual({ marked: 2 });
    expect(emitEvent).toHaveBeenCalledTimes(2);
    expect(emitEvent).toHaveBeenCalledWith(
      "task_overdue",
      expect.objectContaining({ task_id: "task-1" }),
    );
  });

  it("reports zero when nothing is newly overdue", async () => {
    const supabase = fakeSupabase([]);
    const result = await markOverdueTasks(supabase);
    expect(result).toEqual({ marked: 0 });
    expect(emitEvent).not.toHaveBeenCalled();
  });
});
