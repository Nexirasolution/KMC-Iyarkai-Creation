"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { compressImage } from "@/lib/compressImage";

export default function MediaUploader({
  media = [],
  onChange,
  folder = "kmc-products",
  multiple = true,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  async function handleFiles(e) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;

    setUploading(true);
    setError("");

    try {
      const uploaded = [];

      for (let i = 0; i < picked.length; i++) {
        setProgress(`${i + 1}/${picked.length}`);

        // 0. Compress images in the browser (videos pass through untouched)
        const file = await compressImage(picked[i]);

        // 1. Ask our server for a presigned R2 upload URL (tiny JSON request)
        const sigRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folder,
            contentType: file.type,
            size: file.size,
            filename: file.name,
          }),
        });

        const sigData = await sigRes.json().catch(() => ({}));
        if (!sigRes.ok) {
          throw new Error(sigData.error || "Could not get upload permission");
        }

        const { uploadUrl, key, url, mediaType } = sigData;

        // 2. PUT the file directly to R2. Headers must match what was signed.
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
          body: file,
        });

        if (!putRes.ok) {
          throw new Error(`Upload to storage failed (${putRes.status})`);
        }

        uploaded.push({ url, publicId: key, mediaType });
      }

      onChange(multiple ? [...media, ...uploaded] : uploaded);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeMedia(index) {
    onChange(media.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {media.map((item, index) => (
          <div
            key={item.publicId || index}
            className="relative h-24 w-24 overflow-hidden rounded-lg border"
          >
            {item.mediaType === "video" ? (
              <video src={item.url} className="h-full w-full object-cover" controls />
            ) : item.url ? (
              <Image
                src={item.url}
                alt="Product image"
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                No image
              </div>
            )}

            <button
              type="button"
              onClick={() => removeMedia(index)}
              className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black text-white"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed text-sm"
        >
          {uploading ? `Uploading ${progress}` : "+ Add"}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple={multiple}
        onChange={handleFiles}
        className="hidden"
      />

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}