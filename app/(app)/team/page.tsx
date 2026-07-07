import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BroadcastForm } from "@/components/feed/broadcast-form";
import { PostCard, type FeedPostData } from "@/components/feed/post-card";
import { RecognitionForm } from "@/components/feed/recognition-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /team: Team Feed (recognitions, top performers, broadcasts), likes/
 * comments (ARCHITECTURE.md page map). No direct/group chat -- out of
 * scope per "Team Feed" section.
 */
export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [canRecognize, canBroadcast] = await Promise.all([
    hasPermission("tokens.award"),
    hasPermission("feed.post_broadcast"),
  ]);

  const [{ data: posts }, { data: recognitionSubjects }] = await Promise.all([
    supabase
      .from("feed_posts")
      .select("id, kind, author_id, subject_user_id, body, tokens_awarded, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    canRecognize
      ? supabase.from("profiles").select("id, name").eq("active", true).neq("id", user.id).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const postIds = (posts ?? []).map((p) => p.id);
  const authorIds = new Set(
    (posts ?? []).flatMap((p) => [p.author_id, p.subject_user_id].filter((id): id is string => Boolean(id)))
  );

  const [{ data: likes }, { data: comments }, { data: authors }] = await Promise.all([
    postIds.length
      ? supabase.from("feed_likes").select("post_id, user_id").in("post_id", postIds)
      : Promise.resolve({ data: [] as { post_id: string; user_id: string }[] }),
    postIds.length
      ? supabase
          .from("feed_comments")
          .select("id, post_id, author_id, body, created_at")
          .in("post_id", postIds)
          .order("created_at")
      : Promise.resolve({ data: [] as { id: string; post_id: string; author_id: string | null; body: string; created_at: string }[] }),
    authorIds.size
      ? supabase.from("profiles").select("id, name").in("id", Array.from(authorIds))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  interface CommentRow {
    id: string;
    post_id: string;
    author_id: string | null;
    body: string;
    created_at: string;
  }

  const nameById = new Map((authors ?? []).map((a) => [a.id, a.name]));
  const likesByPost = new Map<string, string[]>();
  for (const like of likes ?? []) {
    likesByPost.set(like.post_id, [...(likesByPost.get(like.post_id) ?? []), like.user_id]);
  }
  const commentsByPost = new Map<string, CommentRow[]>();
  for (const comment of (comments ?? []) as CommentRow[]) {
    const list = commentsByPost.get(comment.post_id) ?? [];
    list.push(comment);
    commentsByPost.set(comment.post_id, list);
  }

  const feedPosts: FeedPostData[] = (posts ?? []).map((post) => ({
    id: post.id,
    kind: post.kind as FeedPostData["kind"],
    authorName: post.author_id ? nameById.get(post.author_id) ?? null : null,
    subjectName: post.subject_user_id ? nameById.get(post.subject_user_id) ?? null : null,
    body: post.body,
    tokensAwarded: post.tokens_awarded,
    createdAt: post.created_at,
    likeCount: likesByPost.get(post.id)?.length ?? 0,
    likedByMe: (likesByPost.get(post.id) ?? []).includes(user.id),
    comments: (commentsByPost.get(post.id) ?? []).map((c) => ({
      id: c.id,
      authorName: c.author_id ? nameById.get(c.author_id) ?? "Someone" : "Someone",
      body: c.body,
      createdAt: c.created_at,
    })),
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Team Feed</h1>
        <p className="text-sm text-muted-foreground">Recognitions, Top Performer shoutouts, and broadcasts.</p>
      </div>

      {canRecognize && (
        <Card>
          <CardHeader>
            <CardTitle>Send a recognition</CardTitle>
            <CardDescription>Tokens + a public shoutout.</CardDescription>
          </CardHeader>
          <CardContent>
            <RecognitionForm subjects={recognitionSubjects ?? []} />
          </CardContent>
        </Card>
      )}

      {canBroadcast && (
        <Card>
          <CardHeader>
            <CardTitle>Post a broadcast</CardTitle>
            <CardDescription>Announce a rollout, event, or policy update.</CardDescription>
          </CardHeader>
          <CardContent>
            <BroadcastForm />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {feedPosts.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing in the feed yet.</p>
        )}
        {feedPosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
