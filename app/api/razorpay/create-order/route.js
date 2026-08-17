import { NextResponse } from "next/server";
import { getRazorpay } from "@/lib/razorpay";
import { connectDB } from "@/lib/mongodb";
import PendingOrder from "@/models/PendingOrder";
import Product from "@/models/Product";

export async function POST(req) {
  try {
    const body = await req.json();
    const { amount, customer, items, shippingFee = 0 } = body; // amount in rupees

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
    }
    if (!customer?.name || !customer?.phone || !customer?.address) {
      return NextResponse.json({ error: "Name, phone and address are required." }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }

    await connectDB();

    // Sanity-check stock up front so we don't open a payment window for an
    // order that can't be fulfilled. The authoritative check happens again
    // in createOrderIfNeeded() once payment is actually confirmed.
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        return NextResponse.json(
          { error: `Product unavailable: ${item.name || item.productId}` },
          { status: 400 }
        );
      }
      if (product.stock < item.quantity) {
        return NextResponse.json({ error: `Insufficient stock for ${product.name}.` }, { status: 400 });
      }
    }

    const razorpay = getRazorpay();

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    // Save what this order WOULD contain, keyed by the Razorpay order id.
    // This is what lets the order still be created later purely from the
    // Razorpay webhook, even if the customer's browser never comes back
    // (closed tab, killed app, lost signal, etc. right after paying).
    await PendingOrder.create({
      razorpayOrderId: order.id,
      customer,
      items,
      shippingFee,
      amount: order.amount,
    });

    return NextResponse.json({ order });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Failed to create Razorpay order." }, { status: 500 });
  }
}