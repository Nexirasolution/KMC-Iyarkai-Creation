"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { LeafIcon } from "@/components/Icons";

const STATUS_STEPS = ["pending", "confirmed", "packed", "shipped", "delivered"];
const STATUS_LABELS = {
  pending: "Order Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function TrackOrderPage() {
  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        setSettings(data.settings || null);
      } catch (err) {
        console.error("Failed to load settings", err);
      }
    }
    loadSettings();
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    setError("");
    setOrders(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ phone });
      if (orderNumber) params.set("orderNumber", orderNumber);
      const res = await fetch(`/api/orders/track?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No orders found.");
      setOrders(data.orders);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar settings={settings} />
      <section className="mx-auto max-w-3xl px-5 py-12 md:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-dark">
            Order Status
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-forest md:text-4xl">Track Your Order</h1>
          <p className="mt-3 text-sm text-muted">
            Enter the phone number used while placing your order.
          </p>
        </div>

        <form onSubmit={handleSearch} className="mx-auto mt-8 flex max-w-lg flex-col gap-3 sm:flex-row">
          <input
            type="tel"
            required
            placeholder="10-digit phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1 rounded-full border border-gold/30 bg-white px-5 py-3 text-sm outline-none focus:border-forest"
          />
          <input
            type="text"
            placeholder="Order number (optional)"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            className="flex-1 rounded-full border border-gold/30 bg-white px-5 py-3 text-sm outline-none focus:border-forest"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-forest px-8 py-3 text-sm font-semibold text-ivory shadow-soft transition hover:bg-forest-light disabled:opacity-60"
          >
            {loading ? "Searching..." : "Track"}
          </button>
        </form>

        {error && <p className="mt-6 text-center text-sm text-terracotta">{error}</p>}

        {orders && (
          <div className="mt-10 space-y-6">
            {orders.map((order) => (
              <div key={order._id} className="rounded-xl2 border border-gold/15 bg-white p-6 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold text-forest">{order.orderNumber}</p>
                    <p className="text-xs text-muted">
                      Placed on {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className="rounded-full bg-champagne px-4 py-1.5 text-xs font-semibold text-forest">
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>

                {order.status !== "cancelled" ? (
                  <div className="mt-6 flex items-center justify-between">
                    {STATUS_STEPS.map((step, idx) => {
                      const currentIdx = STATUS_STEPS.indexOf(order.status);
                      const done = idx <= currentIdx;
                      return (
                        <div key={step} className="flex flex-1 flex-col items-center">
                          <div className="flex w-full items-center">
                            {idx !== 0 && (
                              <div className={`h-0.5 flex-1 ${idx <= currentIdx ? "bg-forest" : "bg-gold/20"}`} />
                            )}
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                done ? "bg-forest text-ivory" : "bg-champagne text-muted"
                              }`}
                            >
                              {idx + 1}
                            </span>
                            {idx !== STATUS_STEPS.length - 1 && (
                              <div className={`h-0.5 flex-1 ${idx < currentIdx ? "bg-forest" : "bg-gold/20"}`} />
                            )}
                          </div>
                          <span className="mt-2 text-center text-[10px] font-medium text-ink/70">
                            {STATUS_LABELS[step]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl2 border border-terracotta/20 bg-terracotta/5 p-4">
                    <p className="text-sm font-semibold text-terracotta">This order was cancelled.</p>
                    {order.cancellation?.reason && (
                      <p className="mt-1 text-sm text-ink/70">
                        <span className="font-medium text-ink">Reason:</span> {order.cancellation.reason}
                      </p>
                    )}
                    {order.cancellation?.cancelledAt && (
                      <p className="mt-1 text-xs text-muted">
                        Cancelled on{" "}
                        {new Date(order.cancellation.cancelledAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                )}

                {order.refund?.status === "refunded" && (
                  <>
                    <div className="leaf-divider my-5" />
                    <div className="rounded-xl2 border border-forest/20 bg-forest/5 p-4">
                      <p className="text-xs font-semibold uppercase text-forest">Refund</p>
                      <p className="mt-1 text-sm font-semibold text-forest">
                        ₹{order.refund.amount} refund initiated
                      </p>
                      {order.refund.method && (
                        <p className="mt-1 text-sm text-ink/70">
                          <span className="font-medium text-ink">Method:</span> {order.refund.method}
                        </p>
                      )}
                      {order.refund.refundedAt && (
                        <p className="mt-1 text-xs text-muted">
                          Initiated on{" "}
                          {new Date(order.refund.refundedAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      )}
                      {order.refund.method === "Razorpay" && (
                        <p className="mt-2 text-xs text-muted">
                          Refunds to your original payment method usually reflect within 5–7 business days.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {(order.tracking?.courier || order.tracking?.trackingNumber) && (
                  <>
                    <div className="leaf-divider my-5" />
                    <div className="rounded-xl2 border border-gold/20 bg-champagne/50 p-4">
                      <p className="text-xs font-semibold uppercase text-muted">Shipment Tracking</p>
                      <div className="mt-2 space-y-1 text-sm text-ink/80">
                        {order.tracking.courier && (
                          <p>
                            <span className="font-medium text-ink">Courier:</span> {order.tracking.courier}
                          </p>
                        )}
                        {order.tracking.trackingNumber && (
                          <p>
                            <span className="font-medium text-ink">Tracking No:</span> {order.tracking.trackingNumber}
                          </p>
                        )}
                      </div>
                      {order.tracking.trackingUrl && (
                        
                        <a  href={order.tracking.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-block rounded-full bg-forest px-5 py-2 text-xs font-semibold text-ivory shadow-soft transition hover:bg-forest-light"
                        >
                          Track shipment &rarr;
                        </a>
                      )}
                    </div>
                  </>
                )}

                <div className="leaf-divider my-5" />

                <div className="space-y-2">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm text-ink/80">
                      <span>{item.name} × {item.quantity}</span>
                      <span>₹{item.price * item.quantity}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-between font-display text-sm font-bold text-forest">
                  <span>Total</span>
                  <span>₹{order.total}</span>
                </div>
                <p className="mt-3 text-xs text-muted">
                  Delivering to: {order.customer.address}, {order.customer.city} {order.customer.pincode}
                </p>
              </div>
            ))}
          </div>
        )}

        {!orders && !error && (
          <div className="mt-16 flex flex-col items-center text-center text-muted">
            <LeafIcon className="h-10 w-10 text-forest/20" />
            <p className="mt-3 text-sm">Your order history will appear here.</p>
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}