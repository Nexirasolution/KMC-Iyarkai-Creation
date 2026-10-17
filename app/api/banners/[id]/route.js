import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Banner from "@/models/Banner";
import { deleteMediaFromCloudinary } from "@/lib/r2";

export async function GET(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const banner = await Banner.findById(id);
    if (!banner) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    return NextResponse.json({ banner });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch banner." }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();

    const banner = await Banner.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });

    if (!banner) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    return NextResponse.json({ banner });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update banner." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;

    const banner = await Banner.findById(id);
    if (!banner) return NextResponse.json({ error: "Banner not found." }, { status: 404 });

    if (banner.image?.publicId) {
      await deleteMediaFromCloudinary(banner.image.publicId, "image");
    }

    await banner.deleteOne();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete banner error:", err);
    return NextResponse.json({ error: "Failed to delete banner." }, { status: 500 });
  }
}