"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Modal from "@/components/Modal";
import MediaUploader from "@/components/MediaUploader";
import BulkUploadModal from "@/components/BulkUploadModal";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatWeight } from "@/lib/weight";

const EMPTY_FORM = {
  name: "",
  sku: "",
  category: "",
  price: "",
  compareAtPrice: "",
  unit: "piece",
  weightValue: "", // optional
  weightUnit: "g",
  stock: 0,
  lowStockThreshold: 5,
  description: "",
  isFeatured: false,
  isActive: true,
  media: [],
};

const EMPTY_BULK = {
  priceMode: "",
  priceValue: "",
  category: "",
  status: "",
  featured: "",
  unit: "",
};

const PRICE_MODE_LABELS = {
  set: "Set price to ₹",
  increase_percent: "Increase price by %",
  decrease_percent: "Decrease price by %",
  increase_amount: "Increase price by ₹",
  decrease_amount: "Decrease price by ₹",
};

const PAGE_SIZE = 20;

export default function AdminProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(""); // "" = all categories
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Bulk update state
  const [selected, setSelected] = useState(() => new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false); // true = every product matching the filter, across all pages
  const [bulk, setBulk] = useState(EMPTY_BULK);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text }

  async function loadProducts() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    if (categoryFilter) params.set("category", categoryFilter);
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();
    setProducts(data.products || []);
    setPagination(data.pagination || null);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []));
  }, []);

  // Reset to page 1 whenever the search term or category changes
  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter]);

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, categoryFilter]);

  function showNotice(type, text) {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 5000);
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectAllMatching(false);
  }

  function handleSearchChange(value) {
    setSearch(value);
    clearSelection(); // the old selection may no longer match what is shown
  }

  function handleCategoryChange(value) {
    setCategoryFilter(value);
    clearSelection();
  }

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category: categories[0]?._id || "" });
    setError("");
    setModalOpen(true);
  }

  function openEdit(p) {
    setEditingId(p._id);
    setForm({
      name: p.name,
      sku: p.sku || "",
      category: p.category?._id || "",
      price: p.price,
      compareAtPrice: p.compareAtPrice || "",
      unit: p.unit,
      weightValue: p.weight?.value > 0 ? p.weight.value : "",
      weightUnit: p.weight?.unit || "g",
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      description: p.description || "",
      isFeatured: p.isFeatured,
      isActive: p.isActive,
      media: p.media || [],
    });
    setError("");
    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      // weightValue / weightUnit are form-only fields; the API expects a `weight` object.
      // Blank weight is sent as value 0, which means "not set" (and clears it on edit).
      const { weightValue, weightUnit, ...rest } = form;
      const payload = {
        ...rest,
        sku: form.sku.trim().toUpperCase(),
        price: Number(form.price),
        compareAtPrice: Number(form.compareAtPrice) || 0,
        stock: Number(form.stock),
        lowStockThreshold: Number(form.lowStockThreshold),
        weight: {
          value: weightValue === "" ? 0 : Number(weightValue),
          unit: weightUnit,
        },
      };
      const res = await fetch(editingId ? `/api/products/${editingId}` : "/api/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save product.");
      setModalOpen(false);
      loadProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // If this was the last item on the current page, step back a page
    if (products.length === 1 && page > 1) {
      setPage((p) => p - 1);
    } else {
      loadProducts();
    }
  }

  function goToPage(p) {
    if (p < 1 || (pagination && p > pagination.totalPages)) return;
    setPage(p);
  }

  const totalPages = pagination?.totalPages || 1;

  function getPageNumbers() {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== "...") {
        pages.push("...");
      }
    }
    return pages;
  }

  // --- Selection helpers ---

  const pageIds = products.map((p) => p._id);
  const allPageSelected = pageIds.length > 0 && (selectAllMatching || pageIds.every((id) => selected.has(id)));
  const totalMatching = pagination?.total ?? products.length;
  const selectedCount = selectAllMatching ? totalMatching : selected.size;
  const categoryName = categories.find((c) => c._id === categoryFilter)?.name;

  function toggleOne(id) {
    if (selectAllMatching) {
      // switching back to manual selection: start from the current page minus this row
      setSelectAllMatching(false);
      setSelected(new Set(pageIds.filter((x) => x !== id)));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    if (allPageSelected) {
      if (selectAllMatching) {
        clearSelection();
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          pageIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  // --- Bulk update ---

  function buildChanges() {
    const changes = {};

    if (bulk.priceMode) {
      const v = Number(bulk.priceValue);
      if (bulk.priceValue === "" || !Number.isFinite(v) || v < 0) {
        return { error: "Enter a valid number for the price change." };
      }
      if (bulk.priceMode === "decrease_percent" && v > 100) {
        return { error: "A price cannot be reduced by more than 100%." };
      }
      changes.price = { mode: bulk.priceMode, value: v };
    }
    if (bulk.category) changes.category = bulk.category;
    if (bulk.status) changes.isActive = bulk.status === "active";
    if (bulk.featured) changes.isFeatured = bulk.featured === "yes";
    if (bulk.unit.trim()) changes.unit = bulk.unit.trim();

    if (Object.keys(changes).length === 0) {
      return { error: "Choose at least one change to apply." };
    }
    return { changes };
  }

  function describeChanges(changes) {
    const parts = [];
    if (changes.price) {
      parts.push(`${PRICE_MODE_LABELS[changes.price.mode]} ${changes.price.value}`.replace("Set price to ₹ ", "set price to ₹"));
    }
    if (changes.category) {
      parts.push(`move to "${categories.find((c) => c._id === changes.category)?.name}"`);
    }
    if (changes.isActive !== undefined) parts.push(changes.isActive ? "make Active" : "make Hidden");
    if (changes.isFeatured !== undefined) parts.push(changes.isFeatured ? "mark Featured" : "remove Featured");
    if (changes.unit) parts.push(`set unit to "${changes.unit}"`);
    return parts.join(", ");
  }

  async function applyBulk() {
    const { changes, error: changeError } = buildChanges();
    if (changeError) {
      showNotice("error", changeError);
      return;
    }

    const count = selectedCount;
    const scope = selectAllMatching
      ? `all ${count} products${categoryName ? ` in ${categoryName}` : ""}${search ? ` matching "${search}"` : ""}`
      : `${count} selected product${count > 1 ? "s" : ""}`;
    if (!window.confirm(`Apply to ${scope}:\n\n${describeChanges(changes)}\n\nThis cannot be undone. Continue?`)) return;

    setBulkBusy(true);
    try {
      const res = await fetch("/api/products/bulk-update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(selectAllMatching
            ? { filter: { category: categoryFilter || undefined, search: search || undefined } }
            : { ids: [...selected] }),
          changes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update products.");

      showNotice("success", `Updated ${data.modified ?? count} product${(data.modified ?? count) === 1 ? "" : "s"}.`);
      clearSelection();
      setBulk(EMPTY_BULK);
      loadProducts();
    } catch (err) {
      showNotice("error", err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  // --- Export helpers ---

  // Fetches every product matching the current search + category (no pagination limit)
  async function fetchAllProductsForExport() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryFilter) params.set("category", categoryFilter);
    // omitting `page` and `limit` makes the API return the full unpaginated list
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();
    return data.products || [];
  }

  function buildExportRows(list) {
    return list.map((p) => ({
      SKU: p.sku,
      Name: p.name,
      Category: p.category?.name || "",
      Price: p.price,
      "Compare Price": p.compareAtPrice || 0,
      Unit: p.unit,
      Weight: formatWeight(p.weight) || "",
      Stock: p.stock,
      "Low Stock Threshold": p.lowStockThreshold,
      Status: p.isActive ? "Active" : "Hidden",
      Featured: p.isFeatured ? "Yes" : "No",
      Description: p.description || "",
    }));
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const list = await fetchAllProductsForExport();
      if (list.length === 0) {
        alert("No products to export.");
        return;
      }
      const rows = buildExportRows(list);
      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Reasonable column widths
      worksheet["!cols"] = [
        { wch: 14 }, // SKU
        { wch: 28 }, // Name
        { wch: 16 }, // Category
        { wch: 10 }, // Price
        { wch: 14 }, // Compare Price
        { wch: 10 }, // Unit
        { wch: 10 }, // Weight
        { wch: 8 },  // Stock
        { wch: 10 }, // Low Stock Threshold
        { wch: 10 }, // Status
        { wch: 10 }, // Featured
        { wch: 40 }, // Description
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `products-${dateStr}.xlsx`);
    } catch (err) {
      console.error(err);
      alert("Failed to export Excel file.");
    } finally {
      setExporting(false);
    }
  }

  async function exportPDF() {
    setExporting(true);
    try {
      const list = await fetchAllProductsForExport();
      if (list.length === 0) {
        alert("No products to export.");
        return;
      }

      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(16);
      doc.setTextColor(30, 60, 45);
      doc.text("KMC Iyarkai Creation", pageWidth / 2, 16, { align: "center" });

      doc.setFontSize(12);
      doc.setTextColor(80, 80, 80);
      doc.text("Product List", pageWidth / 2, 23, { align: "center" });
      doc.setFontSize(9);
      doc.text(`Generated on ${new Date().toLocaleDateString("en-IN")} · ${list.length} products`, pageWidth / 2, 29, {
        align: "center",
      });

      autoTable(doc, {
        startY: 36,
        head: [["SKU", "Name", "Category", "Price (₹)", "Weight", "Stock", "Status", "Featured"]],
        body: list.map((p) => [
          p.sku,
          p.name,
          p.category?.name || "-",
          p.price,
          formatWeight(p.weight) || "-",
          p.stock,
          p.isActive ? "Active" : "Hidden",
          p.isFeatured ? "Yes" : "No",
        ]),
        theme: "grid",
        headStyles: { fillColor: [184, 146, 63] },
        styles: { fontSize: 8 },
        columnStyles: {
          1: { cellWidth: 70 }, // Name column gets more room
        },
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      doc.save(`products-${dateStr}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Failed to export PDF.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">Products</h1>
          <p className="mt-1 text-sm text-muted">
            {pagination
              ? `${pagination.total} products ${categoryName ? `in ${categoryName}` : "total"}`
              : "Loading..."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="rounded-full border border-gold/30 bg-white px-4 py-2 text-sm outline-none focus:border-forest"
          />
          <button
            onClick={exportExcel}
            disabled={exporting}
            className="rounded-full border border-gold/40 px-5 py-2 text-sm font-semibold text-gold-dark hover:bg-gold/5 disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
          <button
            onClick={exportPDF}
            disabled={exporting}
            className="rounded-full border border-gold/40 px-5 py-2 text-sm font-semibold text-gold-dark hover:bg-gold/5 disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
          <button
            onClick={() => setBulkOpen(true)}
            disabled={categories.length === 0}
            className="rounded-full border border-forest px-6 py-2 text-sm font-semibold text-forest hover:bg-forest/5 disabled:opacity-50"
            title={categories.length === 0 ? "Add a category first" : ""}
          >
            Bulk Upload
          </button>
          <button
            onClick={openAdd}
            disabled={categories.length === 0}
            className="rounded-full bg-forest px-6 py-2 text-sm font-semibold text-ivory shadow-soft hover:bg-forest-light disabled:opacity-50"
            title={categories.length === 0 ? "Add a category first" : ""}
          >
            + Add Product
          </button>
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

      {/* Bulk update bar - appears once products are selected */}
      {selectedCount > 0 && (
        <div className="mt-4 rounded-xl2 border border-forest/30 bg-champagne/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold text-forest">
              {selectedCount} product{selectedCount > 1 ? "s" : ""} selected
              {categoryName ? ` in ${categoryName}` : ""}
              {selectAllMatching && search ? ` matching "${search}"` : ""}
            </p>
            <button onClick={clearSelection} className="text-xs text-ink/60 hover:text-ink hover:underline">
              Clear selection
            </button>
          </div>

          {/* Offer to extend the selection beyond the current page */}
          {!selectAllMatching && allPageSelected && pagination && pagination.total > products.length && (
            <p className="mt-2 text-xs text-ink/70">
              All {products.length} products on this page are selected.{" "}
              <button
                onClick={() => setSelectAllMatching(true)}
                className="font-semibold text-forest hover:underline"
              >
                Select all {pagination.total} products{categoryName ? ` in ${categoryName}` : ""}
                {search ? ` matching "${search}"` : ""}
              </button>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-4">
            <label className="text-xs font-medium text-muted">
              Price
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={bulk.priceMode}
                  onChange={(e) => setBulk({ ...bulk, priceMode: e.target.value })}
                  className="rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-forest"
                >
                  <option value="">No change</option>
                  {Object.entries(PRICE_MODE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                {bulk.priceMode && (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Value"
                    value={bulk.priceValue}
                    onChange={(e) => setBulk({ ...bulk, priceValue: e.target.value })}
                    className="w-24 rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-forest"
                  />
                )}
              </div>
            </label>

            <label className="text-xs font-medium text-muted">
              Move to category
              <select
                value={bulk.category}
                onChange={(e) => setBulk({ ...bulk, category: e.target.value })}
                className="mt-1 block rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-forest"
              >
                <option value="">No change</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-muted">
              Status
              <select
                value={bulk.status}
                onChange={(e) => setBulk({ ...bulk, status: e.target.value })}
                className="mt-1 block rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-forest"
              >
                <option value="">No change</option>
                <option value="active">Active (visible)</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>

            <label className="text-xs font-medium text-muted">
              Featured
              <select
                value={bulk.featured}
                onChange={(e) => setBulk({ ...bulk, featured: e.target.value })}
                className="mt-1 block rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-forest"
              >
                <option value="">No change</option>
                <option value="yes">Featured</option>
                <option value="no">Not featured</option>
              </select>
            </label>

            <label className="text-xs font-medium text-muted">
              Unit
              <input
                type="text"
                placeholder="No change"
                value={bulk.unit}
                onChange={(e) => setBulk({ ...bulk, unit: e.target.value })}
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

      <div className="mt-6 overflow-x-auto rounded-xl2 border border-gold/15 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gold/15 bg-champagne/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all products on this page"
                  checked={allPageSelected}
                  onChange={toggleAllOnPage}
                  disabled={products.length === 0}
                  className="h-4 w-4 accent-forest"
                />
              </th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">
                {search || categoryFilter ? "No products match your filters." : "No products yet. Add your first product."}
              </td></tr>
            ) : (
              products.map((p) => {
                const isSelected = selectAllMatching || selected.has(p._id);
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
                    <td className="px-4 py-3 font-mono text-xs text-ink/70">{p.sku}</td>
                    <td className="flex items-center gap-3 px-4 py-3">
                      <div className="h-10 w-10 overflow-hidden rounded-lg bg-champagne">
                        {p.media?.[0] &&
                          (p.media[0].type === "video" ? (
                            <video
                              src={p.media[0].url}
                              className="h-full w-full object-cover"
                              muted
                            />
                          ) : (
                            <Image
                              src={p.media[0].url}
                              alt=""
                              width={40}
                              height={40}
                              className="h-full w-full object-cover"
                            />
                          ))}
                      </div>
                      <span className="font-medium text-ink">{p.name}</span>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{p.category?.name}</td>
                    <td className="px-4 py-3 text-ink/70">₹{p.price}</td>
                    <td className="px-4 py-3 text-ink/70">{formatWeight(p.weight) || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={p.stock <= p.lowStockThreshold ? "font-semibold text-terracotta" : "text-ink/70"}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${p.isActive ? "bg-forest/10 text-forest" : "bg-muted/10 text-muted"}`}>
                        {p.isActive ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(p)} className="mr-3 text-xs font-semibold text-forest hover:underline">Edit</button>
                      <button onClick={() => handleDelete(p._id)} className="text-xs font-semibold text-terracotta hover:underline">Delete</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} products
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="rounded-full border border-gold/30 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-champagne disabled:cursor-not-allowed disabled:opacity-40"
            >
              &larr; Prev
            </button>

            {getPageNumbers().map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="px-2 text-xs text-muted">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  className={`h-8 w-8 rounded-full text-xs font-semibold transition ${
                    p === page
                      ? "bg-forest text-ivory"
                      : "border border-gold/30 text-ink/70 hover:bg-champagne"
                  }`}
                >
                  {p}
                </button>
              )
            )}

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="rounded-full border border-gold/30 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-champagne disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Product" : "Add Product"} wide>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Product Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <FormField
              label="SKU"
              required
              value={form.sku}
              onChange={(v) => setForm({ ...form, sku: v.toUpperCase() })}
              placeholder="e.g. HC-OIL-001"
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Category *</span>
            <select
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-4">
            <FormField label="Price (₹)" required type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
            <FormField label="Compare Price" type="number" value={form.compareAtPrice} onChange={(v) => setForm({ ...form, compareAtPrice: v })} />
            <FormField label="Unit" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} placeholder="e.g. 500 ml" />
            <FormField label="Stock" required type="number" value={form.stock} onChange={(v) => setForm({ ...form, stock: v })} />
          </div>

          {/* Optional weight */}
          <div>
            <span className="mb-1 block text-xs font-semibold text-ink/70">Weight (optional)</span>
            <div className="flex max-w-xs gap-2">
              <input
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 250"
                value={form.weightValue}
                onChange={(e) => setForm({ ...form, weightValue: e.target.value })}
                className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
              />
              <select
                value={form.weightUnit}
                onChange={(e) => setForm({ ...form, weightUnit: e.target.value })}
                className="rounded-xl border border-gold/30 bg-white px-3 py-2.5 text-sm outline-none focus:border-forest"
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Product Images / Videos</span>
            <MediaUploader
              media={form.media}
              onChange={(media) =>
                setForm({
                  ...form,
                  media,
                })
              }
            />
          </label>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
              Featured on homepage
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (visible in store)
            </label>
          </div>

          {error && <p className="text-sm text-terracotta">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-forest px-8 py-3 text-sm font-semibold text-ivory shadow-soft hover:bg-forest-light disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Save Changes" : "Add Product"}
          </button>
        </form>
      </Modal>

      <BulkUploadModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={loadProducts}
      />
    </div>
  );
}

function FormField({ label, value, onChange, required, type = "text", placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink/70">
        {label} {required && <span className="text-terracotta">*</span>}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
      />
    </label>
  );
}