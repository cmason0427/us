import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_BYTES = 15 * 1024 * 1024;

// Hostnames that point back inside a network; never fetch those.
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i;

/**
 * Grabs an image from a link on the server (browsers usually can't, because of
 * CORS), so "add from a link" can upload it like any other photo. Signed-in
 * only, images only, 15MB max.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { url } = (await req.json()) as { url?: string };
  let u: URL;
  try {
    u = new URL(String(url ?? "").trim());
  } catch {
    return NextResponse.json({ error: "That doesn't look like a link." }, { status: 400 });
  }
  if (!/^https?:$/.test(u.protocol) || PRIVATE.test(u.hostname)) return NextResponse.json({ error: "Can't use that link." }, { status: 400 });
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(12_000), redirect: "follow", headers: { accept: "image/*" } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return NextResponse.json({ error: "That link isn't a picture. Try “copy image address” instead." }, { status: 400 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "That picture is too big." }, { status: 400 });
    return new NextResponse(buf, { headers: { "content-type": type, "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load that link." }, { status: 400 });
  }
}
