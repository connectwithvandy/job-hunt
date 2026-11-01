"use client";

import { useEffect, useRef, useState } from "react";

// Small pieces of motion for the landing page. All of them settle into a still page for people who turn
// motion off, and the text is in the page from the start, so search engines read it all.

/** True once the element has scrolled into view. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/** Fades and lifts its children in as they scroll into view. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    // @ts-expect-error one ref type for the few tags this takes
    <Tag ref={ref} className={`reveal ${seen ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** A number that counts up from zero the first time it's seen. */
export function CountUp({ to, ms = 1100 }: { to: number; ms?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [n, setN] = useState(to);
  useEffect(() => {
    if (!seen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setN(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, to, ms]);
  return <span ref={ref}>{n}</span>;
}

/** Cycles through words in place, one every couple of seconds. */
export function Rotate({ words, every = 2200 }: { words: string[]; every?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % words.length), every);
    return () => clearInterval(id);
  }, [words.length, every]);
  return (
    <span key={i} className="swap inline-block text-accent">
      {words[i]}
    </span>
  );
}
