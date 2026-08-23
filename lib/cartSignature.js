import crypto from "crypto";

// Builds a deterministic fingerprint of a checkout attempt: who, what's in
// the cart, and how much it comes to. Used to detect resubmits of the exact
// same order (double-click, back button, retry after a slow/failed-looking
// payment gateway) so we don't mint a second Razorpay order — and therefore
// a second real Order — for a single purchase.
//
// Sorting items by productId makes the signature independent of cart
// ordering, so the same cart always hashes the same way regardless of the
// order items were added in.
export function buildCartSignature({ phone, items, amountPaise }) {
  const normalizedItems = (items || [])
    .map((item) => ({
      productId: String(item.productId || ""),
      quantity: Number(item.quantity) || 0,
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

  const payload = JSON.stringify({
    phone: (phone || "").replace(/\D/g, ""),
    items: normalizedItems,
    amountPaise,
  });

  return crypto.createHash("sha256").update(payload).digest("hex");
}