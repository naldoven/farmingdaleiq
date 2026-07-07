-- Team Feed
-- ARCHITECTURE.md "Data model (Postgres)" > Feed

create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('recognition', 'top_performer', 'broadcast')),
  author_id uuid references public.profiles(id),
  subject_user_id uuid references public.profiles(id),
  body text,
  tokens_awarded int,
  created_at timestamptz not null default now()
);

create table public.feed_likes (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
