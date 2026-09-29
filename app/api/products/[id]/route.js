import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import "@/models/Category";
import { deleteMediaFromCloudinary } from "@/lib/cloudinary";
import { normalizeWeight } from "@/lib/weight";

function normalizeMedia(media) {
  if (!Array.isArray(media)) return undefined;
  return media.map((item) => ({
    url: item.url,
    publicId: item.publicId,
    type: item.type || item.mediaType || "image",
  }));
}

export async function GET(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const product =
      (await Product.findById(id).populate("category", "name slug")) ||
      (await Product.findOne({ slug: id }).populate("category", "name slug"));

    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ product });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch product." }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();

    if (body.media) {
      body.media = normalizeMedia(body.media);
    }

    // Optional weight. Sending { value: 0 } (or blank) clears it.
    if (body.weight !== undefined) {
      body.weight = normalizeWeight(body.weight);
    }

    if (body.sku !== undefined) {
      const sku = String(body.sku).trim().toUpperCase();
      if (!sku) {
        return NextResponse.json({ error: "SKU is required." }, { status: 400 });
      }
      const dupSku = await Product.findOne({ sku, _id: { $ne: id } });
      if (dupSku) {
        return NextResponse.json({ error: `SKU "${sku}" is already in use.` }, { status: 400 });
      }
      body.sku = sku;
    }

    try {
      const product = await Product.findByIdAndUpdate(id, body, { new: true, runValidators: true });
      if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
      return NextResponse.json({ product });
    } catch (err) {
      if (err.code === 11000) {
        return NextResponse.json({ error: "SKU must be unique." }, { status: 400 });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update product." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const product = await Product.findById(id);

    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    if (product.media?.length) {
      await Promise.all(
        product.media.map((item) =>
          deleteMediaFromCloudinary(item.publicId, item.type || "image")
        )
      );
    }

    if (product.images?.length) {
      await Promise.all(
        product.images.map((item) => deleteMediaFromCloudinary(item.publicId, "image"))
      );
    }

    await product.deleteOne();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete product error:", err);
    return NextResponse.json({ error: "Failed to delete product." }, { status: 500 });
  }
}