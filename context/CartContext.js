"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "kmc_cart_v1";

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const showToast = useCallback((message) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  }, []);

  function addItem(product, quantity = 1) {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product._id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product._id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [
        ...prev,
        {
          productId: product._id,
          slug: product.slug,
          name: product.name,
          price: product.price,
          unit: product.unit,
          image: product.media?.[0]?.url || product.images?.[0]?.url || "",
          stock: product.stock,
          quantity,
        },
      ];
    });
    showToast(`${product.name} added to cart`);
  }

  function updateQuantity(productId, quantity) {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)));
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function clearCart() {
    setItems([]);
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, updateQuantity, removeItem, clearCart, subtotal, count, hydrated }}
    >
      {children}

      {/* Toast notifications */}
      <div className="kmc-toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="kmc-toast">
            <span aria-hidden="true">✓</span>
            <span className="kmc-toast-text">{t.message}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .kmc-toast-container {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          bottom: calc(84px + env(safe-area-inset-bottom, 0px));
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 0 16px;
          pointer-events: none;
        }

        @media (min-width: 768px) {
          .kmc-toast-container {
            bottom: calc(24px + env(safe-area-inset-bottom, 0px));
          }
        }

        .kmc-toast {
          pointer-events: auto;
          display: flex;
          align-items: center;
          gap: 8px;
          max-width: 100%;
          border-radius: 9999px;
          background-color: #1f4d3a;
          color: #fdfaf3;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 500;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
          animation: kmc-toast-in 0.25s ease-out;
          white-space: nowrap;
        }

        .kmc-toast-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (min-width: 768px) {
          .kmc-toast {
            padding: 12px 20px;
            font-size: 14px;
          }
        }

        @keyframes kmc-toast-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}