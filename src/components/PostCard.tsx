"use client";

import Link from "next/link";
import { format, isToday, isYesterday } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { ago } from "@/lib/dates";
import { dogName, dogVoice } from "@/lib/dogs";
import { DogAvatar } from "./DogAvatar";
import type { Post } from "@/lib/types";
import { useApp } from "./AppProvider";
import { IconTrash } from "./Art";

/** One update in the feed (or a dog note in the Dogs tab). */
export function PostCard({ post, urls }: { post: Post; urls: Record<string, string> }) {
  const { meId, nameOf, toast, dogPhotos } = useApp();
  // Dog notes speak as the dog(s); only the person who wrote one can delete it.
  const asDog = post.as_dog && post.dogs.length > 0;
  const photos = [...post.post_photos].sort((a, b) => a.position - b.position);
  const n = photos.length;
  const created = new Date(post.created_at);
  const when = isToday(created) ? ago(post.created_at) : isYesterday(created) ? `Yesterday ${format(created, "h:mm a")}` : format(created, "EEE, MMM d · h:mm a");

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
        {asDog ? (
          <DogAvatar ids={post.dogs} photos={dogPhotos} />
        ) : (
          <span className="avatar-btn" aria-hidden style={{ width: 34, height: 34, fontSize: "0.95rem", background: post.author === meId ? "var(--butter)" : "var(--rose)" }}>
            {nameOf(post.author)[0]}
          </span>
        )}
        <div className="grow">
          <div className="post-author">{asDog ? dogVoice(post.dogs) : nameOf(post.author)}</div>
          <div className="small faint">{when}</div>
        </div>
        {post.author === meId && (
          <button className="icon-btn" onClick={remove} aria-label="Delete update">
            <IconTrash />
          </button>
        )}
      </div>
      {post.text && <p className="post-text" style={{ whiteSpace: "pre-wrap" }}>{post.text}</p>}
      {post.event_id && (
        <Link className="btn btn-sm" href={`/calendar?event=${post.event_id}`} style={{ marginTop: 10, alignSelf: "flex-start" }}>
          📅 Open in calendar
        </Link>
      )}
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
      {post.dogs.length > 0 && !asDog && (
        <div className="chips post-dogs">
          {post.dogs.map((d) => (
            <span key={d} className="sticker">
              🐾 {dogName(d)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
