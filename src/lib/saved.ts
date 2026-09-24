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
 * Save copies of these photos into one of your folders. They're copied under
 * your own storage folder so they stay even if the original post is deleted.
 */
export async function saveCopies(meId: string, folderId: string, paths: string[]) {
  const supabase = supabaseBrowser();
  const rows = [];
  for (const from of paths) {
    const ext = from.split(".").pop() || "jpg";
    const to = `${meId}/saved/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("photos").copy(from, to);
    if (error) throw error;
    rows.push({ owner: meId, folder_id: folderId, storage_path: to, added_by: meId });
  }
  const { error } = await supabase.from("saves").insert(rows);
  if (error) throw error;
}
