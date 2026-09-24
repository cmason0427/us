"use client";

import { DogPic } from "@/components/DogPic";
import { useState } from "react";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import type { Post } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { PostCard } from "@/components/PostCard";
import { usePhotoUrls } from "@/lib/photos";
import { Dashboard } from "@/components/Dashboard";

const PAGE = 30;

export default function HomePage() {
  const { openAdd, me } = useApp();
  const [limit, setLimit] = useState(PAGE);
  const { data: posts } = useLive<Post[]>(
    `posts:${limit}`,
    async () => {
      const { data, error } = await supabaseBrowser()
        .from("posts")
        .select("*, post_photos(*)")
        .or("reply.is.null,reply.neq.no") // a "not right now" quietly leaves the feed
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Post[];
    },
    ["posts", "post_photos"],
  );

  const allPaths = (posts ?? []).flatMap((p) => p.post_photos.map((ph) => ph.storage_path));
  const urls = usePhotoUrls(allPaths);

  const now = useNow();
  const hour = now?.getHours() ?? 12;
  const greeting = !now ? "Hello" : hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="page">
      <PageHead eyebrow={now ? format(now, "EEEE, MMMM d") : "\u00a0"} title={`${greeting}${me ? `, ${me.display_name}` : ""}`} art={<DogPic name="kodo_wiley_face" size={46} />} />
      <div className="wavy" />

      <Dashboard />

      <div className="feed-head">
        <h2 className="section-title">Feed</h2>
        <div className="row">
          <button className="btn btn-sm btn-ghost" onClick={() => openAdd("star")} aria-label="Send a star">
            ⭐
          </button>
          <button className="btn btn-sm" onClick={() => openAdd("post")}>
            Share something
          </button>
        </div>
      </div>

      {posts && posts.length === 0 && (
        <div className="empty">
          <DogPic name="kodo_wiley_cuddle" size={140} />
          <p className="display">Nothing here yet</p>
          <p>Post the first little update — a photo of lunch counts.</p>
        </div>
      )}

      <div className="feed">
        {posts?.map((p) => <PostCard key={p.id} post={p} urls={urls} />)}
      </div>

      {posts && posts.length >= limit && (
        <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
            Older updates
          </button>
        </div>
      )}
    </main>
  );
}
