"use client";

import { supabaseBrowser } from "./supabase/client";
import { useLive } from "./useLive";

export interface Folder {
  id: string;
  name: string;
  is_spicy: boolean;
  created_at: string;
  saves: { count: number }[];
}
export interface Save {
  id: string;
  folder_id: string;
  storage_path: string;
  caption: string | null;
  added_by: string;
  created_at: string;
}

/** Your folders (RLS: only yours), Spicy first, with counts. */
export function useFolders() {
  const { data = [] } = useLive<Folder[]>(
    "folders",
    async () => {
      const { data, error } = await supabaseBrowser().from("folders").select("id, name, is_spicy, created_at, saves(count)").order("created_at");
      if (error) throw error;
      return (data as Folder[]).sort((a, b) => Number(b.is_spicy) - Number(a.is_spicy));
    },
    ["folders", "saves"],
  );
  return data;
}

export function useSaves(folderId: string | null) {
  const { data = [] } = useLive<Save[]>(
    `saves:${folderId}`,
    async () => {
      if (!folderId) return [];
      const { data, error } = await supabaseBrowser().from("saves").select("*").eq("folder_id", folderId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Save[];
    },
    ["saves"],
  );
  return data;
}

/**
 * Save copies of these photos into one of your folders (under your own storage
 * folder, so they outlive the post), skipping any already saved there.
 * Returns how many were new.
 */
export async function saveCopies(meId: string, folderId: string, paths: string[]) {
  const supabase = supabaseBrowser();
  const { data: have } = await supabase.from("saves").select("source_path").eq("folder_id", folderId).in("source_path", paths);
  const already = new Set((have ?? []).map((h) => h.source_path));
  const fresh = [...new Set(paths)].filter((p) => !already.has(p));
  const rows = [];
  for (const from of fresh) {
    const ext = from.split(".").pop() || "jpg";
    const to = `${meId}/saved/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("photos").copy(from, to);
    if (error) throw error;
    rows.push({ owner: meId, folder_id: folderId, storage_path: to, source_path: from, added_by: meId });
  }
  if (rows.length) {
    const { error } = await supabase.from("saves").insert(rows);
    if (error) throw error;
  }
  return { saved: rows.length, skipped: paths.length - rows.length };
}
