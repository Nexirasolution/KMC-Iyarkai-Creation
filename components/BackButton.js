"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function BackButton({ fallbackHref = "/products" }) {
  const router = useRouter();

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      onClick={handleBack}
      className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink/70 transition hover:text-forest"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}