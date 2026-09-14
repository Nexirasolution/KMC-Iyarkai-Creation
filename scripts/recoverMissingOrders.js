// scripts/recoverMissingOrders.js
import dotenv from "dotenv";

import mongoose from "mongoose";
import Razorpay from "razorpay";

import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";
import { createOrderIfNeeded } from "../lib/createOrderFromPending.js";
dotenv.config({ path: ".env.local" });
const MONGODB_URI = process.env.MONGODB_URI;
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function main() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  const candidates = await PendingOrder.find({ consumed: false }).sort({ createdAt: 1 });
  console.log(`Found ${candidates.length} unconsumed PendingOrder(s) to check.\n`);

  const recovered = [];
  const skippedAlreadyExists = [];
  const skippedNotPaid = [];
  const needsAttention = [];

  for (const pending of candidates) {
    const existing = await Order.findOne({ "razorpay.orderId": pending.razorpayOrderId });
    if (existing) {
      skippedAlreadyExists.push({ razorpayOrderId: pending.razorpayOrderId, orderNumber: existing.orderNumber });
      continue;
    }

    let payments;
    try {
      payments = await razorpay.orders.fetchPayments(pending.razorpayOrderId);
    } catch (err) {
      console.error(`Could not fetch payments for ${pending.razorpayOrderId}: ${err.message}`);
      needsAttention.push({ razorpayOrderId: pending.razorpayOrderId, reason: `Razorpay fetch failed: ${err.message}` });
      continue;
    }

    const captured = (payments?.items || []).find((p) => p.status === "captured");
    if (!captured) {
      skippedNotPaid.push({
        razorpayOrderId: pending.razorpayOrderId,
        customer: pending.customer?.name,
        phone: pending.customer?.phone,
      });
      continue;
    }

    try {
      const order = await createOrderIfNeeded({
        razorpayOrderId: pending.razorpayOrderId,
        paymentId: captured.id,
      });
      recovered.push({
        orderNumber: order.orderNumber,
        customer: order.customer.name,
        phone: order.customer.phone,
        total: order.total,
        razorpayOrderId: pending.razorpayOrderId,
        paymentId: captured.id,
      });
      console.log(`Recovered order ${order.orderNumber} for ${order.customer.name} (₹${order.total}).`);
    } catch (err) {
      needsAttention.push({
        razorpayOrderId: pending.razorpayOrderId,
        customer: pending.customer?.name,
        phone: pending.customer?.phone,
        paymentId: captured.id,
        reason: err.message,
      });
      console.error(`FAILED to recover order for Razorpay order ${pending.razorpayOrderId}: ${err.message}`);
    }
  }

  console.log("\n===== Recovery summary =====");
  console.log(`Recovered:                ${recovered.length}`);
  console.log(`Already existed:          ${skippedAlreadyExists.length}`);
  console.log(`Not actually paid:        ${skippedNotPaid.length}`);
  console.log(`Needs manual attention:   ${needsAttention.length}`);

  if (recovered.length) {
    console.log("\n--- Recovered orders ---");
    console.table(recovered);
  }
  if (needsAttention.length) {
    console.log("\n--- NEEDS YOUR ATTENTION ---");
    console.table(needsAttention);
  }
  if (skippedNotPaid.length) {
    console.log("\n--- Not paid (safe to ignore) ---");
    console.table(skippedNotPaid);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});