import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Category from "@/models/Category";
import Product from "@/models/Product";
import { deleteMediaFromR2 } from "@/lib/r2";

// Walks up from `startId`'s ancestor chain to check whether `targetId` appears in it.
// Used to prevent a category from being nested under one of its own descendants.
async function isDescendantOf(targetId, startId) {
  let current = await Category.findById(startId).select("parent");
  let guard = 0;
  while (current?.parent && guard++ < 50) {
    if (String(current.parent) === String(targetId)) return true;
    current = await Category.findById(current.parent).select("parent");
  }
  return false;
}

// Returns [id, ...all descendant ids] (as strings)
async function collectTreeIds(rootId) {
  const ids = [String(rootId)];
  let frontier = [rootId];
  while (frontier.length) {
    const kids = await Category.find({ parent: { $in: frontier } }).select("_id");
    frontier = kids.map((k) => k._id);
    ids.push(...frontier.map(String));
  }
  return ids;
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

    const category = await Category.findByIdAndUpdate(
      id,
      { ...body, parent },
      { new: true, runValidators: true }
    );
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json({ category });
  } catch (err) {
    console.error("Update category error:", err);
    return NextResponse.json({ error: "Failed to update category." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid category id." }, { status: 400 });
    }

    const category = await Category.findById(id);
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });

    // This category + all nested subcategories
    const treeIds = await collectTreeIds(id);

    // Block if any product uses this category or any of its descendants
    const inUse = await Product.countDocuments({ category: { $in: treeIds } });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${inUse} product(s) still use this category or its subcategories.` },
        { status: 400 }
      );
    }

    // Collect images before deleting the docs
    const toDelete = await Category.find({ _id: { $in: treeIds } }).select("image");

    // Delete DB records first so an image-cleanup failure can't block deletion
    await Category.deleteMany({ _id: { $in: treeIds } });

    // Best-effort image cleanup (deleteMediaFromR2 also catches its own errors)
    await Promise.allSettled(
      toDelete
        .filter((c) => c.image?.publicId)
        .map((c) => deleteMediaFromR2(c.image.publicId))
    );

    return NextResponse.json({ success: true, deleted: treeIds.length });
  } catch (err) {
    console.error("Delete category error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete category." }, { status: 500 });
  }
}