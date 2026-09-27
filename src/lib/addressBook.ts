"use client";

import { supabaseBrowser } from "./supabase/client";
import { useLive } from "./useLive";

export interface BookPlace {
  id: string;
  name: string;
  address: string | null;
}
/** The shared address book, for picking an address anywhere. */
export function useAddressBook() {
  const { data = [] } = useLive<BookPlace[]>(
    "address_book",
    async () => {
      const { data, error } = await supabaseBrowser().from("address_book").select("*").order("name");
      if (error) throw error;
      return data as BookPlace[];
    },
    ["address_book"],
  );
  return data.filter((p) => p.address);
}
