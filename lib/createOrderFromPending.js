import Order from "@/models/Order";
import Product from "@/models/Product";
import PendingOrder from "@/models/PendingOrder";

export async function generateOrderNumber() {
  const prefix = "KMC";
  const date = new Date();
  const datePart = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;
  const count = await Order.countDocuments();
  const seq = (count + 1).toString().padStart(4, "0");
  return `${prefix}-${datePart}-${seq}`;
}

/**
 * Turns a successful Razorpay payment into a real Order.
 * Safe to call more than once for the same razorpayOrderId — if an Order
 * already exists for it, that Order is returned as-is (no-op).
 *
 * Called from:
 *  - /api/razorpay/verify  (fast path, right after payment on the client)
 *  - /api/razorpay/webhook (reliable path, fires from Razorpay's servers
 *                            regardless of what the customer's browser does)
 */
export async function createOrderIfNeeded({ razorpayOrderId, paymentId, signature = "" }) {
  const existing = await Order.findOne({ "razorpay.orderId": razorpayOrderId });
  if (existing) return existing;

  const pending = await PendingOrder.findOne({ razorpayOrderId });
  if (!pending) {
    throw new Error(`No pending order found for Razorpay order ${razorpayOrderId}.`);
  }

  let subtotal = 0;
  const validatedItems = [];

  for (const item of pending.items) {
    const product = await Product.findById(item.productId);
    if (!product || !product.isActive) {
      throw new Error(`Product unavailable: ${item.name || item.productId}`);
    }
    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for ${product.name}.`);
    }

    const firstImage = product.media?.find((m) => m.type === "image");

    subtotal += product.price * item.quantity;
    validatedItems.push({
      product: product._id,
      name: product.name,
      sku: product.sku || "",
      image: firstImage?.url || product.images?.[0]?.url || "",
      price: product.price,
      quantity: item.quantity,
      unit: product.unit,
    });
  }

  const total = subtotal + Number(pending.shippingFee || 0);
  const orderNumber = await generateOrderNumber();

  // Mirrors the original verify route: online payments go straight to
  // "confirmed" (payment already succeeded) rather than "pending".
  const order = await Order.create({
    orderNumber,
    customer: pending.customer,
    items: validatedItems,
    subtotal,
    shippingFee: pending.shippingFee,
    total,
    paymentMethod: "Online",
    paymentStatus: "paid",
    razorpay: {
      orderId: razorpayOrderId,
      paymentId: paymentId || "",
      signature: signature || "",
    },
    status: "confirmed",
    statusHistory: [{ status: "confirmed", note: "Paid via Razorpay" }],
  });

  for (const item of validatedItems) {
    await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
  }

  pending.consumed = true;
  pending.consumedAt = new Date();
  await pending.save();

  return order;
}