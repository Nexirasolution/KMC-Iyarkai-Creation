import { NextResponse } from "next/server";
import { createPresignedUpload, sanitizeFolder } from "@/lib/r2";

// TODO: protect this route with your admin auth check, otherwise anyone
// can upload to your bucket.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const result = await createPresignedUpload({
      folder: sanitizeFolder(body.folder),
      contentType: body.contentType,
      size: Number(body.size),
      filename: body.filename || "",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Upload URL error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create upload URL." },
      { status: 400 }
    );
  }
}