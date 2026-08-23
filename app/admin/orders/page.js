"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";

const STATUSES = ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["pending", "paid", "failed"];

const STATUS_COLORS = {
  pending: "bg-gold/20 text-gold-dark",
  confirmed: "bg-forest/10 text-forest",
  packed: "bg-forest/10 text-forest",
  shipped: "bg-terracotta/10 text-terracotta",
  delivered: "bg-forest text-ivory",
  cancelled: "bg-muted/10 text-muted",
};

const PAYMENT_STATUS_COLORS = {
  pending: "bg-gold/20 text-gold-dark",
  paid: "bg-forest/10 text-forest",
  failed: "bg-terracotta/10 text-terracotta",
};

const EMPTY_TRACKING = { courier: "", trackingNumber: "", trackingUrl: "" };

// Builds a wa.me link from a phone number. Assumes bare 10-digit numbers
// are Indian mobile numbers missing the country code — adjust if your
// stored phone format differs (e.g. already includes +91).
function toWhatsAppLink(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}`;
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4 sm:top-6">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium shadow-lg transition-all ${
          isError ? "bg-terracotta text-ivory" : "bg-forest text-ivory"
        }`}
      >
        <span className="text-base leading-none">{isError ? "⚠" : "✓"}</span>
        {toast.message}
      </div>
    </div>
  );
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [tracking, setTracking] = useState(EMPTY_TRACKING);
  const [toast, setToast] = useState(null);

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [refundNote, setRefundNote] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
  }, []);

  async function loadOrders() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    const res = await fetch(`/api/orders?${params.toString()}`);
    const data = await res.json();
    setOrders(data.orders || []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, [filter]);

  useEffect(() => {
    if (selected) {
      setTracking({
        courier: selected.tracking?.courier || "",
        trackingNumber: selected.tracking?.trackingNumber || "",
        trackingUrl: selected.tracking?.trackingUrl || "",
      });
      setRefundAmount(selected.refund?.amount ? String(selected.refund.amount) : String(selected.total || ""));
      setRefundMethod(selected.refund?.method || "");
      setRefundNote(selected.refund?.note || "");
    } else {
      setTracking(EMPTY_TRACKING);
      setRefundAmount("");
      setRefundMethod("");
      setRefundNote("");
    }
    setShowCancelForm(false);
    setCancelReason("");
    setShowDeleteConfirm(false);
  }, [selected]);

  async function updateStatus(id, status, extra = {}) {
    setUpdating(true);
    const res = await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    const data = await res.json();
    setUpdating(false);
    if (res.ok) {
      setSelected(data.order);
      loadOrders();
      showToast(`Status updated to "${status}"`);
      return true;
    } else {
      showToast(data.error || "Failed to update status", "error");
      return false;
    }
  }

  function handleStatusClick(status) {
    if (!selected || selected.status === status) return;
    if (status === "cancelled") {
      setShowCancelForm(true);
      return;
    }
    updateStatus(selected._id, status);
  }

  async function handlePaymentStatusClick(paymentStatus) {
    if (!selected || selected.paymentStatus === paymentStatus) return;
    setUpdating(true);
    const res = await fetch(`/api/orders/${selected._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus }),
    });
    const data = await res.json();
    setUpdating(false);
    if (res.ok) {
      setSelected(data.order);
      loadOrders();
      showToast(`Payment status updated to "${paymentStatus}"`);
    } else {
      showToast(data.error || "Failed to update payment status", "error");
    }
  }

  async function confirmCancel() {
    if (!cancelReason.trim()) {
      showToast("Please enter a cancellation reason", "error");
      return;
    }
    const ok = await updateStatus(selected._id, "cancelled", {
      cancellation: { reason: cancelReason.trim() },
    });
    if (ok) {
      setShowCancelForm(false);
      setCancelReason("");
    }
  }

  async function saveTracking() {
    if (!selected) return;
    setUpdating(true);
    const res = await fetch(`/api/orders/${selected._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracking }),
    });
    const data = await res.json();
    setUpdating(false);
    if (res.ok) {
      setSelected(data.order);
      loadOrders();
      showToast("Tracking details updated successfully");
    } else {
      showToast(data.error || "Failed to save tracking details", "error");
    }
  }

  async function saveRefund() {
    if (!selected) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a valid refund amount", "error");
      return;
    }
    setUpdating(true);
    const res = await fetch(`/api/orders/${selected._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refund: { amount, method: refundMethod, note: refundNote },
      }),
    });
    const data = await res.json();
    setUpdating(false);
    if (res.ok) {
      setSelected(data.order);
      loadOrders();
      showToast(
        data.order.refund?.method === "Razorpay"
          ? `₹${amount} refunded via Razorpay`
          : `₹${amount} marked as refunded`
      );
    } else {
      showToast(data.error || "Failed to process refund", "error");
    }
  }

  async function deleteOrder() {
    if (!selected) return;
    setDeleting(true);
    const res = await fetch(`/api/orders/${selected._id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (res.ok) {
      showToast(`Order ${selected.orderNumber} deleted`);
      setShowDeleteConfirm(false);
      setSelected(null);
      loadOrders();
    } else {
      showToast(data.error || "Failed to delete order", "error");
    }
  }

  const filtered = orders.filter(
    (o) =>
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customer.phone.includes(search) ||
      o.customer.name.toLowerCase().includes(search.toLowerCase())
  );

  const isOnlinePaid =
    selected?.paymentMethod === "Online" &&
    selected?.paymentStatus === "paid" &&
    !!selected?.razorpay?.paymentId;

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">Orders</h1>
          <p className="mt-1 text-sm text-muted">{orders.length} orders</p>
        </div>
        <input
          type="text"
          placeholder="Search by name, phone, order #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest sm:w-72"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("")}
          className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${filter === "" ? "border-forest bg-forest text-ivory" : "border-gold/30 text-ink/70"}`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize ${filter === s ? "border-forest bg-forest text-ivory" : "border-gold/30 text-ink/70"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="mt-6 hidden overflow-x-auto rounded-xl2 border border-gold/15 bg-white shadow-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gold/15 bg-champagne/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No orders found.</td></tr>
            ) : (
              filtered.map((o) => (
                <tr key={o._id} className="border-b border-gold/10 last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink">{o.orderNumber}</td>
                  <td className="px-4 py-3 text-ink/70">{o.customer.name}</td>
                  <td className="px-4 py-3 text-ink/70">
                    <a
                      href={toWhatsAppLink(o.customer.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-forest hover:underline"
                    >
                      {o.customer.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-ink/70">₹{o.total}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_COLORS[o.status]}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${PAYMENT_STATUS_COLORS[o.paymentStatus] || PAYMENT_STATUS_COLORS.pending}`}>
                      {o.paymentStatus || "pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/admin/orders/${o._id}/label`}
                        className="text-xs font-semibold text-terracotta hover:underline"
                      >
                        Print label
                      </Link>
                      <button onClick={() => setSelected(o)} className="text-xs font-semibold text-forest hover:underline">
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="mt-6 space-y-3 md:hidden">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No orders found.</p>
        ) : (
          filtered.map((o) => (
            <div key={o._id} className="rounded-2xl border border-gold/15 bg-white p-4 shadow-card">
              <div
                onClick={() => setSelected(o)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelected(o);
                }}
                className="block w-full cursor-pointer text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink truncate">{o.orderNumber}</p>
                    <p className="mt-0.5 text-sm text-ink/70 truncate">{o.customer.name}</p>
                    <a
                      href={toWhatsAppLink(o.customer.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-muted hover:text-forest hover:underline"
                    >
                      {o.customer.phone}
                    </a>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_COLORS[o.status]}`}
                    >
                      {o.status}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${PAYMENT_STATUS_COLORS[o.paymentStatus] || PAYMENT_STATUS_COLORS.pending}`}
                    >
                      {o.paymentStatus || "pending"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-gold/10 pt-3 text-sm">
                  <span className="text-muted">
                    {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                  <span className="font-semibold text-forest">₹{o.total}</span>
                </div>
              </div>

              <Link
                href={`/admin/orders/${o._id}/label`}
                className="mt-3 block w-full rounded-full border border-terracotta/40 py-2 text-center text-xs font-semibold text-terracotta"
              >
                Print shipping label
              </Link>
            </div>
          ))
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.orderNumber || ""} wide>
        {selected && (
          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-muted">Customer</p>
                <p className="mt-1 text-sm text-ink">{selected.customer.name}</p>
                <a
                  href={toWhatsAppLink(selected.customer.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink/70 hover:text-forest hover:underline"
                >
                  {selected.customer.phone}
                </a>
                {selected.customer.email && <p className="text-sm text-ink/70 break-all">{selected.customer.email}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted">Delivery Address</p>
                <p className="mt-1 text-sm text-ink/70">
                  {selected.customer.address}, {selected.customer.city} {selected.customer.pincode}, {selected.customer.state}
                </p>
              </div>
            </div>

            <div className="leaf-divider my-5" />

            <p className="text-xs font-semibold uppercase text-muted">Items</p>
            <div className="mt-2 space-y-3">
              {selected.items.map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  {item.image ? (
                    <button
                      type="button"
                      onClick={() => setZoomImage({ src: item.image, alt: item.name })}
                      className="shrink-0 rounded-lg border border-gold/15 focus:outline-none focus:ring-2 focus:ring-forest/50"
                      aria-label={`Zoom image of ${item.name}`}
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gold/15 bg-champagne text-[10px] text-muted">
                      No image
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="break-words leading-snug text-ink/90" title={item.name}>
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {item.sku ? `SKU: ${item.sku}` : "SKU: —"} · Qty {item.quantity}
                    </p>
                  </div>
                  <span className="shrink-0 self-start text-ink">₹{item.price * item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between gap-3 border-t border-gold/15 pt-3 font-display text-sm font-bold text-forest">
              <span>Total ({selected.paymentMethod})</span>
              <span>₹{selected.total}</span>
            </div>

            <div className="leaf-divider my-5" />

            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted">Update Status</p>
              <Link
                href={`/admin/orders/${selected._id}/label`}
                className="rounded-full border border-terracotta/40 px-4 py-1.5 text-xs font-semibold text-terracotta"
              >
                Print shipping label
              </Link>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={updating || selected.status === s}
                  onClick={() => handleStatusClick(s)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold capitalize transition disabled:cursor-default sm:py-1.5 ${
                    selected.status === s ? "border-forest bg-forest text-ivory" : "border-gold/30 text-ink/70 hover:bg-champagne"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {showCancelForm && (
              <div className="mt-3 rounded-xl2 border border-terracotta/30 bg-terracotta/5 p-4">
                <label className="text-xs font-semibold text-terracotta">
                  Reason for cancellation (shown to customer)
                </label>
                <textarea
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Item out of stock, customer requested cancellation..."
                  className="mt-2 w-full rounded-xl2 border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-terracotta"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={confirmCancel}
                    disabled={updating}
                    className="rounded-full bg-terracotta px-5 py-2 text-xs font-semibold text-ivory disabled:opacity-60"
                  >
                    {updating ? "Cancelling..." : "Confirm cancellation"}
                  </button>
                  <button
                    onClick={() => {
                      setShowCancelForm(false);
                      setCancelReason("");
                    }}
                    className="rounded-full border border-gold/30 px-5 py-2 text-xs font-semibold text-ink/70"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {selected.status === "cancelled" && selected.cancellation?.reason && (
              <div className="mt-3 rounded-xl2 border border-terracotta/20 bg-terracotta/5 p-4">
                <p className="text-xs font-semibold uppercase text-terracotta">Cancellation Reason</p>
                <p className="mt-1 text-sm text-ink/80">{selected.cancellation.reason}</p>
                {selected.cancellation.cancelledAt && (
                  <p className="mt-1 text-xs text-muted">
                    Cancelled on{" "}
                    {new Date(selected.cancellation.cancelledAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            )}

            <div className="leaf-divider my-5" />

            <p className="text-xs font-semibold uppercase text-muted">Payment Status</p>
            <p className="mt-1 text-xs text-muted">
              {selected.paymentMethod === "Online"
                ? "Paid orders are set automatically by Razorpay — only change this manually to correct a mistake."
                : "For COD/UPI orders, mark as paid once you've confirmed payment was received."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PAYMENT_STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={updating || selected.paymentStatus === s}
                  onClick={() => handlePaymentStatusClick(s)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold capitalize transition disabled:cursor-default sm:py-1.5 ${
                    selected.paymentStatus === s
                      ? "border-forest bg-forest text-ivory"
                      : "border-gold/30 text-ink/70 hover:bg-champagne"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {selected.status === "cancelled" && (
              <>
                <div className="leaf-divider my-5" />
                <p className="text-xs font-semibold uppercase text-muted">Refund</p>

                {selected.refund?.status === "refunded" ? (
                  <div className="mt-2 rounded-xl2 border border-forest/20 bg-forest/5 p-4">
                    <p className="text-sm font-semibold text-forest">
                      ₹{selected.refund.amount} refunded
                    </p>
                    {selected.refund.method && (
                      <p className="mt-1 text-xs text-ink/70">Method: {selected.refund.method}</p>
                    )}
                    {selected.refund.razorpayRefundId && (
                      <p className="mt-1 text-xs text-ink/70">
                        Razorpay Refund ID: {selected.refund.razorpayRefundId}
                      </p>
                    )}
                    {selected.refund.note && (
                      <p className="mt-1 text-xs text-ink/70">{selected.refund.note}</p>
                    )}
                    {selected.refund.refundedAt && (
                      <p className="mt-1 text-xs text-muted">
                        Refunded on{" "}
                        {new Date(selected.refund.refundedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2">
                    {selected.refund?.status === "failed" && (
                      <div className="mb-3 rounded-xl2 border border-terracotta/30 bg-terracotta/5 p-4">
                        <p className="text-sm font-semibold text-terracotta">Previous refund attempt failed</p>
                        <p className="mt-1 text-xs text-ink/70">{selected.refund.note}</p>
                        <p className="mt-2 text-xs text-muted">Check your Razorpay dashboard, then try again below.</p>
                      </div>
                    )}

                    {isOnlinePaid && (
                      <p className="mb-2 text-xs text-gold-dark">
                        This order was paid online — clicking below will trigger a real refund through Razorpay.
                      </p>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-ink/70">Refund amount (₹)</label>
                        <input
                          type="number"
                          min="0"
                          max={selected.total}
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          className="mt-1 w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
                        />
                      </div>

                      {!isOnlinePaid && (
                        <div>
                          <label className="text-xs font-medium text-ink/70">Refund method (optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. UPI, Bank transfer"
                            value={refundMethod}
                            onChange={(e) => setRefundMethod(e.target.value)}
                            className="mt-1 w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
                          />
                        </div>
                      )}

                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-ink/70">Note (optional)</label>
                        <input
                          type="text"
                          placeholder="Internal note, not shown to customer"
                          value={refundNote}
                          onChange={(e) => setRefundNote(e.target.value)}
                          className="mt-1 w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <button
                          onClick={saveRefund}
                          disabled={updating}
                          className="rounded-full bg-forest px-5 py-2 text-xs font-semibold text-ivory shadow-card disabled:opacity-60"
                        >
                          {updating ? "Processing..." : "Process refund"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="leaf-divider my-5" />

            <p className="text-xs font-semibold uppercase text-muted">Tracking Details</p>
            <p className="mt-1 text-xs text-muted">
              Shown to the customer on the Track Order page once saved.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-ink/70">Courier</label>
                <input
                  type="text"
                  placeholder="e.g. Delhivery, India Post"
                  value={tracking.courier}
                  onChange={(e) => setTracking((t) => ({ ...t, courier: e.target.value }))}
                  className="mt-1 w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink/70">Tracking / AWB number</label>
                <input
                  type="text"
                  placeholder="e.g. 1234567890"
                  value={tracking.trackingNumber}
                  onChange={(e) => setTracking((t) => ({ ...t, trackingNumber: e.target.value }))}
                  className="mt-1 w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-ink/70">Tracking URL (optional)</label>
                <input
                  type="text"
                  placeholder="https://courier-site.com/track/..."
                  value={tracking.trackingUrl}
                  onChange={(e) => setTracking((t) => ({ ...t, trackingUrl: e.target.value }))}
                  className="mt-1 w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={saveTracking}
                disabled={updating}
                className="rounded-full bg-forest px-5 py-2 text-xs font-semibold text-ivory shadow-card disabled:opacity-60"
              >
                {updating ? "Saving..." : "Save tracking"}
              </button>
            </div>

            <div className="leaf-divider my-5" />

            <p className="text-xs font-semibold uppercase text-terracotta">Danger Zone</p>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="mt-2 rounded-full border border-terracotta/40 px-5 py-2 text-xs font-semibold text-terracotta hover:bg-terracotta/5"
              >
                Delete order
              </button>
            ) : (
              <div className="mt-2 rounded-xl2 border border-terracotta/30 bg-terracotta/5 p-4">
                <p className="text-sm font-semibold text-terracotta">
                  Permanently delete {selected.orderNumber}?
                </p>
                <p className="mt-1 text-xs text-ink/70">
                  This can't be undone. The order record, tracking info, and history will all be
                  removed. This does not automatically restock items — do that manually if needed.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={deleteOrder}
                    disabled={deleting}
                    className="rounded-full bg-terracotta px-5 py-2 text-xs font-semibold text-ivory disabled:opacity-60"
                  >
                    {deleting ? "Deleting..." : "Yes, delete permanently"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-full border border-gold/30 px-5 py-2 text-xs font-semibold text-ink/70"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {zoomImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 p-4"
          onClick={() => setZoomImage(null)}
        >
          <button
            onClick={() => setZoomImage(null)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-3xl leading-none text-ivory hover:bg-white/20"
          >
            ×
          </button>
          <img
            src={zoomImage.src}
            alt={zoomImage.alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-xl2 object-contain shadow-2xl"
          />
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-ivory/90">
            {zoomImage.alt}
          </p>
        </div>
      )}
    </div>
  );
}