"use client";

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
import { DogTodos } from "@/components/DogTodos";
import { LunchWidget } from "@/components/LunchWidget";
import { VibeWidget } from "@/components/VibeWidget";
import { Flower, Teapot, Wavy } from "@/components/Art";

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
      <PageHead eyebrow={now ? format(now, "EEEE, MMMM d") : "\u00a0"} title={`${greeting}${me ? `, ${me.display_name}` : ""}`} />
      <Wavy />

      <button className="card composer-prompt" onClick={() => openAdd("post")}>
        <Flower width={36} height={36} />
        <span>Share a little update…</span>
      </button>

      <VibeWidget />
      <LunchWidget />
      <DogTodos />

      <div className="checker" style={{ margin: "20px 0" }} />

      {posts && posts.length === 0 && (
        <div className="empty">
          <Teapot />
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
