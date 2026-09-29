import { NextResponse } from "next/server";
import { getAudience } from "@/lib/audience";

// GET /api/admin/whatsapp/audience?consent=all|optedIn
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const consent = searchParams.get("consent") === "optedIn" ? "optedIn" : "all";
    const audience = await getAudience({ consent });
    return NextResponse.json({ count: audience.length });
  } catch (err) {
    console.error("Audience error:", err);
    return NextResponse.json({ error: "Failed to load audience." }, { status: 500 });
  }
}