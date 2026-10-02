"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import { toGrams, formatWeight, orderTotalGrams, itemsMissingWeight } from "@/lib/weight";

// Return steps are normal order statuses, so they show to the customer on the
// Track Order page exactly like packed / shipped.
const STATUSES = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
];
const PAYMENT_STATUSES = ["pending", "paid", "failed"];

const STORE_NAME = "KMC Iyarkai Creation";

const STATUS_LABELS = {
  returned: "Returned",
};

function statusLabel(s) {
  return STATUS_LABELS[s] || s;
}

const STATUS_COLORS = {
  pending: "bg-gold/20 text-gold-dark",
  confirmed: "bg-forest/10 text-forest",
  packed: "bg-forest/10 text-forest",
  shipped: "bg-terracotta/10 text-terracotta",
  delivered: "bg-forest text-ivory",
  returned: "bg-gold/20 text-gold-dark",
  cancelled: "bg-muted/10 text-muted",
};

const PAYMENT_STATUS_COLORS = {
  pending: "bg-gold/20 text-gold-dark",
  paid: "bg-forest/10 text-forest",
  failed: "bg-terracotta/10 text-terracotta",
};

// Courier partners and their tracking URL templates are configured in
// Settings. The admin picks a courier and enters the tracking ID per order.
const EMPTY_TRACKING = { courier: "", trackingNumber: "" };

// Builds a wa.me link from a phone number, optionally with a pre-filled message.
// Assumes bare 10-digit numbers are Indian mobile numbers missing the country
// code — adjust if your stored phone format differs (e.g. already includes +91).
function toWhatsAppLink(phone, text) {
  const digits = (phone || "").replace(/\D/g, "");
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// Order date / time helpers. Times are shown in Indian Standard Time so the
// admin always sees the same time regardless of their device's timezone.
const IST = "Asia/Kolkata";

function formatOrderDate(value, withYear = false) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: IST,
  });
}

function formatOrderTime(value) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: IST,
  });
}

// Builds the message shown to the admin before sending. Edit the wording here.
function buildWhatsAppMessage(order) {
  if (!order) return "";
  const name = order.customer?.name || "there";
  const ref = `${order.orderNumber} (₹${order.total})`;
  const lines = [];

  switch (order.status) {
    case "confirmed":
      lines.push(`Hi ${name}, your order ${ref} has been confirmed. We'll start packing it soon.`);
      break;
    case "packed":
      lines.push(`Hi ${name}, your order ${ref} has been packed and is ready to be shipped.`);
      break;
    case "shipped": {
      lines.push(`Hi ${name}, your order ${ref} has been shipped!`);
      const t = order.tracking || {};
      if (t.courier) lines.push(`Courier: ${t.courier}`);
      if (t.trackingNumber) lines.push(`Tracking number: ${t.trackingNumber}`);
      if (t.trackingUrl) lines.push(`Track here: ${t.trackingUrl}`);
      break;
    }
    case "delivered":
      lines.push(`Hi ${name}, your order ${ref} has been delivered. We hope you love it! Thank you for shopping with us.`);
      break;
    case "returned":
      lines.push(`Hi ${name}, your order ${ref} has been marked as returned.`);
      if (order.returnInfo?.reason) lines.push(`Reason: ${order.returnInfo.reason}`);
      if (!order.returnInfo?.refundRequired) {
        lines.push("No refund is applicable for this return.");
      } else if (order.refund?.status === "refunded") {
        lines.push(
          `A refund of ₹${order.refund.amount} has been processed${
            order.refund.method ? ` via ${order.refund.method}` : ""
          }. It may take a few working days to reflect in your account.`
        );
      } else {
        lines.push("Your refund will be processed shortly.");
      }
      break;
    case "cancelled": {
      lines.push(`Hi ${name}, your order ${ref} has been cancelled.`);
      if (order.cancellation?.reason) lines.push(`Reason: ${order.cancellation.reason}`);
      if (order.refund?.status === "refunded") {
        lines.push(
          `A refund of ₹${order.refund.amount} has been processed${
            order.refund.method ? ` via ${order.refund.method}` : ""
          }. It may take a few working days to reflect in your account.`
        );
      }
      break;
    }
    default:
      lines.push(`Hi ${name}, thank you for your order ${ref}! We have received it and will confirm it shortly.`);
  }

  lines.push("", `- ${STORE_NAME}`);
  return lines.join("\n");
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

  // Store-wide courier partners, configured in Settings.
  const [storeSettings, setStoreSettings] = useState(null);

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnRefund, setReturnRefund] = useState(null); // true | false | null (not chosen yet)

  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [refundNote, setRefundNote] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // WhatsApp message for the order open in the modal (editable before sending)
  const [waMessage, setWaMessage] = useState("");
  // Set after a status change so the WhatsApp section prompts the admin to notify the customer
  const [notifyFor, setNotifyFor] = useState(null); // { id, status } | null

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

  // Load the store's courier partners once.
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setStoreSettings(d.settings || null))
      .catch(() => {});
  }, []);

  // Courier list for the dropdown. Falls back to the legacy single courier
  // if no couriers have been added in Settings yet.
  const courierOptions =
    storeSettings?.couriers?.length > 0
      ? storeSettings.couriers
      : storeSettings?.courier
      ? [{ name: storeSettings.courier, trackingUrlTemplate: storeSettings.trackingUrlTemplate || "" }]
      : [];

  useEffect(() => {
    if (selected) {
      setTracking({
        // Pre-select the saved courier; auto-pick if only one exists.
        courier:
          selected.tracking?.courier ||
          (courierOptions.length === 1 ? courierOptions[0].name : ""),
        trackingNumber: selected.tracking?.trackingNumber || "",
      });
      setRefundAmount(selected.refund?.amount ? String(selected.refund.amount) : String(selected.total || ""));
      setRefundMethod(selected.refund?.method || "");
      setRefundNote(selected.refund?.note || "");
      // Regenerated whenever the order changes (status, tracking, refund...)
      setWaMessage(buildWhatsAppMessage(selected));
    } else {
      setTracking(EMPTY_TRACKING);
      setRefundAmount("");
      setRefundMethod("");
      setRefundNote("");
      setWaMessage("");
    }
    setShowCancelForm(false);
    setCancelReason("");
    setShowReturnForm(false);
    setReturnReason("");
    setReturnRefund(null);
    setShowDeleteConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, storeSettings]);

  // Opens the modal immediately with the list data, then loads the full order
  // (which includes each item's product weight) and swaps it in.
  async function openOrder(o) {
    setSelected(o);
    try {
      const res = await fetch(`/api/orders/${o._id}`);
      const data = await res.json();
      if (res.ok) setSelected(data.order);
    } catch {
      // keep showing the list data if the detail fetch fails
    }
  }

  function closeModal() {
    setSelected(null);
    setNotifyFor(null);
  }

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
      setNotifyFor({ id, status });
      loadOrders();
      showToast(`Status updated to "${statusLabel(status)}"`);
      return true;
    } else {
      showToast(data.error || "Failed to update status", "error");
      return false;
    }
  }

  function handleStatusClick(status) {
    if (!selected || selected.status === status) return;
    if (status === "cancelled") {
      setShowReturnForm(false);
      setShowCancelForm(true);
      return;
    }
    if (status === "returned") {
      setShowCancelForm(false);
      setShowReturnForm(true);
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

  async function confirmReturn() {
    if (!returnReason.trim()) {
      showToast("Please enter a return reason", "error");
      return;
    }
    if (returnRefund === null) {
      showToast("Choose whether a refund is needed", "error");
      return;
    }
    const ok = await updateStatus(selected._id, "returned", {
      returnInfo: { reason: returnReason.trim(), refundRequired: returnRefund },
    });
    if (ok) {
      setShowReturnForm(false);
      setReturnReason("");
      setReturnRefund(null);
    }
  }

  async function saveTracking() {
    if (!selected) return;
    if (!tracking.courier) {
      showToast("Choose a courier partner", "error");
      return;
    }
    if (!tracking.trackingNumber.trim()) {
      showToast("Enter the tracking ID", "error");
      return;
    }
    setUpdating(true);
    const res = await fetch(`/api/orders/${selected._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // The server builds the tracking link from the chosen courier's URL in Settings.
      body: JSON.stringify({
        tracking: {
          courier: tracking.courier,
          trackingNumber: tracking.trackingNumber.trim(),
        },
      }),
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
      closeModal();
      loadOrders();
    } else {
      showToast(data.error || "Failed to delete order", "error");
    }
  }

  // Search by order #, customer phone, customer name, or tracking ID.
  const filtered = orders.filter((o) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (o.orderNumber || "").toLowerCase().includes(q) ||
      (o.customer?.phone || "").includes(q) ||
      (o.customer?.name || "").toLowerCase().includes(q) ||
      (o.tracking?.trackingNumber || "").toLowerCase().includes(q)
    );
  });

  const isOnlinePaid =
    selected?.paymentMethod === "Online" &&
    selected?.paymentStatus === "paid" &&
    !!selected?.razorpay?.paymentId;

  const notifyActive = !!selected && notifyFor?.id === selected._id;

  // Total parcel weight for the order open in the modal
  const totalWeightGrams = orderTotalGrams(selected?.items);
  const missingWeightCount = itemsMissingWeight(selected?.items);

  const showRefundSection =
    selected?.status === "cancelled" ||
    (selected?.status === "returned" && !!selected?.returnInfo?.refundRequired);

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
          placeholder="Search by name, phone, order #, tracking ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest sm:w-80"
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
            {statusLabel(s)}
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
                    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_COLORS[o.status]}`}>
                      {statusLabel(o.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${PAYMENT_STATUS_COLORS[o.paymentStatus] || PAYMENT_STATUS_COLORS.pending}`}>
                      {o.paymentStatus || "pending"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    <p>{formatOrderDate(o.createdAt)}</p>
                    <p className="text-xs text-muted">{formatOrderTime(o.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <a
                        href={toWhatsAppLink(o.customer.phone, buildWhatsAppMessage(o))}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Send "${statusLabel(o.status)}" update on WhatsApp`}
                        className="text-xs font-semibold text-forest hover:underline"
                      >
                        WhatsApp
                      </a>
                      <Link
                        href={`/admin/orders/${o._id}/label`}
                        className="text-xs font-semibold text-terracotta hover:underline"
                      >
                        Print label
                      </Link>
                      <Link
                        href={`/admin/orders/${o._id}/label-sheet`}
                        className="text-xs font-semibold text-forest hover:underline"
                      >
                        Full-sheet label
                      </Link>
                      <button onClick={() => openOrder(o)} className="text-xs font-semibold text-forest hover:underline">
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
                onClick={() => openOrder(o)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openOrder(o);
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
                      {statusLabel(o.status)}
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
                    {formatOrderDate(o.createdAt)}, {formatOrderTime(o.createdAt)}
                  </span>
                  <span className="font-semibold text-forest">₹{o.total}</span>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <a
                  href={toWhatsAppLink(o.customer.phone, buildWhatsAppMessage(o))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-full bg-forest py-2 text-center text-xs font-semibold text-ivory"
                >
                  WhatsApp update
                </a>
                <Link
                  href={`/admin/orders/${o._id}/label`}
                  className="flex-1 rounded-full border border-terracotta/40 py-2 text-center text-xs font-semibold text-terracotta"
                >
                  Print shipping label
                </Link>
                <Link
                  href={`/admin/orders/${o._id}/label-sheet`}
                  className="flex-1 rounded-full border border-forest/40 py-2 text-center text-xs font-semibold text-forest"
                >
                  Full-sheet label
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal open={!!selected} onClose={closeModal} title={selected?.orderNumber || ""} wide>
        {selected && (
          <div>
            <p className="mb-4 text-sm text-ink/70">
              Placed on{" "}
              <span className="font-medium text-ink">
                {formatOrderDate(selected.createdAt, true)} at {formatOrderTime(selected.createdAt)}
              </span>
            </p>

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
                    <p className="mt-0.5 text-xs text-muted">
                      {toGrams(item.weight)
                        ? `Weight: ${formatWeight(toGrams(item.weight))} each · ${formatWeight(
                            toGrams(item.weight) * item.quantity
                          )} total`
                        : "Weight: not set"}
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

            <div className="mt-2 flex justify-between gap-3 text-sm text-ink/80">
              <span className="font-medium">Total weight</span>
              <span className="font-semibold text-ink">{formatWeight(totalWeightGrams)}</span>
            </div>
            {missingWeightCount > 0 && (
              <p className="mt-1 text-xs text-gold-dark">
                {missingWeightCount} item{missingWeightCount > 1 ? "s have" : " has"} no weight set, so
                the total may be lower than the actual parcel weight.
              </p>
            )}

            <div className="leaf-divider my-5" />

            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted">Update Status</p>
              <div className="flex gap-3">
                <Link
                  href={`/admin/orders/${selected._id}/label`}
                  className="rounded-full border border-terracotta/40 px-4 py-1.5 text-xs font-semibold text-terracotta"
                >
                  Print shipping label
                </Link>
                <Link
                  href={`/admin/orders/${selected._id}/label-sheet`}
                  className="rounded-full border border-forest/40 px-4 py-1.5 text-xs font-semibold text-forest"
                >
                  Full-sheet label
                </Link>
              </div>
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
                  {statusLabel(s)}
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

            {showReturnForm && (
              <div className="mt-3 rounded-xl2 border border-terracotta/30 bg-terracotta/5 p-4">
                <label className="text-xs font-semibold text-terracotta">
                  Return reason / message (shown to customer)
                </label>
                <textarea
                  rows={2}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g. Damaged item, wrong product, size issue..."
                  className="mt-2 w-full rounded-xl2 border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-terracotta"
                />
                <p className="mt-3 text-xs font-semibold text-terracotta">Is a refund needed?</p>
                <div className="mt-2 flex gap-2">
                  {[
                    { label: "Yes, refund needed", value: true },
                    { label: "No refund", value: false },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setReturnRefund(opt.value)}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                        returnRefund === opt.value
                          ? "border-forest bg-forest text-ivory"
                          : "border-gold/30 bg-white text-ink/70 hover:bg-champagne"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {returnRefund === true
                    ? "The refund form will open next so you can process the refund."
                    : returnRefund === false
                    ? "The customer will see the return message with no refund on the Track Order page."
                    : ""}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={confirmReturn}
                    disabled={updating}
                    className="rounded-full bg-terracotta px-5 py-2 text-xs font-semibold text-ivory disabled:opacity-60"
                  >
                    {updating ? "Saving..." : "Confirm return"}
                  </button>
                  <button
                    onClick={() => {
                      setShowReturnForm(false);
                      setReturnReason("");
                      setReturnRefund(null);
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

            {selected.status === "returned" && selected.returnInfo?.reason && (
              <div className="mt-3 rounded-xl2 border border-terracotta/20 bg-terracotta/5 p-4">
                <p className="text-xs font-semibold uppercase text-terracotta">Return Reason</p>
                <p className="mt-1 text-sm text-ink/80">{selected.returnInfo.reason}</p>
                {selected.returnInfo.returnedAt && (
                  <p className="mt-1 text-xs text-muted">
                    Returned on {formatOrderDate(selected.returnInfo.returnedAt, true)}
                  </p>
                )}
                <p className="mt-1 text-xs font-medium text-ink/70">
                  {selected.returnInfo.refundRequired ? "Refund: needed" : "Refund: not needed"}
                </p>
              </div>
            )}

            {/* WhatsApp update to the customer (manual send) */}
            <div
              className={`mt-4 rounded-xl2 border p-4 ${
                notifyActive ? "border-forest/40 bg-forest/5" : "border-gold/20 bg-champagne/30"
              }`}
            >
              <p className="text-xs font-semibold uppercase text-muted">WhatsApp update to customer</p>
              <p className={`mt-1 text-xs ${notifyActive ? "font-medium text-forest" : "text-muted"}`}>
                {notifyActive
                  ? `Status changed to "${statusLabel(selected.status)}" — let ${selected.customer.name} know.`
                  : "Opens WhatsApp with this message ready to send. Edit it first if you like."}
              </p>
              <textarea
                rows={5}
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                className="mt-2 w-full rounded-xl2 border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={toWhatsAppLink(selected.customer.phone, waMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setNotifyFor(null)}
                  className="rounded-full bg-forest px-5 py-2 text-xs font-semibold text-ivory shadow-card hover:bg-forest-light"
                >
                  Send on WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => setWaMessage(buildWhatsAppMessage(selected))}
                  className="rounded-full border border-gold/30 px-4 py-2 text-xs font-semibold text-ink/70 hover:bg-champagne"
                >
                  Reset message
                </button>
                {selected.status === "shipped" && !selected.tracking?.trackingNumber && (
                  <span className="text-xs text-gold-dark">
                    Tip: save the courier and tracking ID below first to include them in the message.
                  </span>
                )}
              </div>
            </div>

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

            {showRefundSection && (
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

            {courierOptions.length === 0 && (
              <p className="mt-2 text-xs text-gold-dark">
                No courier partners yet. Add them in{" "}
                <Link href="/admin/settings" className="font-semibold underline">Settings</Link>.
              </p>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-ink/70">Courier partner</label>
                <select
                  value={tracking.courier}
                  onChange={(e) => setTracking((t) => ({ ...t, courier: e.target.value }))}
                  className="mt-1 w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
                >
                  <option value="">Select courier</option>
                  {courierOptions.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                  {/* Keep a previously saved courier selectable even if it was later removed from Settings */}
                  {tracking.courier &&
                    !courierOptions.some((c) => c.name === tracking.courier) && (
                      <option value={tracking.courier}>{tracking.courier}</option>
                    )}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink/70">Tracking ID / AWB number</label>
                <input
                  type="text"
                  placeholder="e.g. 1234567890"
                  value={tracking.trackingNumber}
                  onChange={(e) => setTracking((t) => ({ ...t, trackingNumber: e.target.value }))}
                  className="mt-1 w-full rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
                />
              </div>
              {selected.tracking?.trackingUrl && (
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-ink/70">Tracking link</label>
                  <a
                    href={selected.tracking.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all text-xs text-forest hover:underline"
                  >
                    {selected.tracking.trackingUrl}
                  </a>
                </div>
              )}
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