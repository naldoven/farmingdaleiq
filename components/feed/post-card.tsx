"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, Heart, MessageCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarInitials, StatusBadge } from "@/components/mobile";
import { addComment, toggleLike } from "@/app/(app)/team/actions";

export interface FeedPostComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface FeedPostData {
  id: string;
  kind: "recognition" | "top_performer" | "broadcast";
  authorName: string | null;
  subjectName: string | null;
  body: string | null;
  tokensAwarded: number | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  comments: FeedPostComment[];
}

const KIND_LABELS: Record<FeedPostData["kind"], string> = {
  recognition: "Recognition",
  top_performer: "Top Performer",
  broadcast: "Broadcast",
};

const KIND_TONE: Record<FeedPostData["kind"], "success" | "warning" | "accent"> = {
  recognition: "success",
  top_performer: "success",
  broadcast: "warning",
};

/**
 * FEED-HYDRATION: this is a "use client" component that is also server-rendered,
 * so `new Date(...).toLocaleString()` produced React #418 -- the server's
 * default locale/timezone string didn't match the browser's at hydration.
 * Pinning BOTH the locale and the timeZone makes the formatted string identical
 * on the server and the client, so there's no mismatch and no layout shift. The
 * store runs on Eastern time (the same America/New_York default the catering
 * day-boundary code falls back to), so timestamps read in store time regardless
 * of where the viewer's browser is.
 */
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : TIMESTAMP_FORMAT.format(date);
}

/**
 * One post in the Team Feed (ARCHITECTURE.md "Team Feed": "A store-wide
 * feed of Recognitions, Top Performer shoutouts, and leader Broadcasts ...
 * Team members can like and comment on posts"). Like/comment are optimistic
 * -- toggleLike/addComment re-check feed.post server-side either way.
 * Styled as a KitchenIQ feed card: avatar + headline + kind badge, body,
 * token pill, like/comment row, inline comment thread.
 */
export function PostCard({ post }: { post: FeedPostData }) {
  const router = useRouter();
  const [isLikePending, startLikeTransition] = useTransition();
  const [isCommentPending, startCommentTransition] = useTransition();
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const avatarName = post.kind === "broadcast" ? post.authorName ?? "A leader" : post.authorName ?? "Someone";
  const headline =
    post.kind === "broadcast"
      ? post.authorName ?? "A leader"
      : `${post.authorName ?? "Someone"} → ${post.subjectName ?? "a coworker"}`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <AvatarInitials name={avatarName} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[15px] font-semibold text-ink">{headline}</p>
            <StatusBadge tone={KIND_TONE[post.kind]}>{KIND_LABELS[post.kind]}</StatusBadge>
          </div>
          <p className="text-[13px] text-muted-ink">{formatTimestamp(post.createdAt)}</p>
        </div>
      </div>

      {post.body && <p className="text-[15px] text-ink">{post.body}</p>}

      {post.tokensAwarded !== null && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-[13px] font-bold text-warning">
          <Coins className="h-3.5 w-3.5" aria-hidden="true" />+{post.tokensAwarded} tokens
        </span>
      )}

      <div className="flex items-center gap-5 border-t border-line pt-3 text-[13px] text-muted-ink">
        <button
          type="button"
          className="flex items-center gap-1.5 disabled:opacity-50"
          disabled={isLikePending}
          onClick={() => {
            setError(null);
            startLikeTransition(async () => {
              const result = await toggleLike({ postId: post.id });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          <Heart
            className={`h-4 w-4 ${post.likedByMe ? "fill-danger text-danger" : ""}`}
            aria-hidden="true"
          />
          <span className={post.likedByMe ? "font-semibold text-danger" : undefined}>{post.likeCount}</span>
        </button>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {post.comments.length}
        </span>
      </div>

      {post.comments.length > 0 && (
        <div className="flex flex-col gap-2">
          {post.comments.map((comment) => (
            <p key={comment.id} className="text-[13px] leading-snug">
              <span className="font-semibold text-ink">{comment.authorName}</span>{" "}
              <span className="text-muted-ink">{comment.body}</span>
            </p>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!commentBody.trim()) return;
          setError(null);
          startCommentTransition(async () => {
            const result = await addComment({ postId: post.id, body: commentBody });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setCommentBody("");
            router.refresh();
          });
        }}
      >
        <Input
          placeholder="Add a comment..."
          className="h-9 rounded-full"
          value={commentBody}
          onChange={(event) => setCommentBody(event.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          variant="secondary"
          className="h-9 w-9 shrink-0 rounded-full"
          aria-label="Post comment"
          disabled={isCommentPending || !commentBody.trim()}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>

      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
