"use client";

import { embedUrl, type SpotifyRef } from "@/lib/spotify";

/** Spotify's own player. Compact is the one-line bar; full shows the art. */
export function SpotifyEmbed({ r, compact = false }: { r: Pick<SpotifyRef, "type" | "id">; compact?: boolean }) {
  const tall = !compact && (r.type === "album" || r.type === "playlist" || r.type === "show" || r.type === "artist");
  return (
    <iframe
      className="spotify-embed"
      src={embedUrl(r)}
      width="100%"
      height={compact ? 80 : tall ? 352 : 152}
      loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      title="Spotify player"
    />
  );
}
