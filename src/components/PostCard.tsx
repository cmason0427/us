"use client";

import Link from "next/link";
import { format, isToday, isYesterday } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { ago } from "@/lib/dates";
import { dogName, dogVoice } from "@/lib/dogs";
import { DogAvatar } from "./DogAvatar";
import { PersonAvatar } from "./PersonAvatar";
import type { Post } from "@/lib/types";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { SaveSheet } from "./SaveSheet";
import { starColor } from "@/lib/stars";
import { IconTrash } from "./Art";

/** One update in the feed (or a dog note in the Dogs tab). */
export function PostCard({ post, urls }: { post: Post; urls: Record<string, string> }) {
  const { meId, nameOf, toast, dogPhotos } = useApp();
  // Dog notes speak as the dog(s); only the person who wrote one can delete it.
  const asDog = post.as_dog && post.dogs.length > 0;
  const [saving, setSaving] = useState(false);
  // Which photo of a carousel is showing; 🔖 saves just that one.
  const [slide, setSlide] = useState(0);
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
          <PersonAvatar id={post.author} />
        )}
        <div className="grow">
          <div className="post-author">{asDog ? dogVoice(post.dogs) : nameOf(post.author)}</div>
          <div className="small faint">{when}</div>
        </div>
        {n > 0 && (
          <button className="icon-btn" onClick={() => setSaving(true)} aria-label={n > 1 ? "Save this photo" : "Save photo"}>
            🔖
          </button>
        )}
        {post.author === meId && (
          <button className="icon-btn" onClick={remove} aria-label="Delete update">
            <IconTrash />
          </button>
        )}
      </div>
      {post.kind === "star" && (
        <div className="star-card">
          <span className="star-big" style={{ color: starColor(post.star_color).hex }} aria-hidden>
            ★
          </span>
          <p>
            A <strong>{starColor(post.star_color).label.toLowerCase()} star</strong> from {post.author === meId ? "you" : nameOf(post.author)}
            {post.to_user && post.to_user !== post.author && post.author === meId ? ` to ${nameOf(post.to_user)}` : ""} for <strong>{post.star_for}</strong>
          </p>
        </div>
      )}
      {post.text && <p className="post-text" style={{ whiteSpace: "pre-wrap" }}>{post.kind === "star" ? `“${post.text}”` : post.text}</p>}
      {post.spicy && post.author !== meId && (
        <Link className="btn btn-sm" href="/spicy" style={{ marginTop: 10, alignSelf: "flex-start" }}>
          🌶️ Open Spicy
        </Link>
      )}
      {saving && photos[slide] && <SaveSheet paths={[photos[slide].storage_path]} onClose={() => setSaving(false)} />}
      {post.kind === "lunch_you" && <LunchYou post={post} />}
      {post.plan_id && (
        <Link className="btn btn-sm" href={`/calendar?plan=${post.plan_id}`} style={{ marginTop: 10, alignSelf: "flex-start" }}>
          📅 Take a look
        </Link>
      )}
      {post.event_id && (
        <Link className="btn btn-sm" href={`/calendar?event=${post.event_id}`} style={{ marginTop: 10, alignSelf: "flex-start" }}>
          📅 Open in calendar
        </Link>
      )}
      {n === 1 && (
        <div className="photos n1">
          <a className="photo" href={urls[photos[0].storage_path]} target="_blank" rel="noreferrer" style={photos[0].width && photos[0].height ? { aspectRatio: `${photos[0].width} / ${photos[0].height}` } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {urls[photos[0].storage_path] && <img src={urls[photos[0].storage_path]} alt="" loading="lazy" />}
          </a>
        </div>
      )}
      {n > 1 && <Carousel photos={photos} urls={urls} slide={slide} onSlide={setSlide} />}
      {post.dogs.length > 0 && !asDog && (
        <div className="chips post-dogs">
          {post.dogs.map((d) => (
            <span key={d} className="sticker">
              <DogAvatar ids={[d]} size={18} photos={dogPhotos} /> {dogName(d)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

/** Swipe through a post's photos; dots show where you are. */
function Carousel({
  photos,
  urls,
  slide,
  onSlide,
}: {
  photos: Post["post_photos"];
  urls: Record<string, string>;
  slide: number;
  onSlide: (i: number) => void;
}) {
  // The tallest photo sets the frame so swiping doesn't jump; cap it like single photos.
  const ratio = Math.min(...photos.map((p) => (p.width && p.height ? p.width / p.height : 1)), 1.25);
  return (
    <div className="carousel-wrap">
      <div
        className="carousel"
        style={{ aspectRatio: `${Math.max(ratio, 0.75)}` }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== slide) onSlide(i);
        }}
      >
        {photos.map((ph) => (
          <a key={ph.id} className="carousel-slide" href={urls[ph.storage_path]} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {urls[ph.storage_path] && <img src={urls[ph.storage_path]} alt="" loading="lazy" />}
          </a>
        ))}
      </div>
      <span className="carousel-count">
        {slide + 1}/{photos.length}
      </span>
      <div className="carousel-dots" aria-hidden>
        {photos.map((ph, i) => (
          <span key={ph.id} className={i === slide ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

/** "Lunch: you? 😏": the person it's for answers; a no quietly removes it for both. */
function LunchYou({ post }: { post: Post }) {
  const { meId, nameOf, toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function answer(yes: boolean) {
    setBusy(true);
    const res = await fetch("/api/spicy/lunch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "answer", id: post.id, yes }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast("Couldn't send. Try again?");
    refreshAll();
    toast(yes ? "Bon appétit 😋" : "Maybe another time");
  }
  if (post.reply === "yes") return <p className="lunch-decided">😋 Bon appétit</p>;
  if (post.to_user !== meId) return <p className="small muted">Waiting on {nameOf(post.to_user)}…</p>;
  return (
    <div className="row wrap" style={{ marginTop: 8 }}>
      <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => answer(true)}>
        Bon appétit 😋
      </button>
      <button className="btn btn-sm" disabled={busy} onClick={() => answer(false)}>
        Not on the menu
      </button>
    </div>
  );
}
