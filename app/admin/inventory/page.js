"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function AdminInventoryPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | low | out
  const [savingId, setSavingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  async function loadProducts() {
    setLoading(true);
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data.products || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  async function saveStock(id) {
    const value = editValues[id];
    if (value === undefined) return;
    setSavingId(id);
    const res = await fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock: Number(value) }),
    });
    setSavingId(null);
    if (res.ok) {
      setProducts((prev) => prev.map((p) => (p._id === id ? { ...p, stock: Number(value) } : p)));
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  const filtered = products
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => {
      if (filter === "low") return p.stock > 0 && p.stock <= p.lowStockThreshold;
      if (filter === "out") return p.stock <= 0;
      return true;
    });

  const lowCount = products.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length;
  const outCount = products.filter((p) => p.stock <= 0).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">Inventory</h1>
          <p className="mt-1 text-sm text-muted">Track and update stock levels across all products</p>
        </div>
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest md:w-64"
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl2 border border-gold/15 bg-white p-5 shadow-card">
          <p className="text-xs font-medium text-muted">Total Products</p>
          <p className="mt-2 font-display text-2xl font-bold text-forest">{products.length}</p>
        </div>
        <div className="rounded-xl2 border border-gold/15 bg-white p-5 shadow-card">
          <p className="text-xs font-medium text-muted">Low Stock</p>
          <p className="mt-2 font-display text-2xl font-bold text-gold-dark">{lowCount}</p>
        </div>
        <div className="rounded-xl2 border border-gold/15 bg-white p-5 shadow-card">
          <p className="text-xs font-medium text-muted">Out of Stock</p>
          <p className="mt-2 font-display text-2xl font-bold text-terracotta">{outCount}</p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        {[
          ["all", "All"],
          ["low", "Low Stock"],
          ["out", "Out of Stock"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${filter === key ? "border-forest bg-forest text-ivory" : "border-gold/30 text-ink/70"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl2 border border-gold/15 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gold/15 bg-champagne/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Current Stock</th>
              <th className="px-4 py-3">Low Stock Alert At</th>
              <th className="px-4 py-3">Update Stock</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No products found.</td></tr>
            ) : (
              filtered.map((p) => {
                const image = p.media?.find((m) => m.type === "image")?.url || p.images?.[0]?.url;
                return (
                  <tr key={p._id} className="border-b border-gold/10 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/products/${p.slug}`} className="flex items-center gap-3 group w-fit">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-champagne">
                          {image ? (
                            <Image src={image} alt="" width={40} height={40} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[9px] text-muted">
                              No image
                            </div>
                          )}
                        </div>
                        <span className="font-medium text-ink group-hover:text-forest group-hover:underline">
                          {p.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{p.category?.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          p.stock <= 0
                            ? "font-semibold text-terracotta"
                            : p.stock <= p.lowStockThreshold
                            ? "font-semibold text-gold-dark"
                            : "text-ink/70"
                        }
                      >
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{p.lowStockThreshold}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          placeholder={String(p.stock)}
                          value={editValues[p._id] ?? ""}
                          onChange={(e) => setEditValues((prev) => ({ ...prev, [p._id]: e.target.value }))}
                          className="w-20 rounded-lg border border-gold/30 px-2 py-1.5 text-sm outline-none focus:border-forest"
                        />
                        <button
                          onClick={() => saveStock(p._id)}
                          disabled={savingId === p._id || editValues[p._id] === undefined}
                          className="rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-ivory hover:bg-forest-light disabled:opacity-40"
                        >
                          {savingId === p._id ? "..." : "Save"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}