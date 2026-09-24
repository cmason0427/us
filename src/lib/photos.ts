"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase/client";

// Signed URLs for private photos, cached for the session (they last an hour).
const urlCache = new Map<string, { url: string; exp: number }>();

export function usePhotoUrls(paths: string[]) {
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
