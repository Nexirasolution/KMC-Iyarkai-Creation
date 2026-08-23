import { NextResponse } from "next/server";
import { getRazorpay } from "@/lib/razorpay";
import { connectDB } from "@/lib/mongodb";
import PendingOrder from "@/models/PendingOrder";
import Product from "@/models/Product";
import { buildCartSignature } from "@/lib/cartSignature";

// If the same customer resubmits the exact same cart (same phone, same
// items, same amount) within this window, treat it as a resubmit —
// double-click, back button, retry after a slow/failed-looking gateway —
// rather than a genuine second order, and hand back the existing Razorpay
// order instead of minting a new one.
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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

    const amountPaise = Math.round(amount * 100);
    const cartSignature = buildCartSignature({ phone: customer.phone, items, amountPaise });

    // --- Dedup check ---
    // Same phone + same cart contents + same amount + not yet consumed +
    // created recently = almost certainly the same checkout attempt
    // resubmitted, not a genuinely new order. Reuse the existing Razorpay
    // order so we don't end up with two paid Orders for one purchase.
    //
    // Matching on the full cart (not just amount) means two legitimately
    // separate orders that happen to total the same amount are NOT merged
    // — only an exact repeat of the same cart is treated as a resubmit.
    const dupe = await PendingOrder.findOne({
      cartSignature,
      consumed: false,
      createdAt: { $gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
    }).sort({ createdAt: -1 });

    const razorpay = getRazorpay();

    if (dupe) {
      try {
        const existingOrder = await razorpay.orders.fetch(dupe.razorpayOrderId);
        // Only reuse it if Razorpay still considers it open. A "paid" or
        // "attempted" order shouldn't be handed back for another payment
        // attempt — fall through and create a fresh one in that case.
        if (existingOrder.status === "created") {
          return NextResponse.json({ order: existingOrder });
        }
      } catch (err) {
        // Couldn't fetch it (expired/purged on Razorpay's side) — fall
        // through and create a fresh one below.
        console.error(`Could not refetch pending Razorpay order ${dupe.razorpayOrderId}:`, err.message);
      }
    }

    const order = await razorpay.orders.create({
      amount: amountPaise, // paise
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
      cartSignature,
    });

    return NextResponse.json({ order });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Failed to create Razorpay order." }, { status: 500 });
  }
}