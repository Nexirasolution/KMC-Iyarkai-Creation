// scripts/recoverPemaOrder.js
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import mongoose from "mongoose";

import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";
import { generateOrderNumber } from "../lib/createOrderFromPending.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.\n");

  const razorpayOrderId = "order_Tbo35SGmKL6O4n";
  const paymentId = "pay_Tbo3HSAvFOuKDz";

  const existing = await Order.findOne({ "razorpay.orderId": razorpayOrderId });
  if (existing) {
    console.log(`Already exists as ${existing.orderNumber}`);
    await mongoose.disconnect();
    return;
  }

  const pending = await PendingOrder.findOne({ razorpayOrderId });
  if (!pending) {
    console.log("No PendingOrder found.");
    await mongoose.disconnect();
    return;
  }

  // NOTE: pending.consumed is already true, meaning stock may have been
  // decremented already by a partial run of createOrderIfNeeded(). We do
  // NOT decrement stock again here to avoid double-subtracting. Please
  // verify stock levels for these items manually after this runs.
  const subtotal = pending.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const total = subtotal + (pending.shippingFee || 0);

  const orderNumber = await generateOrderNumber();

  const order = await Order.create({
    orderNumber,
    customer: {
      name: pending.customer.name,
      phone: pending.customer.phone,
      email: pending.customer.email || "",
      address: pending.customer.address,
      city: pending.customer.city || "",
      state: pending.customer.state || "Tamil Nadu",
      pincode: pending.customer.pincode || "",
    },
    items: pending.items.map((i) => ({
      product: i.productId,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
    subtotal,
    shippingFee: pending.shippingFee || 0,
    total,
    paymentMethod: "Online",
    paymentStatus: "paid",
    razorpay: {
      orderId: razorpayOrderId,
      paymentId,
      signature: "",
    },
    status: "confirmed",
    statusHistory: [{ status: "confirmed", note: "Recovered manually — verify stock was not double-decremented", at: new Date() }],
    notes: "Recovered from PendingOrder (already marked consumed) — please verify stock levels for these items.",
  });

  console.log(`CREATED ${order.orderNumber} for ${order.customer.name} — ₹${order.total}`);
  console.log("\nItems (verify stock manually for these):");
  console.table(pending.items.map(i => ({ name: i.name, quantity: i.quantity, productId: i.productId })));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});