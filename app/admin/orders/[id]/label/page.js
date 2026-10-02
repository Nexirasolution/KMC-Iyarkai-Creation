"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toGrams, formatWeight, orderTotalGrams, itemsMissingWeight } from "@/lib/weight";

export default function ShippingLabelPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [orderRes, settingsRes] = await Promise.all([
          fetch(`/api/orders/${id}`),
          fetch("/api/settings"),
        ]);
        const orderData = await orderRes.json();
        if (!orderRes.ok) throw new Error(orderData.error || "Order not found");
        setOrder(orderData.order);

        const settingsData = await settingsRes.json();
        if (settingsData.settings) setSettings(settingsData.settings);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (id) loadData();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted">Loading label...</div>;
  }

  if (error || !order) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted">{error || "Order not found."}</p>
        <button onClick={() => router.back()} className="mt-3 text-xs font-semibold text-forest hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const totalGrams = orderTotalGrams(order.items);
  const missing = itemsMissingWeight(order.items);

  return (
    <div className="min-h-screen bg-champagne/40 px-4 py-6 sm:px-6">
      {/* Screen-only controls, hidden when printing */}
      <div className="mx-auto mb-4 flex max-w-md items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="text-sm font-semibold text-ink/70 hover:text-forest">
          &larr; Back
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-ivory shadow-card"
        >
          Print label
        </button>
      </div>

      {/* Label card — this is what gets printed */}
      <div
        id="label-print-area"
        className="mx-auto w-full max-w-md border-2 border-ink bg-white p-4 text-ink shadow-card sm:p-5 print:max-w-none print:border-0 print:shadow-none"
      >
        <div className="flex items-start justify-between border-b-2 border-ink pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">Order</p>
            <p className="text-lg font-bold sm:text-xl">{order.orderNumber}</p>
          </div>
          <span className="rounded border border-ink px-2 py-0.5 text-[11px] font-semibold uppercase">
            {order.paymentMethod}
          </span>
        </div>

        {settings && (settings.storeName || settings.address || settings.phone) && (
          <div className="mt-3 border-b border-dashed border-muted/50 pb-3">
            <p className="text-[10px] uppercase tracking-wide text-muted">From</p>
            {settings.storeName && <p className="text-sm font-bold">{settings.storeName}</p>}
            {settings.address && <p className="mt-0.5 text-xs leading-snug text-ink/80">{settings.address}</p>}
            {settings.phone && <p className="mt-0.5 text-xs text-ink/80">Phone: {settings.phone}</p>}
          </div>
        )}

        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted">Ship to</p>
          <p className="text-base font-bold sm:text-lg">{order.customer.name}</p>
          <p className="mt-1 text-sm leading-snug">
            {order.customer.address}, {order.customer.city} {order.customer.pincode}, {order.customer.state}
          </p>
          <p className="mt-1 text-sm">Phone: {order.customer.phone}</p>
        </div>

        <div className="my-3 border-t border-dashed border-muted/50" />

        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-muted/30 text-[10px] uppercase text-muted">
              <th className="pb-1 text-left font-semibold">Item</th>
              <th className="pb-1 text-right font-semibold">Qty</th>
              <th className="pb-1 pl-2 text-right font-semibold">Weight</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => {
              const lineGrams = toGrams(item.weight) * item.quantity;
              return (
                <tr key={i} className="border-b border-muted/10">
                  <td className="py-1 pr-2">{item.name}</td>
                  <td className="py-1 text-right">{item.quantity}</td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right">{formatWeight(lineGrams)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-2 flex justify-between text-xs font-semibold sm:text-sm">
          <span>Total weight</span>
          <span>{formatWeight(totalGrams)}</span>
        </div>
        {missing > 0 && (
          <p className="mt-0.5 text-[10px] text-muted print:hidden">
            {missing} item{missing > 1 ? "s have" : " has"} no weight set.
          </p>
        )}

        <div className="mt-3 flex justify-between border-t-2 border-ink pt-2 text-sm font-bold sm:text-base">
          <span>Total</span>
          <span>₹{order.total}</span>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: 4in 6in;
            margin: 0.15in;
          }
          body * {
            visibility: hidden;
          }
          #label-print-area,
          #label-print-area * {
            visibility: visible;
          }
          #label-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}