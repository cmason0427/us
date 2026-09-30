// Spotify links → embeds. Works with open.spotify.com links (any locale
// prefix), spotify: URIs, and (after the server resolves them) short
// spotify.link / spoti.fi share links.

export type SpotifyRef = { type: "track" | "album" | "playlist" | "episode" | "show" | "artist"; id: string; url: string };

const LINK = /https?:\/\/(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)[^\s]*|(?:spotify\.link|spoti\.fi)\/[A-Za-z0-9]+[^\s]*)/i;
const URI = /spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]+)/i;

/** The first Spotify link in some text (short links come back with no id). */
export function findSpotify(text: string | null | undefined): (SpotifyRef & { short?: false }) | { short: true; url: string } | null {
  if (!text) return null;
  const m = LINK.exec(text);
  if (m) {
    if (!m[1]) return { short: true, url: m[0] };
    return { type: m[1].toLowerCase() as SpotifyRef["type"], id: m[2], url: m[0] };
  }
  const u = URI.exec(text);
  if (u) return { type: u[1].toLowerCase() as SpotifyRef["type"], id: u[2], url: `https://open.spotify.com/${u[1].toLowerCase()}/${u[2]}` };
  return null;
}

export const embedUrl = (r: Pick<SpotifyRef, "type" | "id">) => `https://open.spotify.com/embed/${r.type}/${r.id}?utm_source=generator`;

/** Text with the Spotify link taken out (the player shows it instead). */
export const withoutSpotify = (text: string, url: string) => text.replace(url, "").replace(/\n{3,}/g, "\n\n").trim();

/** Ask our server to resolve a (short) link and fetch its title and art. */
export async function lookupSpotify(url: string): Promise<{ url: string; title: string | null; thumb: string | null } | { error: string }> {
  const res = await fetch(`/api/spotify?url=${encodeURIComponent(url)}`).catch(() => null);
  if (!res) return { error: "Couldn't reach Spotify." };
  return res.json();
}
