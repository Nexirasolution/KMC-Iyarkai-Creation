"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LeafIcon } from "./Icons";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "▤" },
  { href: "/admin/products", label: "Products", icon: "🛍" },
  { href: "/admin/categories", label: "Categories", icon: "☰" },
  { href: "/admin/banners", label: "Banners", icon: "🖼" },
  { href: "/admin/orders", label: "Orders", icon: "🧾" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: "💬" },
  { href: "/admin/inventory", label: "Inventory", icon: "📦" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

export default function AdminSidebar({ open, setOpen }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.push("/admin/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 z-50
          h-screen w-64
          bg-forest text-ivory
          border-r border-gold/15
          flex flex-col
          transform transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        {/* Mobile Close Button */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 lg:hidden">
          <h2 className="font-bold text-lg">Menu</h2>

          <button
            onClick={() => setOpen(false)}
            className="text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6">
          <span className="badge-stamp h-10 w-10 border-gold/40 bg-ivory/10">
            <LeafIcon className="h-5 w-5" />
          </span>

          <div>
            <p className="font-display text-lg font-bold">
              KMC Admin
            </p>

            <p className="text-[10px] uppercase tracking-widest text-ivory/60">
              Organic Farm
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 px-3">
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition
                  ${
                    active
                      ? "bg-gold text-forest-dark"
                      : "text-ivory/80 hover:bg-white/10"
                  }`}
              >
                <span className="w-5 text-center">
                  {item.icon}
                </span>

                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-white/10 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-ivory/80 transition hover:bg-white/10"
          >
            <span>⏻</span>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}