"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { PostCard } from "@/components/PostCard";
import type { Post } from "@/lib/types";

/** One update on its own: where a copied or \ link to a post goes. */
export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const { data: post } = useLive<Post | null>(
    `post:${id}`,
    async () => {
      const { data } = await supabaseBrowser().from("posts").select("*, post_photos(*)").eq("id", id).maybeSingle();
      // A "not right now" answer quietly left the feed, so it isn't linkable either.
      return data && (data as Post).reply !== "no" ? (data as Post) : null;
    },
    ["posts", "post_photos"],
  );
  const urls = usePhotoUrls(post ? post.post_photos.map((p) => p.storage_path) : []);
  return (
    <main className="page">
      <Link href="/" className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start", marginBottom: 12 }}>
        ← Feed
      </Link>
      {post === undefined ? <p className="muted">Loading…</p> : post ? <PostCard post={post} urls={urls} /> : <p className="muted">That update isn&apos;t here anymore.</p>}
    </main>
  );
}
