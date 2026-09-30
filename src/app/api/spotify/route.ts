import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Resolves a Spotify share link (short spotify.link ones redirect) to its
 * open.spotify.com address, and gets the title and cover art from Spotify's
 * public oEmbed. Signed-in only, Spotify hosts only.
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return NextResponse.json({ error: "That doesn't look like a link." }, { status: 400 });
  }
  if (!/^(open\.spotify\.com|spotify\.link|spoti\.fi)$/i.test(u.hostname)) return NextResponse.json({ error: "That's not a Spotify link." }, { status: 400 });
  try {
    let final = u.toString();
    if (!/open\.spotify\.com$/i.test(u.hostname)) {
      const r = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(8000) });
      final = r.url;
      if (!/^https:\/\/open\.spotify\.com\//.test(final)) {
        // Some short links land on a page that links onward; find it.
        const html = await r.text();
        final = /https:\/\/open\.spotify\.com\/[a-z]+\/[A-Za-z0-9]+/.exec(html)?.[0] ?? final;
      }
    }
    const clean = final.split("?")[0];
    const o = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(clean)}`, { signal: AbortSignal.timeout(8000) });
    const meta = o.ok ? ((await o.json()) as { title?: string; thumbnail_url?: string }) : {};
    return NextResponse.json({ url: clean, title: meta.title ?? null, thumb: meta.thumbnail_url ?? null });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Spotify. Try again?" }, { status: 502 });
  }
}
