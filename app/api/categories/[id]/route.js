import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Category from "@/models/Category";
import Product from "@/models/Product";
import { deleteMediaFromCloudinary } from "@/lib/cloudinary";

// Walks up from `startId`'s ancestor chain to check whether `targetId` appears in it.
// Used to prevent a category from being nested under one of its own descendants.
async function isDescendantOf(targetId, startId) {
  let current = await Category.findById(startId).select("parent");
  while (current?.parent) {
    if (String(current.parent) === String(targetId)) return true;
    current = await Category.findById(current.parent).select("parent");
  }
  return false;
}

export async function GET(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const category = await Category.findById(id);
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json({ category });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch category." }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();

    const parent = body.parent || null;

    if (parent) {
      if (parent === id) {
        return NextResponse.json({ error: "A category cannot be its own parent." }, { status: 400 });
      }

      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        return NextResponse.json({ error: "Selected parent category does not exist." }, { status: 400 });
      }

      // Prevent cycles: the chosen parent can't be a descendant of this category
      const wouldCycle = await isDescendantOf(id, parent);
      if (wouldCycle) {
        return NextResponse.json(
          { error: "Cannot move a category under its own subcategory." },
          { status: 400 }
        );
      }
    }

    const category = await Category.findByIdAndUpdate(id, { ...body, parent }, { new: true, runValidators: true });
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json({ category });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update category." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;

    const inUse = await Product.countDocuments({ category: id });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${inUse} product(s) still use this category.` },
        { status: 400 }
      );
    }

    const childCount = await Category.countDocuments({ parent: id });
    if (childCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${childCount} subcategor${childCount === 1 ? "y" : "ies"} still exist under this category.` },
        { status: 400 }
      );
    }

    const category = await Category.findById(id);
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });

    if (category.image?.publicId) {
      await deleteMediaFromCloudinary(category.image.publicId, "image");
    }
    await category.deleteOne();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete category error:", err);
    return NextResponse.json({ error: "Failed to delete category." }, { status: 500 });
  }
}