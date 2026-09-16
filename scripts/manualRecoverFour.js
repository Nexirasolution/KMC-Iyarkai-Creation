import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import mongoose from "mongoose";

import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { generateOrderNumber } from "../lib/createOrderFromPending.js";

const razorpayOrderIds = [
  { id: "order_TcbaDMRqnQXG4o", paymentId: "pay_TcbaJgXeNWAGUS" },
  { id: "order_Tcg7YZzgvPBNLS", paymentId: "pay_Tcg7kP1pJiNFqc" },
   { id: "order_TcgcdjJj9pZfWD", paymentId: "pay_TcgcmW7GmPvQd7" },
  
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.\n");

  for (const { id, paymentId } of razorpayOrderIds) {
    // Skip if it already exists (idempotent, safe to re-run)
    const existing = await Order.findOne({ "razorpay.orderId": id });
    if (existing) {
      console.log(`SKIP ${id}: already exists as ${existing.orderNumber}`);
      continue;
    }

    const pending = await PendingOrder.findOne({ razorpayOrderId: id });
    if (!pending) {
      console.log(`SKIP ${id}: no PendingOrder found`);
      continue;
    }

    // Decrement stock for each item, checking availability first
    for (const item of pending.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        console.log(`WARNING ${id}: product ${item.productId} not found — skipping stock decrement for this item`);
        continue;
      }
      if (product.stock < item.quantity) {
        console.log(`WARNING ${id}: insufficient stock for ${product.name} (have ${product.stock}, need ${item.quantity}) — order will still be created, please check manually`);
      }
      product.stock = Math.max(0, product.stock - item.quantity);
      await product.save();
    }

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
        orderId: id,
        paymentId,
        signature: "",
      },
      status: "confirmed",
      statusHistory: [{ status: "confirmed", note: "Recovered manually from PendingOrder", at: new Date() }],
    });

    pending.consumed = true;
    pending.consumedAt = new Date();
    await pending.save();

    console.log(`CREATED ${order.orderNumber} for ${order.customer.name} — ₹${order.total}`);
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});