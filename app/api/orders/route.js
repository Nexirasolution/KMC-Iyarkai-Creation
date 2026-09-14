import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";
// FIXED: this file used to have its own local copy of generateOrderNumber()
// built on Order.countDocuments(), identical to the buggy version that used
// to live in lib/createOrderFromPending.js. Two separate copies of the same
// non-atomic logic meant fixing one path (Razorpay orders) would NOT have
// fixed this one (COD/manual admin-created orders) — they'd have kept
// colliding independently. Now both routes share the single atomic
// implementation below.
import { generateOrderNumber } from "@/lib/createOrderFromPending";

export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "0", 10);

    const query = {};
    if (status) query.status = status;

    let cursor = Order.find(query).sort({ createdAt: -1 });
    if (limit) cursor = cursor.limit(limit);

    const orders = await cursor;
    return NextResponse.json({ orders });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch orders." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { customer, items, paymentMethod, shippingFee = 0 } = body;

    if (!customer?.name || !customer?.phone || !customer?.address) {
      return NextResponse.json({ error: "Name, phone and address are required." }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }

    // Validate stock and compute totals server-side
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        return NextResponse.json({ error: `Product unavailable: ${item.name || item.productId}` }, { status: 400 });
      }
      if (product.stock < item.quantity) {
        return NextResponse.json({ error: `Insufficient stock for ${product.name}.` }, { status: 400 });
      }

      const firstImage = product.media?.find((m) => m.type === "image");

      subtotal += product.price * item.quantity;
      validatedItems.push({
        product: product._id,
        name: product.name,
        sku: product.sku || "",
        image: firstImage?.url || "",
        price: product.price,
        quantity: item.quantity,
        unit: product.unit,
      });
    }

    const total = subtotal + Number(shippingFee || 0);

    // Retry on the rare chance of an orderNumber clash (same defensive
    // backstop used in createOrderFromPending.js), since this route can
    // run concurrently with Razorpay order creation for the same day.
    let order;
    let attempts = 0;
    while (true) {
      attempts += 1;
      const orderNumber = await generateOrderNumber();
      try {
        order = await Order.create({
          orderNumber,
          customer,
          items: validatedItems,
          subtotal,
          shippingFee,
          total,
          paymentMethod: paymentMethod || "COD",
          status: "pending",
          statusHistory: [{ status: "pending", note: "Order placed" }],
        });
        break;
      } catch (err) {
        const isOrderNumberClash =
          err?.code === 11000 && Object.keys(err?.keyPattern || {}).includes("orderNumber");
        if (isOrderNumberClash && attempts < 5) {
          continue;
        }
        throw err;
      }
    }

    // Decrement stock
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to place order." }, { status: 500 });
  }
}