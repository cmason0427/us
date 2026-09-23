"use client";

import { useEffect, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { celebrate } from "@/lib/celebrate";
import { ago, useNow } from "@/lib/dates";
import type { Post } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Flower, IconTrash, Teapot, Wavy } from "@/components/Art";

const REACTIONS = ["💛", "🌼", "😂", "🥹"];
const PAGE = 30;

// Signed URLs for private photos, cached for the session (they last an hour).
const urlCache = new Map<string, { url: string; exp: number }>();

function usePhotoUrls(paths: string[]) {
  // Bumped whenever a batch of URLs lands in the cache, to re-render.
  const [, setVersion] = useState(0);
  const key = paths.join("|");
  useEffect(() => {
    const now = Date.now();
    const missing = key ? key.split("|").filter((p) => !((urlCache.get(p)?.exp ?? 0) > now)) : [];
    if (!missing.length) return;
    supabaseBrowser()
      .storage.from("photos")
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        for (const d of data ?? []) {
          if (d.signedUrl && d.path) urlCache.set(d.path, { url: d.signedUrl, exp: now + 50 * 60 * 1000 });
        }
        setVersion((v) => v + 1);
      });
  }, [key]);
  const urls: Record<string, string> = {};
  for (const p of paths) {
    const hit = urlCache.get(p);
    if (hit) urls[p] = hit.url;
  }
  return urls;
}

export default function HomePage() {
  const { openAdd, me } = useApp();
  const [limit, setLimit] = useState(PAGE);
  const { data: posts } = useLive<Post[]>(
    `posts:${limit}`,
    async () => {
      const { data, error } = await supabaseBrowser()
        .from("posts")
        .select("*, post_photos(*), post_reactions(*)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Post[];
    },
    ["posts", "post_photos", "post_reactions"],
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

function PostCard({ post, urls }: { post: Post; urls: Record<string, string> }) {
  const { meId, nameOf, toast } = useApp();
  const photos = [...post.post_photos].sort((a, b) => a.position - b.position);
  const n = photos.length;
  const created = new Date(post.created_at);
  const when = isToday(created) ? ago(post.created_at) : isYesterday(created) ? `Yesterday ${format(created, "h:mm a")}` : format(created, "EEE, MMM d · h:mm a");

  async function toggle(emoji: string, el: HTMLElement) {
    const supabase = supabaseBrowser();
    const mine = post.post_reactions.some((r) => r.user_id === meId && r.emoji === emoji);
    if (mine) {
      await supabase.from("post_reactions").delete().match({ post_id: post.id, user_id: meId, emoji });
    } else {
      await supabase.from("post_reactions").insert({ post_id: post.id, user_id: meId, emoji });
      celebrate(el, [emoji]);
    }
    refreshAll();
  }

  async function remove() {
    if (!confirm("Delete this update?")) return;
    const supabase = supabaseBrowser();
    if (photos.length) await supabase.storage.from("photos").remove(photos.map((p) => p.storage_path));
    await supabase.from("posts").delete().eq("id", post.id);
    refreshAll();
    toast("Deleted");
  }

  return (
    <article className="card card-stitched post">
      <div className="post-head">
        <span className="avatar-btn" aria-hidden style={{ width: 34, height: 34, fontSize: "0.95rem", background: post.author === meId ? "var(--butter)" : "var(--rose)" }}>
          {nameOf(post.author)[0]}
        </span>
        <div className="grow">
          <div className="post-author">{nameOf(post.author)}</div>
          <div className="small faint">{when}</div>
        </div>
        {post.author === meId && (
          <button className="icon-btn" onClick={remove} aria-label="Delete update">
            <IconTrash />
          </button>
        )}
      </div>
      {post.text && <p className="post-text">{post.text}</p>}
      {n > 0 && (
        <div className={`photos ${n === 1 ? "n1" : n === 2 ? "n2" : n === 3 ? "n3" : "nmany"}`}>
          {photos.map((ph) => (
            <a key={ph.id} className="photo" href={urls[ph.storage_path]} target="_blank" rel="noreferrer" style={n === 1 && ph.width && ph.height ? { aspectRatio: `${ph.width} / ${ph.height}` } : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {urls[ph.storage_path] && <img src={urls[ph.storage_path]} alt="" loading="lazy" />}
            </a>
          ))}
        </div>
      )}
      <div className="reactions">
        {REACTIONS.map((emoji) => {
          const who = post.post_reactions.filter((r) => r.emoji === emoji);
          const mine = who.some((r) => r.user_id === meId);
          return (
            <button key={emoji} className="react-btn" aria-pressed={mine} onClick={(e) => toggle(emoji, e.currentTarget)} aria-label={`React ${emoji}`}>
              {emoji}
              {who.length > 0 && <span className="who">{who.map((r) => nameOf(r.user_id)[0]).join("")}</span>}
            </button>
          );
        })}
      </div>
    </article>
  );
}
