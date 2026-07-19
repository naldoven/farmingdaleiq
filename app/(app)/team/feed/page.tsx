import { redirect } from "next/navigation";

import { SectionCard, SectionLabel } from "@/components/mobile";
import { BroadcastForm } from "@/components/feed/broadcast-form";
import { PostCard, type FeedPostData } from "@/components/feed/post-card";
import { RecognitionForm } from "@/components/feed/recognition-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /team/feed -- the full Team Feed (recognitions, top performers,
 * broadcasts), likes/comments (ARCHITECTURE.md page map). No direct/group
 * chat -- out of scope per "Team Feed" section.
 *
 * This is the redesign-era home of what used to live at /team directly
 * (KitchenIQ mobile redesign, docs/DESIGN-SYSTEM.md): /team is now the
 * daypart dashboard, with a "Broadcasts" summary card linking here for the
 * full feed. All the actual feed logic (recognitions, broadcasts, likes,
 * comments) is untouched -- only the page shell moved.
 */
export default async function TeamFeedPage() {
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

  interface CommentRow {
    id: string;
    post_id: string;
    author_id: string | null;
    body: string;
    created_at: string;
  }

  // Likes and comments depend only on postIds, so fetch them together. The
  // profiles lookup has to wait for comments (see authorIds below).
  const [{ data: likes }, { data: comments }] = await Promise.all([
    postIds.length
      ? supabase.from("feed_likes").select("post_id, user_id").in("post_id", postIds)
      : Promise.resolve({ data: [] as { post_id: string; user_id: string }[] }),
    postIds.length
      ? supabase
          .from("feed_comments")
          .select("id, post_id, author_id, body, created_at")
          .in("post_id", postIds)
          .order("created_at")
      : Promise.resolve({ data: [] as CommentRow[] }),
  ]);

  // FEED-AUTHOR: the profiles lookup must cover every id a name renders for --
  // post authors, recognition subjects, AND comment authors. This set was built
  // from posts only, so a commenter not otherwise in the window was missing and
  // their name fell back to "Someone". Built after comments resolve so their
  // author ids are included.
  const authorIds = new Set<string>();
  for (const post of posts ?? []) {
    if (post.author_id) authorIds.add(post.author_id);
    if (post.subject_user_id) authorIds.add(post.subject_user_id);
  }
  for (const comment of (comments ?? []) as CommentRow[]) {
    if (comment.author_id) authorIds.add(comment.author_id);
  }

  const { data: authors } = authorIds.size
    ? await supabase.from("profiles").select("id, name").in("id", Array.from(authorIds))
    : { data: [] as { id: string; name: string }[] };

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
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <p className="text-[15px] text-muted-ink">Recognitions, Top Performer shoutouts, and broadcasts.</p>

      {canRecognize && (
        <section className="flex flex-col gap-3">
          <SectionLabel as="h3">Send a recognition</SectionLabel>
          <SectionCard>
            <p className="mb-3 text-[13px] text-muted-ink">Tokens + a public shoutout.</p>
            <RecognitionForm subjects={recognitionSubjects ?? []} />
          </SectionCard>
        </section>
      )}

      {canBroadcast && (
        <section className="flex flex-col gap-3">
          <SectionLabel as="h3">Post a broadcast</SectionLabel>
          <SectionCard>
            <p className="mb-3 text-[13px] text-muted-ink">Announce a rollout, event, or policy update.</p>
            <BroadcastForm />
          </SectionCard>
        </section>
      )}

      <div className="flex flex-col gap-3">
        {feedPosts.length === 0 && (
          <p className="text-[15px] text-muted-ink">Nothing in the feed yet.</p>
        )}
        {feedPosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
