"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { LeafIcon, BagIcon } from "@/components/Icons";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function CartPage() {
  const { items, updateQuantity, removeItem, subtotal, hydrated } = useCart();

  if (!hydrated) return null;

  return (
    <>
      <Navbar />

      <section className="mx-auto max-w-5xl px-5 py-12 md:px-8">
        <h1 className="font-display text-3xl font-bold text-forest">Your Cart</h1>

        {items.length === 0 ? (
          <div className="mt-16 flex flex-col items-center py-10 text-center">
            <span className="badge-stamp flex h-16 w-16 items-center justify-center border-gold/40 bg-champagne text-forest">
              <BagIcon className="h-7 w-7" />
            </span>
            <p className="mt-4 font-display text-lg text-forest">Your cart is empty</p>
            <Link
              href="/products"
              className="mt-6 rounded-full bg-forest px-8 py-3 text-sm font-semibold text-ivory shadow-soft transition hover:bg-forest-light"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-10 md:grid-cols-3">
            <div className="space-y-4 md:col-span-2">
              {items.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center gap-4 rounded-xl2 border border-gold/15 bg-white p-4 shadow-card"
                >
                  <Link
                    href={`/products/${item.slug || item.productId}`}
                    className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-champagne"
                  >
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        width={80}
                        height={80}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-forest/30">
                        <LeafIcon className="h-6 w-6" />
                      </div>
                    )}
                  </Link>
                  <div className="flex-1">
                    <Link href={`/products/${item.slug || item.productId}`}>
                      <p className="font-display text-sm font-semibold text-ink hover:text-forest hover:underline">
                        {item.name}
                      </p>
                    </Link>
                    <p className="text-xs text-muted">₹{item.price} / {item.unit}</p>
                    <div className="mt-2 flex items-center rounded-full border border-gold/30 w-fit">
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        className="px-3 py-1 text-forest"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-xs font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        className="px-3 py-1 text-forest"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-sm font-bold text-forest">₹{item.price * item.quantity}</p>
                    <button
                      onClick={() => removeItem(item.productId)}
                      className="mt-2 text-xs text-terracotta hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="h-fit rounded-xl2 border border-gold/15 bg-white p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-forest">Order Summary</h2>
              <div className="mt-4 flex justify-between text-sm text-ink/80">
                <span>Subtotal</span>
                <span>₹{subtotal}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-ink/80">
                <span>Shipping</span>
                <span className="text-forest">Calculated at checkout</span>
              </div>
              <div className="leaf-divider my-4" />
              <div className="flex justify-between font-display text-base font-bold text-forest">
                <span>Total</span>
                <span>₹{subtotal}</span>
              </div>
              <Link
                href="/checkout"
                className="mt-6 block rounded-full bg-forest px-8 py-3.5 text-center text-sm font-semibold text-ivory shadow-soft transition hover:bg-forest-light"
              >
                Proceed to Checkout
              </Link>
            </div>
          </div>
        )}
      </section>

      <Footer />
    </>
  );
}