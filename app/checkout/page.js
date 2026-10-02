"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { INDIAN_STATES } from "@/lib/indianStates";
import { calculateShippingFee, cartWeightKg, HEAVY_CART_KG } from "@/lib/shipping";

// Turns a stored phone number into a dialable / WhatsApp-ready number.
// Bare 10-digit numbers are assumed to be Indian and get the +91 country code.
function toDigits(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

export default function CheckoutPage() {
  const { items, subtotal, clearCart, hydrated } = useCart();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "Tamil Nadu",
    pincode: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [placedOrder, setPlacedOrder] = useState(null);
  const [settings, setSettings] = useState({
    shippingFee: 49,
    freeShipping: 999,
    stateShippingRates: [],
    storeName: "KMC Iyarkai Creation",
  });

  // Product weights, keyed by productId. Cart items don't carry weight, so we
  // look it up once per product. weightsReady stays false until the lookup
  // finishes so the shipping fee never flashes a too-low value.
  const [weights, setWeights] = useState({});
  const [weightsReady, setWeightsReady] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) setSettings(data.settings);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const missing = items.filter((i) => !(i.productId in weights)).map((i) => i.productId);
    if (missing.length === 0) {
      setWeightsReady(true);
      return;
    }
    setWeightsReady(false);
    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        fetch(`/api/products/${id}`)
          .then((r) => r.json())
          .then((d) => [id, d.product?.weight || null])
          .catch(() => [id, null])
      )
    ).then((entries) => {
      if (cancelled) return;
      setWeights((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      setWeightsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [items, hydrated, weights]);

  // Only offer the states that have a shipping rate set in Settings.
  // If no state rates are configured at all (or none match the state list),
  // fall back to every state so checkout never ends up with an empty dropdown.
  const restrictedToConfigured = useMemo(() => {
    const configured = new Set(
      (settings.stateShippingRates || [])
        .map((r) => r.state?.trim().toLowerCase())
        .filter(Boolean)
    );
    return configured.size > 0 && INDIAN_STATES.some((s) => configured.has(s.toLowerCase()));
  }, [settings.stateShippingRates]);

  const availableStates = useMemo(() => {
    if (!restrictedToConfigured) return INDIAN_STATES;
    const configured = new Set(
      (settings.stateShippingRates || []).map((r) => r.state?.trim().toLowerCase())
    );
    // Keep the standard state names / order from INDIAN_STATES
    return INDIAN_STATES.filter((s) => configured.has(s.toLowerCase()));
  }, [settings.stateShippingRates, restrictedToConfigured]);

  // If the selected state isn't deliverable (e.g. the default "Tamil Nadu" has
  // no rate), switch to the first available one.
  useEffect(() => {
    if (availableStates.length > 0 && !availableStates.includes(form.state)) {
      setForm((f) => ({ ...f, state: availableStates[0] }));
    }
  }, [availableStates, form.state]);

  // Total cart weight in kg (products without a weight count as 0).
  const weightKg = useMemo(
    () =>
      cartWeightKg(
        items.map((i) => ({ weight: weights[i.productId], quantity: i.quantity }))
      ),
    [items, weights]
  );

  // State rate (or default fee), free-shipping threshold, and the 6 kg
  // double-charge rule all live in lib/shipping.js (shared with the server).
  const shipping = useMemo(
    () => calculateShippingFee({ subtotal, weightKg, settings, state: form.state }),
    [subtotal, weightKg, settings, form.state]
  );

  const shippingFee = shipping.fee;
  const total = subtotal + shippingFee;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validate() {
    if (items.length === 0) {
      setError("Your cart is empty.");
      return false;
    }
    if (!availableStates.includes(form.state)) {
      setError("Sorry, we don't deliver to the selected state. Please choose another state.");
      return false;
    }
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, "").slice(-10))) {
      setError("Enter a valid 10-digit phone number.");
      return false;
    }
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!validate()) return;

    if (!window.Razorpay) {
      setError("Payment gateway not loaded yet. Please try again.");
      return;
    }

    setLoading(true);
    try {
      // Send customer + cart + shippingFee up front so the server can save
      // a PendingOrder against the Razorpay order id. That's what lets the
      // order still get created via the webhook even if this tab closes
      // before the payment success handler below ever runs.
      // (The server recomputes the shipping fee itself and rejects the
      // request if this amount doesn't match.)
      const orderRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: total, customer: form, items, shippingFee }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || "Failed to start payment.");

      const rzpOrder = orderData.order;

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        name: settings.storeName || "KMC Iyarkai Creation",
        description: "Order Payment",
        order_id: rzpOrder.id,
        prefill: {
          name: form.name,
          contact: form.phone,
          email: form.email,
        },
        theme: { color: "#1f3d2b" }, // forest color
        handler: async function (response) {
          // Fast path: if the browser is still here, verify + create the
          // order immediately for a snappy confirmation screen. If this
          // never fires (tab closed, app killed, etc.), the Razorpay
          // webhook creates the exact same order server-side instead.
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.error || "Payment verification failed.");

            setPlacedOrder(verifyData.order);
            clearCart();
          } catch (err) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      });

      rzp.on("payment.failed", function (response) {
        setError("Payment failed. Please try again.");
        setLoading(false);
      });

      rzp.open();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (!hydrated) return null;

  if (placedOrder) {
    return (
      <>
        <Navbar settings={settings} />
        <section className="mx-auto max-w-xl px-5 py-20 text-center md:px-8">
          <span className="badge-stamp mx-auto flex h-16 w-16 items-center justify-center border-gold/40 bg-forest text-ivory">
            ✓
          </span>
          <h1 className="mt-6 font-display text-3xl font-bold text-forest">Order Placed!</h1>
          <p className="mt-3 text-muted">
            Thank you for choosing {settings.storeName || "KMC Iyarkai Creation"}. Your order number is:
          </p>
          <p className="mt-2 font-display text-xl font-bold text-terracotta">{placedOrder.orderNumber}</p>
          <p className="mt-4 text-sm text-muted">
            Save this number, or use your phone number, to track your order anytime.
          </p>

          {(settings.deliveryTime || settings.phone || settings.whatsapp) && (
            <div className="mt-6 rounded-xl2 border border-gold/20 bg-champagne/50 p-5 text-sm text-ink/80">
              {settings.deliveryTime && (
                <p>
                  Your order will be delivered within{" "}
                  <span className="font-semibold text-forest">{settings.deliveryTime}</span>.
                </p>
              )}
              {(settings.phone || settings.whatsapp) && (
                <p className={settings.deliveryTime ? "mt-2" : ""}>
                  For any immediate enquiry, contact us
                  {settings.phone && (
                    <>
                      {" "}at{" "}
                      <a
                        href={`tel:+${toDigits(settings.phone)}`}
                        className="font-semibold text-forest hover:underline"
                      >
                        {settings.phone}
                      </a>
                    </>
                  )}
                  {settings.phone && settings.whatsapp && " or"}
                  {settings.whatsapp && (
                    <>
                      {" "}on{" "}
                      <a
                        href={`https://wa.me/${toDigits(settings.whatsapp)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-forest hover:underline"
                      >
                        WhatsApp
                      </a>
                    </>
                  )}
                  .
                </p>
              )}
            </div>
          )}
          <div className="mt-8 flex justify-center gap-4">
            <a
              href="/track-order"
              className="rounded-full border border-forest/30 px-8 py-3 text-sm font-semibold text-forest hover:bg-champagne"
            >
              Track Order
            </a>

            <a
              href="/products"
              className="rounded-full bg-forest px-8 py-3 text-sm font-semibold text-ivory shadow-soft hover:bg-forest-light"
            >
              Continue Shopping
            </a>
          </div>
        </section>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <Navbar settings={settings} />
      <section className="mx-auto max-w-4xl px-5 py-12 md:px-8">
        <h1 className="font-display text-3xl font-bold text-forest">Checkout</h1>

        {items.length === 0 ? (
          <p className="mt-8 text-muted">Your cart is empty. <a href="/products" className="text-forest underline">Shop now</a></p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 grid gap-10 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full Name" required value={form.name} onChange={(v) => update("name", v)} />
                <Field label="Phone Number" required value={form.phone} onChange={(v) => update("phone", v)} type="tel" />
              </div>
              <Field label="Email (optional)" value={form.email} onChange={(v) => update("email", v)} type="email" />
              <Field label="Delivery Address" required value={form.address} onChange={(v) => update("address", v)} textarea />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="City" value={form.city} onChange={(v) => update("city", v)} />
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink/70">
                    State <span className="text-terracotta">*</span>
                  </span>
                  <select
                    required
                    value={form.state}
                    onChange={(e) => update("state", e.target.value)}
                    className="w-full rounded-xl border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
                  >
                    {availableStates.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <Field label="Pincode" value={form.pincode} onChange={(v) => update("pincode", v)} />
              </div>

              {restrictedToConfigured && (
                <p className="text-xs text-muted">
                  We currently deliver to: {availableStates.join(", ")}.
                </p>
              )}

              <div>
                <p className="mb-2 text-sm font-semibold text-ink">Payment Method</p>
                <p className="text-xs text-muted">
                  You'll be redirected to Razorpay's secure checkout to complete payment.
                </p>
              </div>

              {error && <p className="text-sm text-terracotta">{error}</p>}
            </div>

            <div className="h-fit rounded-xl2 border border-gold/15 bg-white p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-forest">Order Summary</h2>
              <div className="mt-4 space-y-2">
                {items.map((item) => (
                  <div key={item.productId} className="flex justify-between text-sm text-ink/80">
                    <span>{item.name} × {item.quantity}</span>
                    <span>₹{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="leaf-divider my-4" />
              <div className="flex justify-between text-sm text-ink/80">
                <span>Subtotal</span>
                <span>₹{subtotal}</span>
              </div>
              <div className="flex justify-between text-sm text-ink/80">
                <span>Shipping ({form.state})</span>
                <span>
                  {!weightsReady ? "..." : shippingFee === 0 ? "Free" : `₹${shippingFee}`}
                </span>
              </div>
              {weightsReady && shipping.isHeavy && !shipping.isFree && (
                <p className="mt-1 text-xs text-gold-dark">
                  Heavy order ({weightKg} kg): orders of {HEAVY_CART_KG} kg or more have double
                  shipping (₹{shipping.baseFee} × 2).
                </p>
              )}
              <div className="mt-2 flex justify-between font-display text-base font-bold text-forest">
                <span>Total</span>
                <span>₹{total}</span>
              </div>
              <button
                type="submit"
                disabled={loading || !weightsReady}
                className="mt-6 w-full rounded-full bg-forest px-8 py-3.5 text-sm font-semibold text-ivory shadow-soft transition hover:bg-forest-light disabled:opacity-60"
              >
                {loading ? "Processing..." : "Pay & Place Order"}
              </button>
            </div>
          </form>
        )}
      </section>
      <Footer />
    </>
  );
}

function Field({ label, value, onChange, required, type = "text", textarea }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink/70">
        {label} {required && <span className="text-terracotta">*</span>}
      </span>
      {textarea ? (
        <textarea
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      ) : (
        <input
          required={required}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
      )}
    </label>
  );
}