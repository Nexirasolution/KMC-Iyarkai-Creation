// Client-side image compression (no dependencies, runs in the browser).
// Resizes to fit within maxDimension and re-encodes as WebP.
// Falls back to the original file if anything fails or the result isn't smaller.

const SKIP_TYPES = new Set(["image/gif", "image/svg+xml"]); // animated / vector

export async function compressImage(
  file,
  { maxDimension = 1600, quality = 0.8, minBytesToCompress = 100 * 1024 } = {}
) {
  if (!file.type.startsWith("image/") || SKIP_TYPES.has(file.type)) return file;
  if (file.size < minBytesToCompress) return file; // already small

  try {
    // imageOrientation "from-image" applies EXIF rotation (phone photos)
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality)
    );

    // toBlob falls back to PNG on browsers without WebP encoding; ignore that
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], newName, { type: "image/webp", lastModified: Date.now() });
  } catch (err) {
    console.warn("Image compression skipped:", err);
    return file; // e.g. HEIC on browsers that can't decode it
  }
}