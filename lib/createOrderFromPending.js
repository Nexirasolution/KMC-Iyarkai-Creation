import Order from "@/models/Order";
import Product from "@/models/Product";
import PendingOrder from "@/models/PendingOrder";
import Counter from "@/models/Counter";

/**
 * Generates the next order number for today, e.g. "KMC-260914-0038".
 *
 * FIXED: previously used Order.countDocuments() + 1 to derive the sequence
 * number. That is NOT safe under concurrency — two orders created within
 * the same moment could both read the same count before either had been
 * inserted, producing the same order number and causing one of them to
 * fail with a MongoDB E11000 duplicate key error on orderNumber_1. Because
 * that failure happened AFTER payment had already succeeded, the affected
 * order could silently go missing (see createOrderIfNeeded below).
 *
 * Now uses an atomic findOneAndUpdate $inc on a per-day Counter document.
 * MongoDB guarantees this increment is indivisible, so concurrent callers
 * always receive distinct sequence numbers — no more collisions, no more
 * dropped orders from this cause.
 */
export async function generateOrderNumber() {
  const prefix = "KMC";
  const date = new Date();
  const datePart = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: datePart },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seq = counter.seq.toString().padStart(4, "0");
  return `${prefix}-${datePart}-${seq}`;
}

/**
 * Turns a successful Razorpay payment into a real Order.
 *
 * Safe to call more than once, and safe to call CONCURRENTLY, for the same
 * razorpayOrderId. The /api/razorpay/verify route (fired from the customer's
 * browser the instant payment succeeds) and the /api/razorpay/webhook route
 * (fired independently by Razorpay's servers) both call this function, often
 * within milliseconds of each other. Without care, both calls can pass a
 * "does the Order already exist?" check before either has written anything,
 * producing two Orders for one payment.
 *
 * This is prevented with an ATOMIC CLAIM on the PendingOrder: `consumed`
 * is flipped from false -> true via a single findOneAndUpdate, which
 * MongoDB guarantees is indivisible even under concurrent requests. Only
 * one caller can ever win that flip for a given razorpayOrderId; the loser
 * gets null back and polls briefly for the Order the winner is creating,
 * rather than creating a duplicate or erroring out.
 *
 * NOTE: this claim only protects against the SAME payment being processed
 * twice. It does not by itself protect against order NUMBER collisions
 * between two DIFFERENT orders created around the same time — that's what
 * generateOrderNumber()'s atomic counter (above) now handles.
 *
 * Called from:
 *  - /api/razorpay/verify  (fast path, right after payment on the client)
 *  - /api/razorpay/webhook (reliable path, fires from Razorpay's servers
 *                            regardless of what the customer's browser does)
 */
export async function createOrderIfNeeded({ razorpayOrderId, paymentId, signature = "" }) {
  // Cheap early-out: if the Order already exists (e.g. this is a retry
  // after the winner already fully completed), skip the claim dance.
  const existing = await Order.findOne({ "razorpay.orderId": razorpayOrderId });
  if (existing) return existing;

  // Atomic claim. findOneAndUpdate executes as a single operation in
  // MongoDB, so if verify and webhook call this at the exact same instant,
  // only ONE of them will match { consumed: false } and receive the
  // pending doc back — the other immediately gets null, before either has
  // touched the Order collection.
  const pending = await PendingOrder.findOneAndUpdate(
    { razorpayOrderId, consumed: false },
    { $set: { consumed: true, consumedAt: new Date() } },
    { new: false } // return the doc as it was BEFORE the update — we still need items/customer off it
  );

  if (!pending) {
    // We lost the race (someone else is creating the Order right now and
    // may not have committed yet), or there's genuinely no pending order
    // left. Poll briefly for the Order the winner is creating before
    // giving up, so the losing request doesn't surface a spurious error.
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const nowExisting = await Order.findOne({ "razorpay.orderId": razorpayOrderId });
      if (nowExisting) return nowExisting;
    }
    throw new Error(
      `No pending order found for Razorpay order ${razorpayOrderId} (already consumed or missing).`
    );
  }

  let subtotal = 0;
  const validatedItems = [];

  try {
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

    // Retry loop around order creation: generateOrderNumber() is now
    // atomic and collision-free in the normal case, but this loop is kept
    // as a defensive backstop (e.g. if a stray legacy order was ever
    // inserted out-of-band with a clashing number). On a genuine
    // duplicate-key error on orderNumber specifically, just draw a fresh
    // number and retry — this is the fix for the exact bug that dropped
    // orders in production. Any OTHER error (stock, inactive product,
    // etc.) is rethrown immediately, unchanged from before.
    let order;
    let attempts = 0;
    while (true) {
      attempts += 1;
      const orderNumber = await generateOrderNumber();
      try {
        // Mirrors the original verify route: online payments go straight
        // to "confirmed" (payment already succeeded) rather than "pending".
        order = await Order.create({
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
        break;
      } catch (err) {
        const isOrderNumberClash =
          err?.code === 11000 && Object.keys(err?.keyPattern || {}).includes("orderNumber");
        if (isOrderNumberClash && attempts < 5) {
          continue; // draw a new order number and retry
        }
        throw err;
      }
    }

    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
    }

    return order;
  } catch (err) {
    // We claimed this pending order (consumed=true) but failed to actually
    // create the Order — e.g. stock ran out between payment and order
    // creation, or a product was deactivated. Un-claim it so the payment
    // isn't silently stranded: without this, it would stay marked
    // "consumed" with no Order ever created from it, and nothing could
    // retry it again (not the next webhook retry, not a manual re-run).
    await PendingOrder.updateOne(
      { _id: pending._id },
      { $set: { consumed: false, consumedAt: null } }
    );
    throw err;
  }
}