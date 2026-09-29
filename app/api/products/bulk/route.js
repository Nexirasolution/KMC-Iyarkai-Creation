import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import Category from "@/models/Category";
import { WEIGHT_UNITS } from "@/lib/weight";

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const v = String(value).trim().toLowerCase();
  return ["yes", "true", "1", "y"].includes(v);
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export async function POST(req) {
  try {
    await connectDB();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames.includes("Products")
      ? "Products"
      : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rows.length) {
      return NextResponse.json({ error: "The sheet is empty." }, { status: 400 });
    }

    // Preload categories once, match case-insensitively by name.
    const categories = await Category.find({});
    const categoryByName = new Map(
      categories.map((c) => [c.name.trim().toLowerCase(), c])
    );

    // Existing slugs, to keep uniqueness fast across a large sheet.
    const existingSlugs = new Set(
      (await Product.find({}, "slug")).map((p) => p.slug)
    );

    // Existing SKUs, so duplicates are caught before hitting the DB.
    const existingSkus = new Set(
      (await Product.find({}, "sku")).map((p) => p.sku).filter(Boolean)
    );

    const results = [];
    const toInsert = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // header is row 1
      const name = String(row.name || "").trim();
      const sku = String(row.sku || "").trim().toUpperCase();
      const categoryName = String(row.category || "").trim();
      const price = toNumber(row.price, NaN);

      if (!name) {
        results.push({ row: rowNum, status: "error", message: "Missing product name." });
        return;
      }
      if (!sku) {
        results.push({ row: rowNum, name, status: "error", message: "Missing SKU." });
        return;
      }
      if (existingSkus.has(sku)) {
        results.push({ row: rowNum, name, status: "error", message: `SKU "${sku}" is already in use.` });
        return;
      }
      if (!categoryName) {
        results.push({ row: rowNum, name, status: "error", message: "Missing category." });
        return;
      }
      const category = categoryByName.get(categoryName.toLowerCase());
      if (!category) {
        results.push({
          row: rowNum,
          name,
          status: "error",
          message: `Category "${categoryName}" does not exist. Create it first.`,
        });
        return;
      }
      if (Number.isNaN(price)) {
        results.push({ row: rowNum, name, status: "error", message: "Price must be a number." });
        return;
      }

      // Optional weight: columns `weight` and `weightUnit` (g / kg)
      const weightValue = toNumber(row.weight, 0);
      const weightUnit = String(row.weightUnit || "g").trim().toLowerCase() || "g";
      if (Number.isNaN(weightValue) || weightValue < 0) {
        results.push({ row: rowNum, name, status: "error", message: "Weight must be a positive number." });
        return;
      }
      if (weightValue > 0 && !WEIGHT_UNITS.includes(weightUnit)) {
        results.push({
          row: rowNum,
          name,
          status: "error",
          message: `Weight unit must be one of: ${WEIGHT_UNITS.join(", ")}.`,
        });
        return;
      }

      let slug = slugify(name);
      if (existingSlugs.has(slug)) {
        slug = `${slug}-${Date.now().toString().slice(-5)}-${idx}`;
      }
      existingSlugs.add(slug);
      existingSkus.add(sku);

      toInsert.push({
        name,
        slug,
        sku,
        category: category._id,
        price,
        compareAtPrice: toNumber(row.compareAtPrice, 0),
        unit: String(row.unit || "piece").trim() || "piece",
        weight: {
          value: weightValue,
          unit: WEIGHT_UNITS.includes(weightUnit) ? weightUnit : "g",
        },
        stock: toNumber(row.stock, 0),
        lowStockThreshold: toNumber(row.lowStockThreshold, 5),
        description: String(row.description || "").trim(),
        tags: String(row.tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        isFeatured: toBool(row.isFeatured, false),
        isActive: toBool(row.isActive, true),
        media: [], // media is added later through the website
        _rowNum: rowNum,
      });
    });

    let created = 0;
    if (toInsert.length) {
      const docs = toInsert.map(({ _rowNum, ...doc }) => doc);
      const inserted = await Product.insertMany(docs, { ordered: false });
      created = inserted.length;
      toInsert.forEach((item) => {
        results.push({ row: item._rowNum, name: item.name, status: "success" });
      });
    }

    results.sort((a, b) => a.row - b.row);
    const errorCount = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      summary: { totalRows: rows.length, created, errors: errorCount },
      results,
    });
  } catch (err) {
    console.error("Bulk upload error:", err);
    return NextResponse.json({ error: "Failed to process the file." }, { status: 500 });
  }
}