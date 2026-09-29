"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_TEMPLATE = `Hi {name}! 🌿

New from KMC Iyarkai Creation: *{product}* is now available at {price}.

See it here: {link}

(Reply STOP if you don't want these updates.)`;

function render(template, recipient, snap, link) {
  const firstName = (recipient.name || "").trim().split(" ")[0] || "there";
  return template
    .replaceAll("{name}", firstName)
    .replaceAll("{product}", snap?.name || "")
    .replaceAll("{price}", `₹${snap?.price ?? ""}`)
    .replaceAll("{link}", link || "");
}

function waLink(text, phone) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export default function AdminWhatsAppPage() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [consent, setConsent] = useState("all");
  const [audienceCount, setAudienceCount] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [campaign, setCampaign] = useState(null); // active campaign being worked through
  const [history, setHistory] = useState([]);

  useEffect(() => {
    fetch("/api/products?activeOnly=true")
      .then((r) => r.json())
      .then((d) => setProducts(d.products || []));
    loadHistory();
  }, []);

  useEffect(() => {
    setAudienceCount(null);
    fetch(`/api/admin/whatsapp/audience?consent=${consent}`)
      .then((r) => r.json())
      .then((d) => setAudienceCount(d.count ?? 0));
  }, [consent]);

  async function loadHistory() {
    const res = await fetch("/api/admin/whatsapp/campaigns");
    const data = await res.json();
    setHistory(data.campaigns || []);
  }

  const product = products.find((p) => p._id === productId);
  const link = product && typeof window !== "undefined" ? `${window.location.origin}/products/${product.slug}` : "";

  const preview = useMemo(
    () =>
      product
        ? render(template, { name: "Priya Kumar" }, { name: product.name, price: product.price }, link)
        : "Choose a product to see the preview.",
    [template, product, link]
  );

  async function createCampaign() {
    setError("");
    if (!productId) return setError("Choose a product first.");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/whatsapp/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, messageTemplate: template, link, consent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create campaign.");
      setCampaign(data.campaign);
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function openCampaign(id) {
    const res = await fetch(`/api/admin/whatsapp/campaigns/${id}`);
    const data = await res.json();
    if (res.ok) setCampaign(data.campaign);
  }

  async function patchRecipient(phone, payload) {
    const res = await fetch(`/api/admin/whatsapp/campaigns/${campaign._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, ...payload }),
    });
    const data = await res.json();
    if (res.ok) {
      setCampaign(data.campaign);
      loadHistory();
    }
  }

  // Opens WhatsApp with the message ready, then marks the customer as sent.
  // The admin still presses the green Send button inside WhatsApp.
  function sendTo(r) {
    const text = render(campaign.messageTemplate, r, campaign.productSnapshot, campaign.link);
    window.open(waLink(text, r.phone), "_blank", "noopener");
    patchRecipient(r.phone, { status: "sent" });
  }

  function downloadContacts() {
    const cards = campaign.recipients
      .map(
        (r) =>
          `BEGIN:VCARD\nVERSION:3.0\nFN:${(r.name || "Customer").replace(/[\n;,]/g, " ")} (KMC)\nTEL;TYPE=CELL:+${r.phone}\nEND:VCARD`
      )
      .join("\n");
    const blob = new Blob([cards], { type: "text/vcard" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kmc-customers.vcf";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const pending = campaign?.recipients.filter((r) => r.status === "pending") || [];
  const sentCount = campaign?.recipients.filter((r) => r.status === "sent").length || 0;
  const total = campaign?.recipients.length || 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-forest">WhatsApp Product Launch</h1>
        <p className="mt-1 text-sm text-muted">
          Send a new product message to your past customers. Each customer opens in WhatsApp with the message
          ready; you press Send.
        </p>
      </div>

      {!campaign ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl2 border border-gold/15 bg-white p-5 shadow-card">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink/70">New product</span>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} (₹{p.price})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink/70">
                Message (use {"{name}"} {"{product}"} {"{price}"} {"{link}"})
              </span>
              <textarea
                rows={9}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink/70">Who should receive it?</span>
              <select
                value={consent}
                onChange={(e) => setConsent(e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
              >
                <option value="all">All past customers</option>
                <option value="optedIn">Only customers who agreed to offers at checkout</option>
              </select>
              <span className="mt-1 block text-xs text-muted">
                {audienceCount === null ? "Counting..." : `${audienceCount} customers will be included`}
              </span>
            </label>

            {error && <p className="text-sm text-terracotta">{error}</p>}

            <button
              onClick={createCampaign}
              disabled={creating}
              className="w-full rounded-full bg-forest px-8 py-3 text-sm font-semibold text-ivory shadow-soft hover:bg-forest-light disabled:opacity-60"
            >
              {creating ? "Preparing..." : "Prepare customer list"}
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-ink/70">Preview</p>
            <div className="whitespace-pre-wrap rounded-xl2 bg-[#dcf8c6] p-4 text-sm text-ink shadow-card">
              {preview}
            </div>

            {history.length > 0 && (
              <div className="mt-8">
                <p className="mb-2 text-xs font-semibold text-ink/70">Earlier campaigns</p>
                <ul className="divide-y divide-gold/10 rounded-xl2 border border-gold/15 bg-white text-sm">
                  {history.map((c) => (
                    <li key={c._id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-medium text-ink">{c.productName}</p>
                        <p className="text-xs text-muted">
                          {new Date(c.createdAt).toLocaleDateString("en-IN")} · {c.sent}/{c.total} sent
                        </p>
                      </div>
                      <button
                        onClick={() => openCampaign(c._id)}
                        className="text-xs font-semibold text-forest hover:underline"
                      >
                        {c.sent + c.skipped < c.total ? "Resume" : "View"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-forest/30 bg-champagne/50 p-4">
            <div>
              <p className="text-sm font-semibold text-forest">{campaign.productSnapshot?.name}</p>
              <p className="text-xs text-muted">
                {sentCount} of {total} sent · {pending.length} remaining
              </p>
              <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full bg-forest transition-all"
                  style={{ width: `${total ? (sentCount / total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => pending[0] && sendTo(pending[0])}
                disabled={!pending.length}
                className="rounded-full bg-forest px-6 py-2 text-sm font-semibold text-ivory hover:bg-forest-light disabled:opacity-40"
              >
                {pending.length ? `Send next (${pending[0].name || pending[0].phone})` : "All done"}
              </button>
              <button
                onClick={downloadContacts}
                className="rounded-full border border-gold/40 px-5 py-2 text-sm font-semibold text-gold-dark hover:bg-gold/5"
              >
                Download contacts (.vcf)
              </button>
              <button
                onClick={() => {
                  setCampaign(null);
                  loadHistory();
                }}
                className="rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest hover:bg-forest/5"
              >
                Back
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl2 border border-gold/15 bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gold/15 bg-champagne/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaign.recipients.map((r) => (
                  <tr key={r.phone} className="border-b border-gold/10 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{r.name || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink/70">+{r.phone}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          r.status === "sent"
                            ? "bg-forest/10 text-forest"
                            : r.status === "skipped"
                            ? "bg-muted/10 text-muted"
                            : "bg-gold/10 text-gold-dark"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => sendTo(r)} className="mr-3 text-xs font-semibold text-forest hover:underline">
                        {r.status === "sent" ? "Send again" : "Send on WhatsApp"}
                      </button>
                      {r.status === "pending" ? (
                        <button
                          onClick={() => patchRecipient(r.phone, { status: "skipped" })}
                          className="mr-3 text-xs text-ink/60 hover:underline"
                        >
                          Skip
                        </button>
                      ) : (
                        <button
                          onClick={() => patchRecipient(r.phone, { status: "pending" })}
                          className="mr-3 text-xs text-ink/60 hover:underline"
                        >
                          Undo
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Never message ${r.name || r.phone} again?`))
                            patchRecipient(r.phone, { doNotMessage: true });
                        }}
                        className="text-xs font-semibold text-terracotta hover:underline"
                      >
                        Do not message
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}