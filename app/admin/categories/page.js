"use client";
import ImageUploader from "@/components/ImageUploader";
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { CATEGORY_ICONS, LeafIcon } from "@/components/Icons";

const EMPTY_FORM = {
  name: "",
  description: "",
  icon: "leaf",
  image: [],
  isActive: true,
  sortOrder: 0,
  parent: "",
};
const ICON_OPTIONS = ["leaf", "bag", "pot", "wood", "drop", "herb"];

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({}); // { [categoryId]: boolean }

  async function loadData() {
    setLoading(true);
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data.categories || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const byParent = useMemo(() => {
    const map = {};
    for (const c of categories) {
      const key = c.parent || "root";
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [categories]);

  function childrenOf(id) {
    return byParent[id || "root"] || [];
  }

  function hasChildren(id) {
    return (byParent[id] || []).length > 0;
  }

  // Collects the id + every descendant id of `id`, so we can exclude them
  // from the parent dropdown and avoid creating a cycle.
  function collectDescendantIds(id) {
    const ids = new Set([id]);
    const stack = [id];
    while (stack.length) {
      const current = stack.pop();
      for (const child of byParent[current] || []) {
        if (!ids.has(child._id)) {
          ids.add(child._id);
          stack.push(child._id);
        }
      }
    }
    return ids;
  }

  const excludedParentIds = useMemo(
    () => (editingId ? collectDescendantIds(editingId) : new Set()),
    [editingId, categories]
  );

  const eligibleParents = useMemo(
    () => categories.filter((c) => !excludedParentIds.has(c._id)),
    [categories, excludedParentIds]
  );

  function openAdd(parentId = "") {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, parent: parentId });
    setError("");
    setModalOpen(true);
    if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
  }

  function openEdit(c) {
    setEditingId(c._id);
    setForm({
      name: c.name,
      description: c.description || "",
      icon: c.icon || "leaf",
      image: c.image?.url ? [c.image] : [],
      isActive: c.isActive,
      sortOrder: c.sortOrder || 0,
      parent: c.parent || "",
    });
    setError("");
    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        description: form.description,
        icon: form.icon,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder),
        parent: form.parent || null,
        image: form.image[0] ? { url: form.image[0].url, publicId: form.image[0].publicId } : { url: "", publicId: "" },
      };

      const res = await fetch(editingId ? `/api/categories/${editingId}` : "/api/categories", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save category.");
      setModalOpen(false);
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this category?")) return;
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }
    loadData();
  }

  function toggleExpand(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  function CategoryNode({ c, depth }) {
    const Icon = CATEGORY_ICONS[c.icon] || LeafIcon;
    const kids = childrenOf(c._id);
    const isOpen = expanded[c._id] ?? depth === 0; // top level starts open

    return (
      <div>
        <div
          className="rounded-3xl border border-gold/10 bg-white p-4 md:p-5 shadow-card hover:shadow-lg transition"
          style={{ marginLeft: depth > 0 ? `${Math.min(depth, 6) * 28}px` : 0 }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Left Side */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {kids.length > 0 ? (
                <button
                  onClick={() => toggleExpand(c._id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-400 transition"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                </button>
              ) : (
                depth > 0 && <span className="w-6 shrink-0 text-center text-gray-300">↳</span>
              )}

              {c.image?.url ? (
                <img
                  src={c.image.url}
                  alt={c.name}
                  className={`rounded-full object-cover border border-gray-200 shrink-0 ${depth > 0 ? "h-12 w-12" : "h-16 w-16"}`}
                />
              ) : (
                <div className={`flex items-center justify-center rounded-full bg-champagne shrink-0 ${depth > 0 ? "h-12 w-12" : "h-16 w-16"}`}>
                  <Icon className="h-6 w-6 text-forest" />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={`font-display font-bold text-ink truncate ${depth > 0 ? "text-base" : "text-lg md:text-xl"}`}>
                    {c.name}
                  </h2>
                  {depth > 0 && (
                    <span className="rounded-full bg-champagne px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest">
                      Level {depth + 1}
                    </span>
                  )}
                  {!c.isActive && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Inactive
                    </span>
                  )}
                  {kids.length > 0 && (
                    <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                      {kids.length} sub{kids.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                <p className="text-sm text-muted">
                  /{c.name.toLowerCase().replace(/\s+/g, "-")}
                </p>

                {c.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>
                )}
              </div>
            </div>

            {/* Right Side */}
            <div className="flex items-center justify-end gap-5 shrink-0">
              <button
                title="Add Subcategory"
                onClick={() => openAdd(c._id)}
                className="text-sm font-semibold text-forest hover:underline"
              >
                + Sub
              </button>

              <button title="Edit" onClick={() => openEdit(c)} className="text-forest hover:scale-110 transition">
                ✏️
              </button>

              <button title="Delete" onClick={() => handleDelete(c._id)} className="text-red-600 hover:scale-110 transition">
                🗑️
              </button>
            </div>
          </div>
        </div>

        {kids.length > 0 && isOpen && (
          <div className="mt-3 space-y-3">
            {kids.map((child) => (
              <CategoryNode key={child._id} c={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const topLevel = childrenOf(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">Categories</h1>
          <p className="mt-1 text-sm text-muted">{categories.length} categories</p>
        </div>
        <button onClick={() => openAdd()} className="rounded-full bg-forest px-6 py-2 text-sm font-semibold text-ivory shadow-soft hover:bg-forest-light">
          + Add Category
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : categories.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-card">
            <p className="text-muted">No categories yet.</p>
          </div>
        ) : (
          topLevel.map((c) => <CategoryNode key={c._id} c={c} depth={0} />)
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Category" : "Add Category"}>
        <form onSubmit={handleSave} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Category Name *</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Parent Category</span>
            <select
              value={form.parent}
              onChange={(e) => setForm({ ...form, parent: e.target.value })}
              className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
            >
              <option value="">— None (Top-level category) —</option>
              {eligibleParents.map((c) => (
                <option key={c._id} value={c._id}>
                  {"— ".repeat(depthOf(c, categories))}{c.name}
                </option>
              ))}
            </select>
            {editingId && hasChildren(editingId) && (
              <span className="mt-1 block text-xs text-muted">
                Note: this category has its own subcategories, which will move along with it if you change its parent.
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Description</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </label>

          <div>
            <span className="mb-2 block text-xs font-semibold text-ink/70">Category Image</span>
            <ImageUploader
              images={form.image}
              onChange={(imgs) => setForm({ ...form, image: imgs })}
              folder="kmc-categories"
              multiple={false}
            />
          </div>

          <div>
            <span className="mb-2 block text-xs font-semibold text-ink/70">Icon (fallback if no image)</span>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((key) => {
                const Icon = CATEGORY_ICONS[key];
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setForm({ ...form, icon: key })}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                      form.icon === key ? "border-forest bg-forest text-ivory" : "border-gold/30 text-forest"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink/70">Sort Order</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              className="w-full rounded-xl border border-gold/30 px-4 py-2.5 text-sm outline-none focus:border-forest"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active (visible in store)
          </label>

          {error && <p className="text-sm text-terracotta">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-forest px-8 py-3 text-sm font-semibold text-ivory shadow-soft hover:bg-forest-light disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Save Changes" : "Add Category"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

// Computes how deep `c` sits in the tree, for indenting the dropdown options.
function depthOf(c, categories) {
  let depth = 0;
  let current = c;
  const byId = Object.fromEntries(categories.map((x) => [x._id, x]));
  while (current?.parent) {
    depth++;
    current = byId[current.parent];
    if (depth > 20) break; // safety guard against bad data
  }
  return depth;
}