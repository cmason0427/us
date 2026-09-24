"use client";

/** Fire-and-forget: ask the server to push the partner about something we just did. */
export function notify(body: { kind: "ask" | "ask_answered" | "post" | "lunch" | "vibe"; id: string } | { kind: "energy_request" | "test" }) {
  return fetch("/api/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((r) => r.json() as Promise<{ sent?: number; error?: string }>)
    .catch(() => ({ sent: 0 }));
}
