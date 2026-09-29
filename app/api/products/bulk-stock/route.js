import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";

const isInt = (n) => Number.isInteger(n) && n >= 0;

/**
 * PATCH /api/products/bulk-stock
 *
 * Mode A - per-product values ("Save all changes"):
 *   { updates: [{ id, stock }, ...] }
 *
 * Mode B - same operation on many products (category-wise updates):
 *   { ids: [...], action?: "set" | "add" | "subtract", value?: number, lowStockThreshold?: number }
 *   - action + value change stock ("subtract" never goes below 0)
 *   - lowStockThreshold changes the low-stock alert level
 *   - you can send either one or both
 */
export async function PATCH(req) {
  try {
    await connectDB();
    const body = await req.json();

    // ---- Mode A: individual stock values ----
    if (Array.isArray(body.updates)) {
      const ops = [];
      for (const u of body.updates) {
        const stock = Number(u.stock);
        if (!mongoose.isValidObjectId(u.id) || !isInt(stock)) {
          return NextResponse.json(
            { error: "Each update needs a valid product id and a whole-number stock of 0 or more." },
            { status: 400 }
          );
        }
        ops.push({ updateOne: { filter: { _id: u.id }, update: { $set: { stock } } } });
      }
      if (!ops.length) {
        return NextResponse.json({ error: "No updates provided." }, { status: 400 });
      }
      const result = await Product.bulkWrite(ops, { ordered: false });
      return NextResponse.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
    }

    // ---- Mode B: one operation on many products ----
    const { ids, action, lowStockThreshold } = body;
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => mongoose.isValidObjectId(id))) {
      return NextResponse.json({ error: "Select at least one valid product." }, { status: 400 });
    }

    const setFields = {};

    if (action) {
      const value = Number(body.value);
      if (!["set", "add", "subtract"].includes(action) || !isInt(value)) {
        return NextResponse.json(
          { error: "Stock value must be a whole number of 0 or more." },
          { status: 400 }
        );
      }
      if (action === "set") setFields.stock = value;
      if (action === "add") setFields.stock = { $add: ["$stock", value] };
      if (action === "subtract") setFields.stock = { $max: [0, { $subtract: ["$stock", value] }] };
    }

    if (lowStockThreshold !== undefined && lowStockThreshold !== null && lowStockThreshold !== "") {
      const t = Number(lowStockThreshold);
      if (!isInt(t)) {
        return NextResponse.json(
          { error: "Low stock alert must be a whole number of 0 or more." },
          { status: 400 }
        );
      }
      setFields.lowStockThreshold = t;
    }

    if (!Object.keys(setFields).length) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    // Pipeline-style update lets "add" / "subtract" run atomically in one query.
    const result = await Product.updateMany({ _id: { $in: ids } }, [{ $set: setFields }]);
    return NextResponse.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    console.error("Bulk stock update error:", err);
    return NextResponse.json({ error: "Failed to update stock." }, { status: 500 });
  }
}