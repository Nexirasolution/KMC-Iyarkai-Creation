import mongoose from "mongoose";

// Holds the "would-be" order (customer + cart) from the moment a Razorpay
// order is created, keyed by razorpayOrderId. This is what lets both the
// client-side verify route AND the server-side webhook independently turn
// a successful payment into a real Order — whichever fires first wins,
// and it's safe if only the webhook ever fires (e.g. customer closed the
// tab right after paying).
const PendingOrderSchema = new mongoose.Schema(
  {
    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    customer: { type: Object, required: true },
    items: { type: Array, required: true }, // raw cart items: [{ productId, name, price, quantity }]
    shippingFee: { type: Number, default: 0 },
    amount: { type: Number, required: true }, // paise, what was actually charged
    // Deterministic fingerprint of { customer.phone, items, amount } used
    // to detect resubmits of the exact same checkout attempt (double
    // click, back button, retrying after a slow/failed-looking gateway).
    // Indexed so the dedup lookup in create-order stays fast as this
    // collection grows.
    cartSignature: { type: String, default: "", index: true },
    consumed: { type: Boolean, default: false },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.PendingOrder ||
  mongoose.model("PendingOrder", PendingOrderSchema);