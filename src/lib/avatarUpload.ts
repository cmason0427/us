"use client";

import { supabaseBrowser } from "./supabase/client";
import { shrinkImage } from "./image";

/**
 * Uploads a small square-ish profile photo under the uploader's own folder
 * (storage rules only allow that) and returns its path.
 */
export async function uploadAvatar(meId: string, name: string, file: File) {
  const { blob, ext } = await shrinkImage(file, 512);
  const path = `${meId}/avatars/${name}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await supabaseBrowser().storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

/** Best-effort cleanup of a replaced photo (only ones in your own folder can be deleted). */
export async function removeOldAvatar(meId: string, oldPath: string | null | undefined) {
  if (oldPath?.startsWith(`${meId}/`)) await supabaseBrowser().storage.from("photos").remove([oldPath]);
}
