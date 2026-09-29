"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

const AUTO_SCROLL_MS = 8000;
const SWIPE_THRESHOLD = 50; // px

export default function ProductGallery({ media, productName }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(null);
  const thumbRefs = useRef([]);

  const active = media[activeIndex];
  const isVideo = (active?.type || active?.mediaType) === "video";
  const hasMultiple = media.length > 1;

  const goTo = useCallback(
    (index) => {
      const next = ((index % media.length) + media.length) % media.length;
      setActiveIndex(next);
    },
    [media.length]
  );

  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  // Auto-advance
  useEffect(() => {
    if (!hasMultiple || isPaused || isVideo) return;
    const timer = setInterval(goNext, AUTO_SCROLL_MS);
    return () => clearInterval(timer);
  }, [hasMultiple, isPaused, isVideo, goNext]);

  // Keep active thumbnail in view
  useEffect(() => {
    thumbRefs.current[activeIndex]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeIndex]);

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    setIsPaused(true);
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (deltaX > SWIPE_THRESHOLD) goPrev();
    else if (deltaX < -SWIPE_THRESHOLD) goNext();
    touchStartX.current = null;
    setIsPaused(false);
  }

  return (
    <div>
      <div
        className="group relative aspect-square touch-pan-y select-none overflow-hidden rounded-xl2 bg-champagne shadow-card"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isVideo ? (
          <video
            key={active.url}
            src={active.url}
            className="h-full w-full object-cover"
            controls
            autoPlay
            muted
            loop
          />
        ) : (
          <Image
            key={active.url}
            src={active.url}
            alt={productName}
            width={800}
            height={800}
            className="h-full w-full object-cover"
            priority
          />
        )}

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-forest opacity-0 shadow-md backdrop-blur transition hover:bg-white group-hover:opacity-100 md:opacity-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next image"
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-forest opacity-0 shadow-md backdrop-blur transition hover:bg-white group-hover:opacity-100 md:opacity-0"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Dots (visible on mobile where hover arrows don't apply) */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 md:hidden">
              {media.map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 w-1.5 rounded-full transition ${
                    index === activeIndex ? "bg-forest" : "bg-white/70"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="mt-4 flex flex-wrap gap-3">
          {media.map((item, index) => {
            const itemIsVideo = (item.type || item.mediaType) === "video";
            return (
              <button
                key={item.publicId || index}
                ref={(el) => (thumbRefs.current[index] = el)}
                onClick={() => goTo(index)}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  index === activeIndex ? "border-forest" : "border-transparent"
                }`}
              >
                {itemIsVideo ? (
                  <video src={item.url} className="h-full w-full object-cover" muted />
                ) : (
                  <Image src={item.url} alt={`${productName} ${index + 1}`} fill className="object-cover" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}