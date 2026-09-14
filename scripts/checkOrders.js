// scripts/checkOrders.js
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import mongoose from "mongoose";
import Order from "../models/Order.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const orders = await Order.find({
    "razorpay.orderId": {
      $in: [
        "order_TX4X8lHdmQk4dZ",
        "order_TXFzWAgckEyGTD",
        "order_TbvD5oDI9KNlf8",
        "order_TbvhuyfBnreQFD",
      ],
    },
  });
  console.log(`Found ${orders.length} of 4 orders in DB.`);
  console.table(orders.map(o => ({ orderNumber: o.orderNumber, customer: o.customer?.name })));
  await mongoose.disconnect();
}

main();