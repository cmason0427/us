"use client";

const MAX_EDGE = 1800;

/**
 * Downscale a phone photo to something sane before upload (a 12MP HEIC→JPEG
 * is 4–8MB; this lands around 300–600KB). Falls back to the original file if
 * the browser can't decode it.
 */
export async function shrinkImage(file: File, maxEdge = MAX_EDGE): Promise<{ blob: Blob; width: number | null; height: number | null; ext: string }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.84));
    if (!blob) throw new Error("encode failed");
    return { blob, width: w, height: h, ext: "jpg" };
  } catch {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    return { blob: file, width: null, height: null, ext };
  }
}
