import { NextResponse } from "next/server";
import { uploadToR2, mediaTypeOf, sanitizeFolder } from "@/lib/r2";

// Legacy server-side upload (used by ImageUploader). Subject to your host's
// request body limit (4.5 MB on Vercel). Prefer MediaUploader for large files.
export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const folder = sanitizeFolder(formData.get("folder"));

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const mediaType = mediaTypeOf(file.type);
    if (!mediaType) {
      return NextResponse.json({ error: "Only images and videos are allowed" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadToR2(buffer, folder, mediaType, file.type, file.name);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}