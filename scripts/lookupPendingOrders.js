require("dotenv").config({ path: ".env.local" });
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

const razorpayOrderIds = [
  "order_TX4X8lHdmQk4dZ", // Roopa Naik
  "order_TXFzWAgckEyGTD", // Bharathi Saravana
  "order_TbvD5oDI9KNlf8", // Subashri
  "order_TbvhuyfBnreQFD", // Kabita asem
];

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.\n");

  const PendingOrder = require("../models/PendingOrder").default || require("../models/PendingOrder");

  for (const id of razorpayOrderIds) {
    const pending = await PendingOrder.findOne({ razorpayOrderId: id });
    if (!pending) {
      console.log(`--- ${id}: NOT FOUND ---\n`);
      continue;
    }
    console.log(`--- ${id} ---`);
    console.log("Customer:", pending.customer);
    console.log("Shipping fee:", pending.shippingFee);
    console.log("Amount (paise):", pending.amount);
    console.log("Items:");
    console.table(pending.items);
    console.log("\n");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});