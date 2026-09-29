import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import Category from "@/models/Category";
import { getCategoryAndDescendantIds } from "@/lib/categoryTree";

// Escape regex special characters so search terms like "gift+set" or "100%" don't break the query
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PRICE_MODES = [
  "set",
  "increase_percent",
  "decrease_percent",
  "increase_amount",
  "decrease_amount",
];

function priceExpression(mode, v) {
  switch (mode) {
    case "set":
      return v;
    case "increase_percent":
      return { $round: [{ $multiply: ["$price", 1 + v / 100] }, 2] };
    case "decrease_percent":
      return { $round: [{ $multiply: ["$price", 1 - v / 100] }, 2] };
    case "increase_amount":
      return { $round: [{ $add: ["$price", v] }, 2] };
    case "decrease_amount":
      // never let a price drop below 0
      return { $max: [0, { $round: [{ $subtract: ["$price", v] }, 2] }] };
    default:
      return null;
  }
}

/**
 * PATCH /api/products/bulk-update
 *
 * Body:
 * {
 *   // Pick products EITHER by ids (selected rows)...
 *   ids: ["...", "..."],
 *   // ...OR by filter (every product matching, across all pages)
 *   filter: { category?: "<categoryId>", search?: "text" },
 *
 *   changes: {
 *     price?:      { mode: "set" | "increase_percent" | "decrease_percent" | "increase_amount" | "decrease_amount", value: number },
 *     category?:   "<categoryId>",   // move products to this category
 *     isActive?:   boolean,          // visible / hidden in store
 *     isFeatured?: boolean,
 *     unit?:       string
 *   }
 * }
 */
export async function PATCH(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { ids, filter, changes } = body;

    if (!changes || typeof changes !== "object") {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    // ---------- Which products? ----------
    let query;
    if (filter && typeof filter === "object") {
      query = {};
      if (filter.category) {
        const categoryIds = await getCategoryAndDescendantIds(filter.category);
        query.category = { $in: categoryIds };
      }
      const search = String(filter.search || "").trim();
      if (search) {
        const safe = escapeRegex(search);
        query.$or = [
          { name: { $regex: safe, $options: "i" } },
          { description: { $regex: safe, $options: "i" } },
          { shortDescription: { $regex: safe, $options: "i" } },
          { sku: { $regex: safe, $options: "i" } },
          { tags: { $regex: safe, $options: "i" } },
        ];
      }
    } else if (Array.isArray(ids) && ids.length && ids.every((id) => mongoose.isValidObjectId(id))) {
      query = { _id: { $in: ids } };
    } else {
      return NextResponse.json({ error: "Select at least one product." }, { status: 400 });
    }

    // ---------- What to change? ----------
    const setFields = {};

    if (changes.price !== undefined) {
      const { mode, value } = changes.price || {};
      const v = Number(value);
      if (!PRICE_MODES.includes(mode) || !Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: "Enter a valid price change." }, { status: 400 });
      }
      if (mode === "decrease_percent" && v > 100) {
        return NextResponse.json({ error: "A price cannot be reduced by more than 100%." }, { status: 400 });
      }
      setFields.price = priceExpression(mode, v);
    }

    if (changes.category !== undefined) {
      if (!mongoose.isValidObjectId(changes.category) || !(await Category.exists({ _id: changes.category }))) {
        return NextResponse.json({ error: "That category does not exist." }, { status: 400 });
      }
      // Pipeline updates are not auto-cast by Mongoose, so cast the id ourselves
      setFields.category = new mongoose.Types.ObjectId(changes.category);
    }

    if (changes.isActive !== undefined) {
      if (typeof changes.isActive !== "boolean") {
        return NextResponse.json({ error: "Status must be true or false." }, { status: 400 });
      }
      setFields.isActive = changes.isActive;
    }

    if (changes.isFeatured !== undefined) {
      if (typeof changes.isFeatured !== "boolean") {
        return NextResponse.json({ error: "Featured must be true or false." }, { status: 400 });
      }
      setFields.isFeatured = changes.isFeatured;
    }

    if (changes.unit !== undefined) {
      const unit = String(changes.unit).trim();
      if (!unit) {
        return NextResponse.json({ error: "Unit cannot be empty." }, { status: 400 });
      }
      setFields.unit = { $literal: unit };
    }

    if (!Object.keys(setFields).length) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    // Pipeline-style update lets price maths run atomically in one query.
    const result = await Product.updateMany(query, [{ $set: setFields }]);

    return NextResponse.json({
      success: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  } catch (err) {
    console.error("Bulk product update error:", err);
    return NextResponse.json({ error: "Failed to update products." }, { status: 500 });
  }
}