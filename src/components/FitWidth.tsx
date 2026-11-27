"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Shrinks an A4 page (210mm ≈ 794px) to fit a narrow screen instead of cutting it off on the right
 * (28 Nov review: "Bengalur", "linkedin.c" on a phone). Printing and PDF use the real size (.fit-width in globals.css).
 */
export function FitWidth({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / 794));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="w-full max-w-[210mm] overflow-hidden pb-4">
      <div className="fit-width" style={{ zoom }}>
        {children}
      </div>
    </div>
  );
}
