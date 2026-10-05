"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Board } from "@/components/Board";
import { useThreads } from "@/components/Threads";

/** A thread's board, full screen. */
export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const postNow = useSearchParams().get("post") === "1";
  const { threads } = useThreads();
  const thread = threads.find((t) => t.id === id);
  if (!thread) return <main className="page"><p className="muted">Loading…</p></main>;
  return <Board thread={thread} postNow={postNow} />;
}
