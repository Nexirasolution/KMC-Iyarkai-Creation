import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import mongoose from "mongoose";
import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const razorpayOrderId = "order_Tbo35SGmKL6O4n";

  const pending = await PendingOrder.findOne({ razorpayOrderId });
  const existing = await Order.findOne({ "razorpay.orderId": razorpayOrderId });

  console.log("PendingOrder found:", !!pending);
  if (pending) console.log(pending);

  console.log("\nOrder already exists:", !!existing);
  if (existing) console.log("Order number:", existing.orderNumber);

  await mongoose.disconnect();
}

main();