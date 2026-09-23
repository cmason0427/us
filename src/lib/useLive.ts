"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

// Last-known result per key, so switching tabs paints instantly from cache
// and then quietly refreshes — no spinners on navigation.
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function publish(key: string, value: unknown) {
  cache.set(key, value);
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribeKey(key: string, fn: () => void) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

/**
 * Fetches data and keeps it live: refetches whenever any of `tables` changes
 * (Supabase Realtime) and whenever the app comes back to the foreground
 * (phones drop sockets when backgrounded). Two users → refetching the whole
 * query is cheap and sidesteps merge bugs.
 */
export function useLive<T>(key: string, fetcher: () => Promise<T>, tables: string[]) {
  const data = useSyncExternalStore(
    useCallback((fn: () => void) => subscribeKey(key, fn), [key]),
    () => cache.get(key) as T | undefined,
    () => undefined,
  );

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(async () => {
    try {
      publish(key, await fetcherRef.current());
    } catch (err) {
      console.error(`useLive(${key})`, err);
    }
  }, [key]);

  const tablesKey = tables.join(",");
  useEffect(() => {
    refresh();

    const supabase = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 120);
    };
    const channel = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of tablesKey.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, bump);
    }
    channel.subscribe();

    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("us:refresh", bump);
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("us:refresh", bump);
    };
  }, [key, tablesKey, refresh]);

  return { data, refresh };
}

/** Nudge every live query to refetch now (after a local write, so it feels instant). */
export function refreshAll() {
  window.dispatchEvent(new Event("us:refresh"));
}
