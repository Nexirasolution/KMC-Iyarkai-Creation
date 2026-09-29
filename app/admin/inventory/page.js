"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function AdminInventoryPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | low | out
  const [categoryId, setCategoryId] = useState("all");
  const [savingId, setSavingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  // Bulk state
  const [selected, setSelected] = useState(() => new Set());
  const [bulkAction, setBulkAction] = useState("set"); // set | add | subtract
  const [bulkValue, setBulkValue] = useState("");
  const [bulkThreshold, setBulkThreshold] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text }

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

  // Categories come from the products themselves, with product counts
  const categories = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (!p.category?._id) return;
      const entry = map.get(p.category._id) || { id: p.category._id, name: p.category.name, count: 0 };
      entry.count += 1;
      map.set(p.category._id, entry);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  function showNotice(type, text) {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 5000);
  }

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

  // Products in the chosen category (before search / stock-status filters) - drives the summary cards
  const inCategory = products.filter((p) => categoryId === "all" || p.category?._id === categoryId);

  const filtered = inCategory
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => {
      if (filter === "low") return p.stock > 0 && p.stock <= p.lowStockThreshold;
      if (filter === "out") return p.stock <= 0;
      return true;
    });

  const lowCount = inCategory.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length;
  const outCount = inCategory.filter((p) => p.stock <= 0).length;

  // ----- Selection helpers -----
  const filteredIds = filtered.map((p) => p._id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const selectedCount = selected.size;

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function changeCategory(id) {
    setCategoryId(id);
    setSelected(new Set()); // avoid updating products that are no longer visible
  }

  // ----- Bulk: same change for every selected product -----
  async function applyBulk() {
    const hasStock = bulkValue !== "";
    const hasThreshold = bulkThreshold !== "";
    if (!hasStock && !hasThreshold) {
      showNotice("error", "Enter a stock value or a low stock alert level.");
      return;
    }
    if (hasStock && (!Number.isInteger(Number(bulkValue)) || Number(bulkValue) < 0)) {
      showNotice("error", "Stock value must be a whole number of 0 or more.");
      return;
    }
    if (hasThreshold && (!Number.isInteger(Number(bulkThreshold)) || Number(bulkThreshold) < 0)) {
      showNotice("error", "Low stock alert must be a whole number of 0 or more.");
      return;
    }

    const verb = { set: "set to", add: "increase by", subtract: "decrease by" }[bulkAction];
    const parts = [];
    if (hasStock) parts.push(`stock ${verb} ${bulkValue}`);
    if (hasThreshold) parts.push(`low stock alert set to ${bulkThreshold}`);
    if (!window.confirm(`Update ${selectedCount} product${selectedCount > 1 ? "s" : ""}: ${parts.join(", ")}?`)) return;

    setBulkBusy(true);
    const res = await fetch("/api/products/bulk-stock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [...selected],
        ...(hasStock ? { action: bulkAction, value: Number(bulkValue) } : {}),
        ...(hasThreshold ? { lowStockThreshold: Number(bulkThreshold) } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBulkBusy(false);

    if (res.ok) {
      showNotice("success", `Updated ${data.modified ?? selectedCount} product${selectedCount > 1 ? "s" : ""}.`);
      setSelected(new Set());
      setBulkValue("");
      setBulkThreshold("");
      loadProducts();
    } else {
      showNotice("error", data.error || "Could not update stock.");
    }
  }

  // ----- Bulk: save every typed-in value in one go -----
  const pendingIds = Object.keys(editValues).filter((id) => editValues[id] !== "");

  async function saveAllPending() {
    const updates = pendingIds.map((id) => ({ id, stock: Number(editValues[id]) }));
    if (updates.some((u) => !Number.isInteger(u.stock) || u.stock < 0)) {
      showNotice("error", "All stock values must be whole numbers of 0 or more.");
      return;
    }
    setBulkBusy(true);
    const res = await fetch("/api/products/bulk-stock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    const data = await res.json().catch(() => ({}));
    setBulkBusy(false);

    if (res.ok) {
      const map = new Map(updates.map((u) => [u.id, u.stock]));
      setProducts((prev) => prev.map((p) => (map.has(p._id) ? { ...p, stock: map.get(p._id) } : p)));
      setEditValues({});
      showNotice("success", `Saved ${updates.length} stock change${updates.length > 1 ? "s" : ""}.`);
    } else {
      showNotice("error", data.error || "Could not save changes.");
    }
  }

  const categoryName = categories.find((c) => c.id === categoryId)?.name;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">Inventory</h1>
          <p className="mt-1 text-sm text-muted">Track and update stock levels across all products</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryId}
            onChange={(e) => changeCategory(e.target.value)}
            className="rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
          >
            <option value="all">All categories ({products.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest md:w-64"
          />
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`mt-4 rounded-lg border px-4 py-2.5 text-sm ${
            notice.type === "success"
              ? "border-forest/30 bg-forest/5 text-forest"
              : "border-terracotta/40 bg-terracotta/5 text-terracotta"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl2 border border-gold/15 bg-white p-5 shadow-card">
          <p className="text-xs font-medium text-muted">Total Products{categoryName ? ` in ${categoryName}` : ""}</p>
          <p className="mt-2 font-display text-2xl font-bold text-forest">{inCategory.length}</p>
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
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

        {pendingIds.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditValues({})}
              className="text-xs font-semibold text-ink/60 hover:text-ink hover:underline"
            >
              Discard
            </button>
            <button
              onClick={saveAllPending}
              disabled={bulkBusy}
              className="rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-ivory hover:bg-forest-light disabled:opacity-40"
            >
              {bulkBusy ? "Saving..." : `Save all changes (${pendingIds.length})`}
            </button>
          </div>
        )}
      </div>

      {/* Bulk update bar - appears once products are selected */}
      {selectedCount > 0 && (
        <div className="mt-4 rounded-xl2 border border-forest/30 bg-champagne/50 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="mr-2">
              <p className="text-sm font-semibold text-forest">
                {selectedCount} selected{categoryName ? ` in ${categoryName}` : ""}
              </p>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-ink/60 hover:text-ink hover:underline"
              >
                Clear selection
              </button>
            </div>

            <label className="text-xs font-medium text-muted">
              Stock
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                  className="rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-forest"
                >
                  <option value="set">Set to</option>
                  <option value="add">Add</option>
                  <option value="subtract">Subtract</option>
                </select>
                <input
                  type="number"
                  min="0"
                  placeholder="Qty"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="w-24 rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-forest"
                />
              </div>
            </label>

            <label className="text-xs font-medium text-muted">
              Low stock alert at
              <input
                type="number"
                min="0"
                placeholder="Optional"
                value={bulkThreshold}
                onChange={(e) => setBulkThreshold(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-forest"
              />
            </label>

            <button
              onClick={applyBulk}
              disabled={bulkBusy}
              className="rounded-full bg-forest px-5 py-2 text-xs font-semibold text-ivory hover:bg-forest-light disabled:opacity-40"
            >
              {bulkBusy ? "Updating..." : `Update ${selectedCount} product${selectedCount > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl2 border border-gold/15 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gold/15 bg-champagne/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all products shown"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                  disabled={filteredIds.length === 0}
                  className="h-4 w-4 accent-forest"
                />
              </th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Current Stock</th>
              <th className="px-4 py-3">Low Stock Alert At</th>
              <th className="px-4 py-3">Update Stock</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No products found.</td></tr>
            ) : (
              filtered.map((p) => {
                const image = p.media?.find((m) => m.type === "image")?.url || p.images?.[0]?.url;
                const isSelected = selected.has(p._id);
                return (
                  <tr
                    key={p._id}
                    className={`border-b border-gold/10 last:border-0 ${isSelected ? "bg-champagne/40" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        checked={isSelected}
                        onChange={() => toggleOne(p._id)}
                        className="h-4 w-4 accent-forest"
                      />
                    </td>
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
                          disabled={savingId === p._id || editValues[p._id] === undefined || editValues[p._id] === ""}
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