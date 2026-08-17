// app/api/razorpay/verify/route.js
import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { createOrderIfNeeded } from "@/lib/createOrderFromPending";

export async function POST(req) {
  try {
    await connectDB();
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment details." }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
    }

    // customer/items/shippingFee are no longer read from the request body —
    // they were already saved server-side as a PendingOrder when the
    // Razorpay order was created, so nothing sent at this stage can tamper
    // with price or cart contents. This also means this route and the
    // webhook route below both call the exact same idempotent function,
    // so whichever one fires first creates the order and the other no-ops.
    const order = await createOrderIfNeeded({
      razorpayOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Payment verification failed." }, { status: 500 });
  }
}