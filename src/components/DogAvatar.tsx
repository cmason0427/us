"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import { dogName } from "@/lib/dogs";
import { usePhotoUrls } from "@/lib/photos";

/** Each dog's profile photo (signed URL), keyed by dog id. */
export function useDogPhotos() {
  const { data: rows = [] } = useLive<{ id: string; photo_path: string | null }[]>(
    "dogs",
    async () => {
      const { data, error } = await supabaseBrowser().from("dogs").select("id, photo_path");
      if (error) throw error;
      return data;
    },
    ["dogs"],
  );
  const paths = rows.flatMap((r) => (r.photo_path ? [r.photo_path] : []));
  const urls = usePhotoUrls(paths);
  const photos: Record<string, string | undefined> = {};
  for (const r of rows) photos[r.id] = r.photo_path ? urls[r.photo_path] : undefined;
  return photos;
}

/** A dog's round photo, or their illustrated face until one's set. Several dogs overlap like a little stack. */
export function DogAvatar({ ids, size = 34, photos }: { ids: string[]; size?: number; photos: Record<string, string | undefined> }) {
  const one = (id: string, i: number) => (
    <span
      key={id}
      className="dog-avatar"
      title={dogName(id)}
      style={{ width: size, height: size, fontSize: size * 0.45, marginLeft: i ? -size * 0.35 : 0, zIndex: ids.length - i }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photos[id] ? <img src={photos[id]} alt={dogName(id)} /> : <img src={`/stickers/${id}_face.webp`} alt={dogName(id)} style={{ transform: "scale(1.3)", objectFit: "cover" }} />}
    </span>
  );
  return <span className="dog-avatars">{ids.map(one)}</span>;
}
