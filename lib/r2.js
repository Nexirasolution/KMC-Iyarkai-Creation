import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

export const BUCKET = process.env.R2_BUCKET;
export const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
export const CACHE_CONTROL = "public, max-age=31536000, immutable";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  // Newer AWS SDK versions add CRC32 checksums to presigned URLs, which
  // breaks browser uploads to R2. Only compute them when required.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const EXT_BY_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/heic": ".heic",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

export function sanitizeFolder(folder, fallback = "kmc-products") {
  const clean = String(folder || "").replace(/^\/+|\/+$/g, "");
  if (!clean || clean.includes("..") || !/^[a-zA-Z0-9/_-]+$/.test(clean)) {
    return fallback;
  }
  return clean;
}

export function mediaTypeOf(contentType = "") {
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "image";
  return null;
}

export function buildKey(folder, contentType, filename = "") {
  const fromName = filename.includes(".")
    ? "." + filename.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  const ext = EXT_BY_TYPE[contentType] || fromName || "";
  return `${sanitizeFolder(folder)}/${crypto.randomUUID()}${ext}`;
}

export function publicUrlFor(key) {
  return `${PUBLIC_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Presigned PUT URL so the browser uploads straight to R2. */
export async function createPresignedUpload({ folder, contentType, size, filename }) {
  const mediaType = mediaTypeOf(contentType);
  if (!mediaType) throw new Error("Only image and video files are allowed.");

  const limit = mediaType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!Number.isFinite(size) || size <= 0) throw new Error("Invalid file size.");
  if (size > limit) {
    throw new Error(`File too large (max ${Math.round(limit / 1024 / 1024)} MB for ${mediaType}s).`);
  }

  const key = buildKey(folder, contentType, filename);

  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: size, // signed, so clients can't upload a bigger file
      CacheControl: CACHE_CONTROL,
    }),
    { expiresIn: 600 }
  );

  return { uploadUrl, key, url: publicUrlFor(key), mediaType };
}

/** Server-side upload (small files only, e.g. via /api/upload). */
export async function uploadToR2(buffer, folder = "kmc-products", mediaType = "image", contentType, filename) {
  if (!buffer) throw new Error("No file buffer provided");
  const type = contentType || (mediaType === "video" ? "video/mp4" : "image/jpeg");
  const key = buildKey(folder, type, filename);

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: type,
      CacheControl: CACHE_CONTROL,
    })
  );

  // `publicId` now holds the R2 object key, so existing DB fields keep working.
  return { url: publicUrlFor(key), publicId: key, mediaType };
}

export async function deleteMediaFromR2(key /*, mediaType (unused, kept for compatibility) */) {
  if (!key) return;
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (error) {
    console.error("R2 delete failed:", error.message);
  }
}

export async function r2ObjectExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return false;
    throw e;
  }
}