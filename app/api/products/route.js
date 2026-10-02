import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import "@/models/Category";
import { getCategoryAndDescendantIds } from "@/lib/categoryTree";
import { normalizeWeight } from "@/lib/weight";

const MAX_LIMIT = 100;
const DEFAULT_PAGE_SIZE = 12;

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeMedia(media) {
  if (!Array.isArray(media)) return [];
  return media.map((item) => ({
    url: item.url,
    publicId: item.publicId,
    type: item.type || item.mediaType || "image",
  }));
}

// Escape regex special characters so search terms like "gift+set" or "100%" don't break the query
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// `_id` is appended as a tiebreaker so pagination stays stable when values tie.
const SORT_MAP = {
  newest: { createdAt: -1, _id: -1 },
  "price-asc": { price: 1, _id: 1 },
  "price-desc": { price: -1, _id: 1 },
  "name-asc": { name: 1, _id: 1 },
  "name-desc": { name: -1, _id: 1 },
};

const NAME_SORTS = new Set(["name-asc", "name-desc"]);

// Fields clients should never be able to set directly on create.
const PROTECTED_FIELDS = ["_id", "__v", "createdAt", "updatedAt"];

export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = (searchParams.get("search") || "").trim();
    const featured = searchParams.get("featured");
    const activeOnly = searchParams.get("activeOnly");
    const sort = searchParams.get("sort");
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");

    // Pagination params. `limit=0` (or omitted with no `page`) preserves the old
    // "return everything" behavior for any other callers of this endpoint.
    const parsedPage = parseInt(searchParams.get("page") || "1", 10);
    const page = Number.isFinite(parsedPage) ? Math.max(parsedPage, 1) : 1;
    const hasPageParam = searchParams.has("page");
    const parsedLimit = parseInt(searchParams.get("limit") || "0", 10);
    const rawLimit = Number.isFinite(parsedLimit) ? parsedLimit : 0;
    let limit = hasPageParam ? (rawLimit > 0 ? rawLimit : DEFAULT_PAGE_SIZE) : rawLimit;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const query = {};

    // If a category is selected, include it AND all of its subcategories
    // (a leaf category with no children just resolves to itself).
    if (category) {
      try {
        const categoryIds = await getCategoryAndDescendantIds(category);
        query.category = { $in: categoryIds };
      } catch (err) {
        if (err?.name === "CastError") {
          return NextResponse.json({ error: "Invalid category." }, { status: 400 });
        }
        throw err;
      }
    }

    if (featured === "true") query.isFeatured = true;
    if (activeOnly === "true") query.isActive = true;

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

    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      const min = Number(minPrice);
      const max = Number(maxPrice);
      if (minPrice && Number.isFinite(min)) query.price.$gte = min;
      if (maxPrice && Number.isFinite(max)) query.price.$lte = max;
      if (Object.keys(query.price).length === 0) delete query.price;
    }

    // Products are ordered by SKU across the site by default;
    // an explicit `sort` param overrides that.
    const sortSpec = (sort && SORT_MAP[sort]) || { sku: 1, _id: 1 };

    let cursor = Product.find(query)
      .populate("category", "name slug")
      .sort(sortSpec)
      .lean();

    // Case-insensitive ordering for name sorts
    if (NAME_SORTS.has(sort)) {
      cursor = cursor.collation({ locale: "en", strength: 2 });
    }

    let products;
    let total = null;

    if (limit) {
      cursor = cursor.skip((page - 1) * limit).limit(limit);
      [products, total] = await Promise.all([cursor, Product.countDocuments(query)]);
    } else {
      products = await cursor;
    }

    const body = { products };
    if (limit) {
      body.pagination = {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      };
    }

    return NextResponse.json(body);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch products." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    // TODO: verify an admin session here (or confirm middleware already protects this route).
    await connectDB();
    const body = await req.json();

    if (!body.name || !body.category || body.price === undefined) {
      return NextResponse.json({ error: "Name, category and price are required." }, { status: 400 });
    }
    if (!body.sku || !String(body.sku).trim()) {
      return NextResponse.json({ error: "SKU is required." }, { status: 400 });
    }

    const data = { ...body };
    for (const field of PROTECTED_FIELDS) delete data[field];

    const sku = String(body.sku).trim().toUpperCase();
    const dupSku = await Product.findOne({ sku }).select("_id").lean();
    if (dupSku) {
      return NextResponse.json({ error: `SKU "${sku}" is already in use.` }, { status: 400 });
    }

    let slug = slugify(body.name);
    const existingSlug = await Product.findOne({ slug }).select("_id").lean();
    if (existingSlug) slug = `${slug}-${Date.now().toString().slice(-5)}`;

    try {
      const product = await Product.create({
        ...data,
        sku,
        slug,
        media: normalizeMedia(body.media),
        // Optional: undefined means the model default (no weight) applies
        weight: normalizeWeight(body.weight),
      });
      return NextResponse.json({ product }, { status: 201 });
    } catch (err) {
      if (err.code === 11000) {
        return NextResponse.json({ error: "SKU must be unique." }, { status: 400 });
      }
      if (err.name === "ValidationError") {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create product." }, { status: 500 });
  }
}