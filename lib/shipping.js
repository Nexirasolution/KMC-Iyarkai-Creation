// lib/shipping.js
// Single source of truth for shipping fees. Used by the checkout page (to
// display the fee) AND by /api/razorpay/create-order (to enforce it), so the
// two can never disagree. Pure functions only: safe to import on the client.

// A cart weighing this much or more pays DOUBLE the normal shipping fee.
export const HEAVY_CART_KG = 6;
export const HEAVY_CART_MULTIPLIER = 2;

// { value, unit: "g" | "kg" } -> kilograms. Missing / 0 weight -> 0.
export function weightToKg(weight) {
  const value = Number(weight?.value);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return weight?.unit === "kg" ? value : value / 1000;
}

// lines: [{ weight: { value, unit } | null, quantity }]
export function cartWeightKg(lines) {
  const total = (lines || []).reduce(
    (sum, l) => sum + weightToKg(l.weight) * (Number(l.quantity) || 0),
    0
  );
  return Math.round(total * 1000) / 1000; // avoid float noise (e.g. 5.999999)
}

// Returns { fee, baseFee, weightKg, isHeavy, isFree }
//  - baseFee: the state's rate, or the default fee if the state has no rate
//  - free shipping (subtotal >= freeShipping) still wins and gives fee 0
//  - otherwise heavy carts (>= HEAVY_CART_KG) pay baseFee x 2
export function calculateShippingFee({ subtotal, weightKg, settings, state }) {
  const wanted = String(state || "").trim().toLowerCase();
  const match = (settings?.stateShippingRates || []).find(
    (r) => String(r?.state || "").trim().toLowerCase() === wanted
  );
  const baseFee = match ? Number(match.fee) : Number(settings?.shippingFee ?? 49);
  const freeAbove = Number(settings?.freeShipping ?? 999);
  const isHeavy = weightKg >= HEAVY_CART_KG;

  if (subtotal >= freeAbove) {
    return { fee: 0, baseFee, weightKg, isHeavy, isFree: true };
  }
  return {
    fee: isHeavy ? baseFee * HEAVY_CART_MULTIPLIER : baseFee,
    baseFee,
    weightKg,
    isHeavy,
    isFree: false,
  };
}