"use client";

import { useState } from "react";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import type { Post } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { PostCard } from "@/components/PostCard";
import { usePhotoUrls } from "@/lib/photos";
import { Dashboard } from "@/components/Dashboard";
import { dogName } from "@/lib/dogs";
import { ThreadStrip } from "@/components/Threads";

const PAGE = 30;

export default function HomePage() {
  const { openAdd, me } = useApp();
  const { nameOf } = useApp();
  const [limit, setLimit] = useState(PAGE);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<null | "photos" | "stars" | "dogs" | "plans" | "mine" | "theirs">(null);
  const filtering = searching && (!!q.trim() || !!only);
  const { data: posts } = useLive<Post[]>(
    // Searching looks back further (the last 400 updates).
    `posts:${filtering ? 400 : limit}`,
    async () => {
      const { data, error } = await supabaseBrowser()
        .from("posts")
        .select("*, post_photos(*)")
        .or("reply.is.null,reply.neq.no") // a "not right now" quietly leaves the feed
        .order("created_at", { ascending: false })
        .limit(filtering ? 400 : limit);
      if (error) throw error;
      return data as Post[];
    },
    ["posts", "post_photos"],
  );

  const needle = q.trim().toLowerCase();
  const shown = !filtering
    ? posts
    : posts?.filter(
        (p) =>
          (!needle || [p.text, nameOf(p.author), ...p.dogs.map(dogName)].some((x) => x?.toLowerCase().includes(needle))) &&
          (only !== "photos" || p.post_photos.length > 0) &&
          (only !== "stars" || p.kind === "star") &&
          (only !== "dogs" || p.dogs.length > 0) &&
          (only !== "plans" || p.kind === "plan" || !!p.event_id) &&
          (only !== "mine" || p.author === me?.id) &&
          (only !== "theirs" || p.author !== me?.id),
      );
  const allPaths = (shown ?? []).flatMap((p) => p.post_photos.map((ph) => ph.storage_path));
  const urls = usePhotoUrls(allPaths);

  const now = useNow();
  const hour = now?.getHours() ?? 12;
  const greeting = !now ? "Hello" : hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="page">
      <PageHead eyebrow={now ? format(now, "EEEE, MMMM d") : "\u00a0"} title={`${greeting}${me ? `, ${me.display_name}` : ""}`} art={<Sticker name="duo_faces" size={84} tilt={4} />} />
      <div className="wavy" />

      <Dashboard />

      <div className="feed-head">
        <h2 className="section-title">Feed</h2>
        <div className="row">
          <button className="btn btn-sm btn-ghost" aria-pressed={searching} onClick={() => (setSearching((x) => !x), setQ(""), setOnly(null))} aria-label="Search the feed">
            🔍
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => openAdd("star")} aria-label="Send a star">
            ⭐
          </button>
          <button className="btn btn-sm" onClick={() => openAdd("post")}>
            Share something
          </button>
        </div>
      </div>
      {searching && (
        <div className="stack-sm" style={{ marginBottom: 10 }}>
          <input className="input input-sm" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search updates, names, dogs…" autoFocus aria-label="Search the feed" />
          <div className="chips">
            {(
              [
                ["photos", "📷 photos"],
                ["stars", "⭐ stars"],
                ["dogs", "🐾 dogs"],
                ["plans", "📅 plans"],
                ["mine", "mine"],
                ["theirs", "theirs"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className="chip chip-sm" aria-pressed={only === k} onClick={() => setOnly(only === k ? null : k)}>
                {l}
              </button>
            ))}
          </div>
          {filtering && <p className="small muted">{shown?.length ?? 0} found</p>}
        </div>
      )}
      {!searching && <ThreadStrip />}

      {posts && posts.length === 0 && (
        <div className="empty">
          <Sticker name="duo_cuddle" size={200} tilt={-2} />
          <p className="display">Nothing here yet</p>
          <p>Post the first little update — a photo of lunch counts.</p>
        </div>
      )}

      <div className="feed">
        {shown?.map((p) => <PostCard key={p.id} post={p} urls={urls} />)}
      </div>

      {!filtering && posts && posts.length >= limit && (
        <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
            Older updates
          </button>
        </div>
      )}
    </main>
  );
}
