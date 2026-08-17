import { NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { createOrderIfNeeded } from "@/lib/createOrderFromPending";

// Razorpay sends this independently of the customer's browser, so it's what
// actually closes the "customer paid, closed tab, admin never saw the order"
// gap. Configure this URL + a webhook secret in the Razorpay dashboard under
// Settings -> Webhooks, subscribed to at least "payment.captured".
export async function POST(req) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (expected !== signature) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (event.event === "payment.captured" || event.event === "order.paid") {
    const payment = event.payload?.payment?.entity;
    if (payment?.order_id) {
      try {
        await connectDB();
        await createOrderIfNeeded({
          razorpayOrderId: payment.order_id,
          paymentId: payment.id,
        });
      } catch (err) {
        // Return 200 anyway so Razorpay doesn't retry forever on a payment
        // that can never become a valid order (e.g. stock ran out between
        // payment and webhook delivery). Log loudly so this can be
        // investigated and refunded/resolved manually.
        console.error(`Webhook order creation failed for ${payment.order_id}:`, err.message);
      }
    }
  }

  return NextResponse.json({ received: true });
}