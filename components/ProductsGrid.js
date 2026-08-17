"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import ProductCard from "./ProductCard";
import { CATEGORY_ICONS, LeafIcon } from "./Icons";

const SORT_OPTIONS = [
  { value: "", label: "Sort: Featured" },
  { value: "newest", label: "Newest First" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A to Z" },
];

const PAGE_SIZE = 12;

export default function ProductsGrid({ initialCategory, initialSearch }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Category AND page now come straight from the URL, so back/forward always
  // reflects both correctly.
  const activeCategory = searchParams.get("category") || "";
  const page = Number(searchParams.get("page")) || 1;

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch || "");
  const [sortBy, setSortBy] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    fetch("/api/categories?activeOnly=true")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []));
  }, []);

  // Any FILTER change should jump back to page 1. Note `page` is deliberately
  // NOT in this dependency list — otherwise paging back/forward would
  // re-trigger this effect and force you back to page 1 every time.
  useEffect(() => {
    if (page !== 1) {
      setPageInUrl(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, search, sortBy, minPrice, maxPrice]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      activeOnly: "true",
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (activeCategory) params.set("category", activeCategory);
    if (search) params.set("search", search);
    if (sortBy) params.set("sort", sortBy);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);

    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.products || []);
        setPagination(d.pagination || null);
      })
      .finally(() => setLoading(false));
  }, [activeCategory, search, sortBy, minPrice, maxPrice, page]);

  function setCategoryInUrl(categoryId) {
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId) {
      params.set("category", categoryId);
    } else {
      params.delete("category");
    }
    params.delete("page"); // switching category always restarts at page 1
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setPageInUrl(p) {
    const params = new URLSearchParams(searchParams.toString());
    if (p > 1) {
      params.set("page", String(p));
    } else {
      params.delete("page");
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearFilters() {
    setCategoryInUrl("");
    setSearch("");
    setSortBy("");
    setMinPrice("");
    setMaxPrice("");
  }

  function goToPage(p) {
    if (p < 1 || (pagination && p > pagination.totalPages)) return;
    setPageInUrl(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const hasActiveFilters = activeCategory || search || sortBy || minPrice || maxPrice;
  const totalPages = pagination?.totalPages || 1;

  // Compact page-number list: first, last, current ±1, with ellipses
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

  return (
    <div>
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryInUrl("")}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              activeCategory === ""
                ? "border-forest bg-forest text-ivory"
                : "border-gold/30 text-ink/70 hover:bg-champagne"
            }`}
          >
            All
          </button>
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.icon] || LeafIcon;
            return (
              <button
                key={cat._id}
                onClick={() => setCategoryInUrl(cat._id)}
                className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  activeCategory === cat._id
                    ? "border-forest bg-forest text-ivory"
                    : "border-gold/30 text-ink/70 hover:bg-champagne"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {cat.name}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-full border border-gold/30 bg-white px-5 py-2.5 text-sm outline-none focus:border-forest md:w-64"
        />
      </div>

      {/* Sort + price filter row */}
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex w-fit items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-xs font-semibold text-ink/70 hover:bg-champagne md:hidden"
        >
          Filters {showFilters ? "▲" : "▼"}
        </button>

        <div
          className={`${
            showFilters ? "flex" : "hidden"
          } flex-col gap-3 sm:flex-row sm:items-center md:flex`}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink/60">₹</span>
            <input
              type="number"
              min="0"
              placeholder="Min"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-24 rounded-full border border-gold/30 bg-white px-3 py-2 text-sm outline-none focus:border-forest"
            />
            <span className="text-xs text-ink/40">to</span>
            <input
              type="number"
              min="0"
              placeholder="Max"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-24 rounded-full border border-gold/30 bg-white px-3 py-2 text-sm outline-none focus:border-forest"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs font-semibold text-terracotta hover:underline"
            >
              Clear filters
            </button>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-full border border-gold/30 bg-white px-4 py-2.5 text-sm outline-none focus:border-forest"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-xl2 bg-champagne/60" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-display text-lg text-forest">No products found</p>
          <p className="mt-1 text-sm text-muted">Try a different category or search term.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-10 flex flex-col items-center gap-3">
              <p className="text-xs text-muted">
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}{" "}
                products
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
        </>
      )}
    </div>
  );
}