// models/Order.js
import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    image: { type: String, default: "" },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, default: "piece" },
  },
  { _id: false }
);

const TrackingSchema = new mongoose.Schema(
  {
    courier: { type: String, default: "" },
    trackingNumber: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const CancellationSchema = new mongoose.Schema(
  {
    reason: { type: String, default: "" },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, default: "admin" },
  },
  { _id: false }
);

const RefundSchema = new mongoose.Schema(
  {
    amount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["none", "pending", "refunded", "failed"],
      default: "none",
    },
    method: { type: String, default: "" },
    note: { type: String, default: "" },
    razorpayRefundId: { type: String, default: "" },
    refundedAt: { type: Date, default: null },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true, index: true },
      email: { type: String, default: "" },
      address: { type: String, required: true },
      city: { type: String, default: "" },
      state: { type: String, default: "Tamil Nadu" },
      pincode: { type: String, default: "" },
    },
    items: { type: [OrderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ["COD", "UPI", "Online"],
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    razorpay: {
      orderId: { type: String, default: "" },
      paymentId: { type: String, default: "" },
      signature: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    statusHistory: {
      type: [
        {
          status: String,
          note: String,
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    tracking: { type: TrackingSchema, default: () => ({}) },
    cancellation: { type: CancellationSchema, default: () => ({}) },
    refund: { type: RefundSchema, default: () => ({}) },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// Database-level safety net: even if some future code path ever
// reintroduces a race around order creation, MongoDB itself will reject a
// second Order.create() carrying the same razorpay.orderId with a
// duplicate-key error instead of silently creating a second order.
// Partial index so this only applies to Online orders — COD/UPI orders
// leave razorpay.orderId as "" and shouldn't collide with each other.
OrderSchema.index(
  { "razorpay.orderId": 1 },
  { unique: true, partialFilterExpression: { "razorpay.orderId": { $ne: "" } } }
);

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);