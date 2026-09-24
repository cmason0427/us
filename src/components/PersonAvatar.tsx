"use client";

import { useApp } from "./AppProvider";

/** Your profile photo, or your initial on a colored circle until you set one. */
export function PersonAvatar({ id, size = 34 }: { id: string | null | undefined; size?: number }) {
  const { meId, nameOf, personPhotos } = useApp();
  const url = id ? personPhotos[id] : undefined;
  return (
    <span
      className="avatar-btn"
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.42, background: id === meId ? "var(--butter)" : "var(--rose)", overflow: "hidden" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : nameOf(id)[0]?.toUpperCase()}
    </span>
  );
}
