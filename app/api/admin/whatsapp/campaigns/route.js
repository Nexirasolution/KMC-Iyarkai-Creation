import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import Campaign from "@/models/Campaign";
import { getAudience } from "@/lib/audience";

// GET: recent campaigns with progress counts
export async function GET() {
  try {
    await connectDB();
    const list = await Campaign.find({}).sort({ createdAt: -1 }).limit(20).lean();
    const campaigns = list.map((c) => ({
      _id: c._id,
      createdAt: c.createdAt,
      productName: c.productSnapshot?.name,
      total: c.recipients.length,
      sent: c.recipients.filter((r) => r.status === "sent").length,
      skipped: c.recipients.filter((r) => r.status === "skipped").length,
    }));
    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error("Campaign list error:", err);
    return NextResponse.json({ error: "Failed to load campaigns." }, { status: 500 });
  }
}

// POST: { productId, messageTemplate, link, consent }
// Takes a snapshot of the audience so the list stays the same while you work through it.
export async function POST(req) {
  try {
    await connectDB();
    const { productId, messageTemplate, link, consent } = await req.json();

    if (!mongoose.isValidObjectId(productId)) {
      return NextResponse.json({ error: "Choose a product." }, { status: 400 });
    }
    if (!String(messageTemplate || "").trim() || !String(link || "").trim()) {
      return NextResponse.json({ error: "Message and product link are required." }, { status: 400 });
    }

    const product = await Product.findById(productId).lean();
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    const audience = await getAudience({ consent: consent === "optedIn" ? "optedIn" : "all" });
    if (!audience.length) {
      return NextResponse.json({ error: "No customers to message." }, { status: 400 });
    }

    const campaign = await Campaign.create({
      product: product._id,
      productSnapshot: { name: product.name, slug: product.slug, price: product.price },
      link: String(link).trim(),
      messageTemplate: String(messageTemplate),
      recipients: audience.map((a) => ({ phone: a.phone, name: a.name })),
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    console.error("Campaign create error:", err);
    return NextResponse.json({ error: "Failed to create campaign." }, { status: 500 });
  }
}