"use client";

// Long videos on the free storage plan: every stored file has to be under
// 50 MB, and the whole project has 1 GB. So a video goes up in pieces (each
// under the cap) and only gets shrunk when it's big: anything up to ~90 MB
// goes up exactly as it is. Bigger ones are re-encoded on the phone to about
// 80 MB, and the shorter the video, the sharper that stays (a 2-minute clip
// keeps 720p; 10 minutes ends up around 480p).

export const PART_BYTES = 45 * 1024 * 1024;
export const MAX_SECONDS = 10 * 60 + 5;
const KEEP_AS_IS_BYTES = 90 * 1024 * 1024;
const TARGET_BYTES = 80 * 1024 * 1024;

export interface PreparedVideo {
  blob: Blob;
  duration: number;
  poster: Blob | null;
  shrunk: boolean;
}

async function canvasToJpeg(c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ("convertToBlob" in c) return c.convertToBlob({ type: "image/jpeg", quality: 0.7 });
  return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.7));
}

export async function prepareVideo(file: File, onProgress: (label: string) => void): Promise<PreparedVideo> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const duration = await input.computeDuration();
  if (duration > MAX_SECONDS) throw new Error(`That one's ${Math.round(duration / 60)} minutes. Keep it to 10.`);
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("Couldn't read that video.");

  // A still for the grid, so nobody downloads a whole video to see a thumbnail.
  let poster: Blob | null = null;
  try {
    const sink = new mb.CanvasSink(track, { width: 360 });
    const first = await track.getFirstTimestamp();
    const shot = await sink.getCanvas(first + Math.min(1, duration / 2));
    if (shot) poster = await canvasToJpeg(shot.canvas);
  } catch {
    poster = null;
  }

  if (file.size <= KEEP_AS_IS_BYTES) return { blob: file, duration, poster, shrunk: false };

  if (!(await mb.canEncodeVideo("avc"))) throw new Error("This phone can't shrink videos. Try a clip under about 90 MB.");
  const audioBps = 160_000;
  const videoBps = Math.max(450_000, Math.min(4_000_000, (TARGET_BYTES * 8) / Math.max(1, duration) - audioBps));
  const short = videoBps >= 2_500_000 ? 720 : videoBps >= 1_200_000 ? 540 : 480;
  const w = track.displayWidth;
  const h = track.displayHeight;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  // Only ever shrink, never blow up a small video.
  const size = Math.min(w, h) <= short ? {} : h > w ? { width: even(short) } : { height: even(short) };

  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: { ...size, codec: "avc", quality: new mb.Quality({ bitrate: Math.round(videoBps), bitrateMode: "variable" }), forceTranscode: true },
    showWarnings: false,
  });
  if (!conversion.isValid) throw new Error("This phone can't shrink that video. Try a shorter clip.");
  conversion.onProgress = (p) => onProgress(`Shrinking the video… ${Math.round(p * 100)}%`);
  await conversion.execute();
  const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
  if (!buf) throw new Error("Shrinking the video failed.");
  const blob = new Blob([buf], { type: "video/mp4" });
  return blob.size < file.size ? { blob, duration, poster, shrunk: true } : { blob: file, duration, poster, shrunk: false };
}

/** Storage paths for each piece: the first is the video's own path, the rest get .p1, .p2, … */
export const partPaths = (path: string, parts: number) => Array.from({ length: parts }, (_, k) => (k === 0 ? path : `${path}.p${k}`));

// Stitched-together videos, kept for the session.
const stitched = new Map<string, string>();

/** A playable URL for a video stored in pieces: downloads them all and joins them on the phone. */
export async function stitchVideo(signedUrls: string[], key: string, onProgress?: (pct: number) => void) {
  const hit = stitched.get(key);
  if (hit) return hit;
  const blobs: Blob[] = [];
  for (const [k, u] of signedUrls.entries()) {
    const r = await fetch(u);
    if (!r.ok) throw new Error("Couldn't load the video.");
    blobs.push(await r.blob());
    onProgress?.(Math.round(((k + 1) / signedUrls.length) * 100));
  }
  const url = URL.createObjectURL(new Blob(blobs, { type: "video/mp4" }));
  stitched.set(key, url);
  return url;
}
