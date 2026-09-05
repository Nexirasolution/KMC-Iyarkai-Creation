import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CATEGORY_ICONS, LeafIcon } from "@/components/Icons";
import { getSettings } from "@/lib/settings";
import { connectDB } from "@/lib/mongodb";
import Category from "@/models/Category";

export const metadata = { title: "Categories | KMC Iyarkai Creation" };

async function getCategoryTree() {
  await connectDB();
  const categories = await Category.find({ isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  const byParent = {};
  for (const c of categories) {
    const key = c.parent ? String(c.parent) : "root";
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(c);
  }

  const topLevel = byParent["root"] || [];
  return topLevel.map((cat) => ({
    ...cat,
    _id: String(cat._id),
    children: (byParent[String(cat._id)] || []).map((child) => ({
      ...child,
      _id: String(child._id),
    })),
  }));
}

export default async function CategoriesPage() {
  const settings = await getSettings();
  const categories = await getCategoryTree();

  return (
    <>
      <Navbar settings={settings} />
      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-dark">
            Explore
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-forest md:text-4xl">
            All Categories
          </h1>
        </div>

        {categories.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-display text-lg text-forest">No categories yet</p>
            <p className="mt-1 text-sm text-muted">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.icon] || LeafIcon;
              return (
                <div
                  key={cat._id}
                  className="rounded-3xl border border-gold/10 bg-white p-6 shadow-card transition hover:shadow-lg"
                >
                  <Link
                    href={`/products?category=${cat._id}`}
                    className="flex items-center gap-4"
                  >
                    {cat.image?.url ? (
                      <img
                        src={cat.image.url}
                        alt={cat.name}
                        className="h-16 w-16 shrink-0 rounded-full border border-gray-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-champagne">
                        <Icon className="h-7 w-7 text-forest" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-bold text-ink truncate">
                        {cat.name}
                      </h2>
                      {cat.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted">
                          {cat.description}
                        </p>
                      )}
                    </div>
                  </Link>

                  {cat.children.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-gold/10 pt-4">
                      {cat.children.map((sub) => (
                        <Link
                          key={sub._id}
                          href={`/products?category=${sub._id}`}
                          className="rounded-full border border-gold/20 px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-champagne"
                        >
                          {sub.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}