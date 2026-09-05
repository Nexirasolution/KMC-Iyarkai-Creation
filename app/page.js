import Link from "next/link";
import Image from "next/image";
import { connectDB } from "@/lib/mongodb";
import Category from "@/models/Category";
import Product from "@/models/Product";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { CATEGORY_ICONS, LeafIcon } from "@/components/Icons";
import HeroSlider from "@/components/HeroSlider";
import { ArrowRight } from "lucide-react";
import { getSettings } from "@/lib/settings";
export const dynamic = "force-dynamic";

async function getData() {
  await connectDB();
  // Only top-level categories on the homepage — subcategories are reached
  // by clicking into a parent on the /products page, not shown here.
  const categories = await Category.find({ isActive: true, parent: null }).sort({ sortOrder: 1 }).lean();
  const bestSelling = await Product.find({ isActive: true, isFeatured: true })
    .populate("category", "name slug")
    .sort({ createdAt: -1 })
    .lean();
  return {
    categories: JSON.parse(JSON.stringify(categories)),
    bestSelling: JSON.parse(JSON.stringify(bestSelling)),
  };
}

const WHY_CHOOSE = [
  { title: "100% Handmade", desc: "Crafted by skilled artisans" },
  { title: "Eco-Friendly", desc: "Natural & sustainable materials" },
  { title: "Premium Quality", desc: "Carefully crafted with perfection" },
  { title: "Pan India Delivery", desc: "Safe & timely, everywhere" },
];
const CATEGORY_IMAGES = {
  "Handmade Wire Bags": "/categroy/wire-bags.png",
  "Organic Fertilizers & Soil Enhancers": "/categroy/organic-fertilizers.png",
  "Clay Products": "/categroy/clay-products.png",
  "Wooden Products": "/categroy/wooden-products.png",
  "Handmade Wooden Toys & Miniatures": "/categroy/wooden-toys.png",
  "Herbal Products": "/categroy/herbal-products.png",
};
export default async function HomePage() {
  const { categories, bestSelling } = await getData();
  const settings = await getSettings();

  return (
    <>
      <Navbar settings={settings} />

      <HeroSlider />

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
        <div className="mb-8 text-center">
          <h2 className="mt-2 font-display text-3xl font-bold text-forest md:text-4xl">
            Shop by Category
          </h2>
        </div>

        {categories.length === 0 ? (
          <p className="text-center text-muted">
            Categories will appear here once added from the admin panel.
          </p>
        ) : (
          <div className="grid grid-cols-3 justify-items-center gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 md:gap-x-6">
            {categories.map((cat) => (
              <Link
                key={cat._id}
                href={`/products?category=${cat._id}`}
                className="group flex flex-col items-center"
              >
                <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-lg md:h-28 md:w-28">
                  <Image
                    src={cat.image?.url || CATEGORY_IMAGES[cat.name] || "/categroy/default.png"}
                    alt={cat.name}
                    fill
                    sizes="(max-width:768px) 80px, 112px"
                    className="object-cover"
                  />
                </div>

                <h3 className="mt-2 w-20 text-center text-xs font-medium text-gray-800 transition group-hover:text-green-700 md:w-28 md:text-sm">
                  {cat.name}
                </h3>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Best Selling products */}
      {bestSelling.length > 0 && (
        <section className="bg-champagne/50 py-16">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-dark">
                  Customer Favorites
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold text-forest md:text-4xl">
                  Best Selling Products
                </h2>
              </div>
              <Link href="/products" className="hidden text-sm font-semibold text-forest hover:underline md:block">
                View all &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
              {bestSelling.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>

            {/* Shop Now CTA */}
            <div className="mt-10 flex justify-center">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-full bg-forest px-8 py-3 text-sm font-semibold text-white transition hover:bg-forest/90"
              >
                Shop Now
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Why choose us */}
      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-forest md:text-4xl">Why Choose Us?</h2>
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {WHY_CHOOSE.map((item) => (
            <div key={item.title} className="text-center">
              <span className="badge-stamp mx-auto flex h-16 w-16 items-center justify-center border-gold/40 bg-forest text-ivory">
                <LeafIcon className="h-7 w-7" />
              </span>
              <p className="mt-4 font-display text-sm font-bold text-ink">{item.title}</p>
              <p className="mt-1 text-xs text-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}