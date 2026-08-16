import Image from "next/image";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import "@/models/Category";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProductDetailActions from "@/components/ProductDetailActions";
import { LeafIcon } from "@/components/Icons";
import ProductGallery from "@/components/ProductGallery";
import ProductAccordion from "@/components/ProductAccordion";
import RelatedProducts from "@/components/RelatedProducts";
import BackButton from "@/components/BackButton";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function getProduct(slug) {
  await connectDB();
  const product = await Product.findOne({ slug, isActive: true }).populate("category", "name slug").lean();
  return product ? JSON.parse(JSON.stringify(product)) : null;
}

async function getRelatedProducts(product) {
  await connectDB();
  const related = await Product.find({
    category: product.category?._id,
    _id: { $ne: product._id },
    isActive: true,
  })
    .populate("category", "name slug")
    .limit(8)
    .lean();
  return JSON.parse(JSON.stringify(related));
}

export default async function ProductDetailPage({ params }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const related = await getRelatedProducts(product);
  const settings = await getSettings();
  const media = product.media || [];

  const accordionItems = [
    {
      title: "Description",
      content:
        product.description ||
        product.shortDescription ||
        "A premium handcrafted product from KMC Iyarkai Creation, made with natural, eco-friendly materials.",
    },
    {
      title: "Product Details",
      content: (
        <div className="flex flex-wrap gap-2">
          {product.attributes?.handmade && <Tag label="Handmade with Care" />}
          {product.attributes?.natural && <Tag label="100% Natural" />}
          {product.attributes?.ecoFriendly && <Tag label="Eco-Friendly" />}
        </div>
      ),
    },
    {
      title: "Availability",
      content: product.stock > 0 ? `${product.stock} in stock` : "Currently unavailable",
    },
  ];

  return (
    <>
      <Navbar settings={settings} />
      <section className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <BackButton fallbackHref="/products" />

        {/* Image + core info side by side */}
        <div className="grid gap-12 md:grid-cols-2">
          {media.length > 0 ? (
            <ProductGallery media={media} productName={product.name} />
          ) : (
            <div className="aspect-square overflow-hidden rounded-xl2 bg-champagne shadow-card flex items-center justify-center text-forest/30">
              <LeafIcon className="h-16 w-16" />
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-dark">
              {product.category?.name}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-forest md:text-4xl">{product.name}</h1>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="font-display text-3xl font-bold text-forest">₹{product.price}</span>
              {product.compareAtPrice > product.price && (
                <span className="text-base text-muted line-through">₹{product.compareAtPrice}</span>
              )}
              <span className="text-sm text-muted">/ {product.unit}</span>
            </div>

            <ProductDetailActions product={product} />
          </div>
        </div>

        {/* Full-width description / details / availability */}
        <ProductAccordion items={accordionItems} />
      </section>

     <RelatedProducts products={related} categoryId={product.category?._id} />

      <Footer />
    </>
  );
}

function Tag({ label }) {
  return (
    <span className="rounded-full border border-gold/30 bg-champagne px-3 py-1 text-xs font-medium text-forest">
      {label}
    </span>
  );
}