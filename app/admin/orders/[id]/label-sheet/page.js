"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ShippingLabelSheetPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const sheetRef = useRef(null);

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

  async function handleDownload() {
    if (!sheetRef.current || !order) return;
    setDownloading(true);
    try {
      // Loaded dynamically so they're only pulled in when actually needed.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(sheetRef.current, {
        scale: 3, // higher res for crisp print-quality PDF
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");

      // A4 in points: 595.28 x 841.89
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // If content is taller than one page, scale down to fit instead of cropping.
      const finalHeight = Math.min(imgHeight, pageHeight);
      const finalWidth = finalHeight === imgHeight ? imgWidth : (canvas.width * finalHeight) / canvas.height;

      pdf.addImage(imgData, "PNG", 0, 0, finalWidth, finalHeight);
      pdf.save(`label-${order.orderNumber}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF", err);
      alert("Couldn't generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

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

  return (
    <div className="min-h-screen bg-champagne/40 px-4 py-6 sm:px-6">
      {/* Screen-only controls, hidden when printing */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="text-sm font-semibold text-ink/70 hover:text-forest">
          &larr; Back
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest disabled:opacity-60"
          >
            {downloading ? "Preparing..." : "Download PDF"}
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-ivory shadow-card"
          >
            Print
          </button>
        </div>
      </div>

      {/* Full sheet — this is what gets printed / exported */}
      <div
        ref={sheetRef}
        id="label-sheet-print-area"
        className="mx-auto flex aspect-[210/297] w-full max-w-3xl flex-col justify-between border border-ink/20 bg-white p-10 text-ink shadow-card print:aspect-auto print:max-w-none print:border-0 print:shadow-none"
      >
        {/* Top area: To address, plain, top-right */}
        <div className="flex justify-end">
          <div className="max-w-sm text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted">To</p>
            <p className="mt-1 text-xl font-bold">{order.customer.name}</p>
            <p className="mt-1 text-base leading-snug">
              {order.customer.address}, {order.customer.city} {order.customer.pincode}, {order.customer.state}
            </p>
            <p className="mt-1 text-base">Phone: {order.customer.phone}</p>
          </div>
        </div>

        {/* Bottom area: From address, plain, bottom-left */}
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">From</p>
          {settings?.storeName && <p className="mt-1 text-base font-bold">{settings.storeName}</p>}
          {settings?.address && (
            <p className="mt-1 max-w-xs text-sm leading-snug text-ink/80">{settings.address}</p>
          )}
          {settings?.phone && <p className="mt-1 text-sm text-ink/80">Phone: {settings.phone}</p>}

          <div className="mt-8 flex items-center gap-3 text-xs text-muted">
            <span className="rounded border border-ink/40 px-2 py-0.5 font-semibold uppercase">
              {order.paymentMethod}
            </span>
            <span>Order {order.orderNumber}</span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0.5in;
          }
          body * {
            visibility: hidden;
          }
          #label-sheet-print-area,
          #label-sheet-print-area * {
            visibility: visible;
          }
          #label-sheet-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
          }
        }
      `}</style>
    </div>
  );
}