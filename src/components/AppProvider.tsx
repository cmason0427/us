"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import type { Profile } from "@/lib/types";
import { awayTooLong, isUnlocked, lockAndGoToLogin, markHidden } from "@/lib/lock";

export type AddKind = "post" | "event" | "task" | "household" | "dog-note" | "dog-task" | "activity";

interface AppCtx {
  meId: string;
  me: Profile | undefined;
  partner: Profile | undefined;
  profiles: Profile[];
  nameOf: (userId: string | null | undefined) => string;
  toast: (msg: string) => void;
  openAdd: (kind?: AddKind | "menu") => void;
  addOpen: AddKind | "menu" | null;
  closeAdd: () => void;
}

const Ctx = createContext<AppCtx | null>(null);
// The unlock flag only changes via a full page load, so there's nothing to subscribe to.
const noSubscribe = () => () => {};

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

export function AppProvider({ meId, children }: { meId: string; children: ReactNode }) {
  const supabase = supabaseBrowser();
  const { data: profiles = [] } = useLive<Profile[]>(
    "profiles",
    async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at");
      if (error) throw error;
      return data as Profile[];
    },
    ["profiles"],
  );

  const me = profiles.find((p) => p.id === meId);
  const partner = profiles.find((p) => p.id !== meId);

  // Reminders are formatted server-side in each person's timezone; keep it current.
  useEffect(() => {
    if (!me) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== me.timezone) {
      supabase.from("profiles").update({ timezone: tz }).eq("id", meId).then(() => {});
    }
  }, [me, meId, supabase]);

  // Service worker: needed for install-to-home-screen and push.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toast = useCallback((msg: string) => setToastMsg(msg), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const [addOpen, setAddOpen] = useState<AddKind | "menu" | null>(null);

  // PIN on every entry (see lib/lock). Nothing renders until we know it's unlocked.
  const unlocked = useSyncExternalStore(noSubscribe, isUnlocked, () => false);
  useEffect(() => {
    if (!isUnlocked()) return lockAndGoToLogin();
    const onVis = () => {
      if (document.visibilityState === "hidden") markHidden();
      else if (awayTooLong()) lockAndGoToLogin();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const value = useMemo<AppCtx>(() => {
    const byId = new Map(profiles.map((p) => [p.id, p.display_name]));
    return {
      meId,
      me,
      partner,
      profiles,
      nameOf: (id) => (id ? byId.get(id) ?? "Someone" : "Both of us"),
      toast,
      addOpen,
      openAdd: (kind = "menu") => setAddOpen(kind),
      closeAdd: () => setAddOpen(null),
    };
  }, [meId, me, partner, profiles, toast, addOpen]);

  return (
    <Ctx.Provider value={value}>
      {unlocked ? children : null}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </Ctx.Provider>
  );
}
