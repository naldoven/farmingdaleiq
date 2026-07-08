import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface HomePositionRow {
  positionName: string;
  dayPartName: string | null;
}

export interface HomeTaskSummary {
  openCount: number;
  overdueCount: number;
  titles: string[];
}

export interface HomeFeedItem {
  id: string;
  kind: string;
  headline: string;
  body: string | null;
  createdAt: string;
}

const FEED_KIND_LABELS: Record<string, string> = {
  recognition: "Recognition",
  top_performer: "Top Performer",
  broadcast: "Broadcast",
};

/**
 * Turns raw setup_assignments rows into the positions a person is posted to
 * today. Pure so the "my day" wiring (FIQ parity R27) can be unit tested
 * without a live Supabase client.
 */
export function summarizePositions(
  assignments: { position_id: string | null; setup_id: string }[],
  positionNameById: Map<string, string>,
  dayPartNameBySetupId: Map<string, string | null>,
): HomePositionRow[] {
  return assignments
    .filter((a): a is { position_id: string; setup_id: string } => Boolean(a.position_id))
    .map((a) => ({
      positionName: positionNameById.get(a.position_id) ?? "Unknown position",
      dayPartName: dayPartNameBySetupId.get(a.setup_id) ?? null,
    }));
}

/** Pure task-summary builder for the "my to-dos" card (FIQ parity R27). */
export function summarizeTasks(
  tasks: { title: string; status: string }[],
): HomeTaskSummary {
  const open = tasks.filter((t) => t.status === "pending" || t.status === "overdue");
  return {
    openCount: open.length,
    overdueCount: tasks.filter((t) => t.status === "overdue").length,
    titles: open.slice(0, 3).map((t) => t.title),
  };
}

/** Pure feed-highlight formatter, mirrors components/feed/post-card.tsx's headline logic. */
export function summarizeFeed(
  posts: {
    id: string;
    kind: string;
    body: string | null;
    author_id: string | null;
    subject_user_id: string | null;
    created_at: string;
  }[],
  nameById: Map<string, string>,
): HomeFeedItem[] {
  return posts.map((p) => {
    const authorName = p.author_id ? (nameById.get(p.author_id) ?? null) : null;
    const subjectName = p.subject_user_id ? (nameById.get(p.subject_user_id) ?? null) : null;
    const headline =
      p.kind === "broadcast"
        ? (authorName ?? "A leader")
        : `${authorName ?? "Someone"} → ${subjectName ?? "a coworker"}`;
    return {
      id: p.id,
      kind: p.kind,
      headline,
      body: p.body,
      createdAt: p.created_at,
    };
  });
}

/**
 * / (owned by the app-group now that the starter app/page.tsx is gone --
 * FIQ parity R2). "My day" home: token balance, today's posted positions,
 * today's to-dos, and recent Team Feed highlights (FIQ parity R27).
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  let displayName = "there";
  let positions: HomePositionRow[] = [];
  let taskSummary: HomeTaskSummary = { openCount: 0, overdueCount: 0, titles: [] };
  let feed: HomeFeedItem[] = [];

  if (user) {
    const today = todayIso();

    const [
      { data: profile },
      { data: transactions },
      { data: setupsToday },
      { data: dayParts },
      { data: tasksToday },
      { data: feedPosts },
    ] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
      supabase.from("token_transactions").select("delta").eq("user_id", user.id),
      supabase.from("setups").select("id, day_part_id").eq("date", today).not("posted_at", "is", null),
      supabase.from("day_parts").select("id, name"),
      supabase
        .from("tasks")
        .select("title, status")
        .eq("date", today)
        .eq("assigned_user_id", user.id)
        .neq("status", "cancelled"),
      supabase
        .from("feed_posts")
        .select("id, kind, body, author_id, subject_user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    displayName = profile?.name ?? "there";
    balance = (transactions ?? []).reduce((sum, t) => sum + t.delta, 0);

    const dayPartNameById = new Map((dayParts ?? []).map((d) => [d.id, d.name]));
    const dayPartNameBySetupId = new Map(
      (setupsToday ?? []).map((s) => [s.id, s.day_part_id ? (dayPartNameById.get(s.day_part_id) ?? null) : null]),
    );
    const setupIds = (setupsToday ?? []).map((s) => s.id);

    const { data: assignments } = setupIds.length
      ? await supabase
          .from("setup_assignments")
          .select("position_id, setup_id")
          .eq("user_id", user.id)
          .in("setup_id", setupIds)
      : { data: [] as { position_id: string | null; setup_id: string }[] };

    const positionIds = Array.from(
      new Set((assignments ?? []).map((a) => a.position_id).filter((id): id is string => Boolean(id))),
    );
    const { data: positionRows } = positionIds.length
      ? await supabase.from("positions").select("id, name").in("id", positionIds)
      : { data: [] as { id: string; name: string }[] };
    const positionNameById = new Map((positionRows ?? []).map((p) => [p.id, p.name]));

    positions = summarizePositions(assignments ?? [], positionNameById, dayPartNameBySetupId);
    taskSummary = summarizeTasks(tasksToday ?? []);

    const feedProfileIds = Array.from(
      new Set(
        (feedPosts ?? []).flatMap((p) => [p.author_id, p.subject_user_id]).filter((id): id is string => Boolean(id)),
      ),
    );
    const { data: feedProfiles } = feedProfileIds.length
      ? await supabase.from("profiles").select("id, name").in("id", feedProfileIds)
      : { data: [] as { id: string; name: string }[] };
    const feedNameById = new Map((feedProfiles ?? []).map((p) => [p.id, p.name]));

    feed = summarizeFeed(feedPosts ?? [], feedNameById);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Your day at FarmingdaleIQ.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Token balance</CardDescription>
            <CardTitle className="text-3xl">{balance}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>My positions today</CardDescription>
            <CardTitle className="text-3xl">{positions.length}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
            {positions.length === 0 ? (
              <span>No position posted yet.</span>
            ) : (
              positions.map((p, i) => (
                <span key={i}>
                  {p.positionName}
                  {p.dayPartName ? ` · ${p.dayPartName}` : ""}
                </span>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>My to-dos</CardDescription>
            <CardTitle className="text-3xl">{taskSummary.openCount}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
            {taskSummary.openCount === 0 ? (
              <span>All caught up.</span>
            ) : (
              <>
                {taskSummary.titles.map((title, i) => (
                  <span key={i}>{title}</span>
                ))}
                {taskSummary.overdueCount > 0 && (
                  <span className="font-medium text-destructive">
                    {taskSummary.overdueCount} overdue
                  </span>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team feed highlights</CardTitle>
          <CardDescription>Recent recognitions, shoutouts, and broadcasts.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
          ) : (
            feed.map((post) => (
              <div key={post.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <Badge variant={post.kind === "broadcast" ? "outline" : "success"}>
                    {FEED_KIND_LABELS[post.kind] ?? post.kind}
                  </Badge>
                  <span className="text-sm font-medium">{post.headline}</span>
                </div>
                {post.body && <p className="text-sm text-muted-foreground">{post.body}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
