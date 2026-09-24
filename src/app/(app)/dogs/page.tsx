"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import type { Post } from "@/lib/types";
import { usePhotoUrls } from "@/lib/photos";
import { DOGS, type DogId } from "@/lib/dogs";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { PostComposer } from "@/components/PostComposer";
import { PostCard } from "@/components/PostCard";
import { DogAvatar } from "@/components/DogAvatar";
import { DogPic } from "@/components/DogPic";
import { DogProfileCards } from "@/components/DogProfiles";
import { TaskList } from "@/components/TaskList";
import { Wavy } from "@/components/Art";

/** Everything Kodo & Wiley: their profiles (vet, meds, feeding…), their to-dos, and a feed of just dog notes. */
export default function DogsPage() {
  const wanted = useSearchParams().get("dog");
  const initialDog = DOGS.find((d) => d.id === wanted)?.id ?? null;
  return (
    <main className="page">
      <PageHead eyebrow="Kodo & Wiley" title="Dogs" art={<DogPic name="kodo_wiley_face" size={52} />} />
      <Wavy />
      <DogProfileCards />
      <Dogs initialDog={initialDog} />
    </main>
  );
}

/* ─── Dogs ──────────────────────────────────────────────────────────────── */

// Dog notes are feed posts tagged with dogs; to-dos also show in Ours.
function Dogs({ initialDog }: { initialDog: DogId | null }) {
  const supabase = supabaseBrowser();
  const { dogPhotos } = useApp();
  const [filter, setFilter] = useState<DogId | null>(initialDog);
  const [writing, setWriting] = useState(false);
  const pickFilter = (d: DogId | null) => {
    setFilter(d);
    window.history.replaceState(null, "", d ? `/dogs?dog=${d}` : "/dogs");
  };

  const { data: notes = [] } = useLive<Post[]>(
    `dog-notes:${filter ?? "all"}`,
    async () => {
      let q = supabase.from("posts").select("*, post_photos(*)");
      q = filter ? q.contains("dogs", [filter]) : q.overlaps("dogs", DOGS.map((d) => d.id));
      const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as Post[];
    },
    ["posts", "post_photos"],
  );
  const urls = usePhotoUrls(notes.flatMap((p) => p.post_photos.map((ph) => ph.storage_path)));

  return (
    <>
      <button className="card composer-prompt" onClick={() => setWriting(true)}>
        <DogPic name="kodo_wiley_face" size={40} />
        <span>Add a dog note… it posts as the dog</span>
      </button>

      <div style={{ marginTop: 18 }}>
        <TaskList listType="dogs" title="Dog to-dos" hint="Also shows in Ours. Tap an item to edit it." />
      </div>

      <div className="section-title">
        <DogPic name="kodo_wiley_back_walk" size={26} /> Dog notes
      </div>
      <div className="chips" role="group" aria-label="Show notes for" style={{ marginBottom: 12 }}>
        <button className="chip" aria-pressed={filter === null} onClick={() => pickFilter(null)}>
          Both
        </button>
        {DOGS.map((d) => (
          <button key={d.id} className="chip" aria-pressed={filter === d.id} onClick={() => pickFilter(d.id)}>
            <DogAvatar ids={[d.id]} size={22} photos={dogPhotos} /> {d.name}
          </button>
        ))}
      </div>
      {notes.length === 0 ? (
        <p className="muted">No dog notes yet.</p>
      ) : (
        <div className="feed">
          {notes.map((p) => (
            <PostCard key={p.id} post={p} urls={urls} />
          ))}
        </div>
      )}

      {writing && (
        <Sheet title="Dog note" onClose={() => setWriting(false)}>
          <PostComposer dogNote initialDogs={filter ? [filter] : []} onDone={() => setWriting(false)} />
        </Sheet>
      )}
    </>
  );
}
