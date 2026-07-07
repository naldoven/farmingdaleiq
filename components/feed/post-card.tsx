"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

/**
 * One post in the Team Feed (ARCHITECTURE.md "Team Feed": "A store-wide
 * feed of Recognitions, Top Performer shoutouts, and leader Broadcasts ...
 * Team members can like and comment on posts"). Like/comment are optimistic
 * -- toggleLike/addComment re-check feed.post server-side either way.
 */
export function PostCard({ post }: { post: FeedPostData }) {
  const router = useRouter();
  const [isLikePending, startLikeTransition] = useTransition();
  const [isCommentPending, startCommentTransition] = useTransition();
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const headline =
    post.kind === "broadcast"
      ? post.authorName ?? "A leader"
      : `${post.authorName ?? "Someone"} → ${post.subjectName ?? "a coworker"}`;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Badge variant={post.kind === "broadcast" ? "outline" : "success"}>{KIND_LABELS[post.kind]}</Badge>
          <span className="text-sm font-medium">{headline}</span>
        </div>
        <span className="text-xs text-muted-foreground">{new Date(post.createdAt).toLocaleString()}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {post.body && <p className="text-sm">{post.body}</p>}
        {post.tokensAwarded !== null && (
          <Badge variant="secondary" className="w-fit">
            +{post.tokensAwarded} tokens
          </Badge>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <button
            type="button"
            className="flex items-center gap-1 disabled:opacity-50"
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
            <Heart className={`h-4 w-4 ${post.likedByMe ? "fill-current text-destructive" : ""}`} />
            {post.likeCount}
          </button>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-4 w-4" />
            {post.comments.length}
          </span>
        </div>

        {post.comments.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            {post.comments.map((comment) => (
              <p key={comment.id} className="text-sm">
                <span className="font-medium">{comment.authorName}</span>{" "}
                <span className="text-muted-foreground">{comment.body}</span>
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
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={isCommentPending || !commentBody.trim()}>
            Post
          </Button>
        </form>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
