"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
type JobStatus = Doc<"jobs">["status"];

// Job hunting is mostly waiting and noes, so every step forward gets a moment: a burst of confetti in the
// brand colours and a line that says it out loud.

/** What each step forward means, said plainly. */
export const WIN_WORDS: Partial<Record<JobStatus, string>> = {
  applied: "Sent. Every application is a shot on goal.",
  screening: "Someone wrote back. A real door just opened.",
  interview: "An interview! You earned this one.",
  offer: "An offer! Huge. Take a moment with this one.",
};

const EVENT = "jobpipe:celebrate";

/** Throw confetti and show a line, from anywhere in the app. */
export function celebrate(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
}

/** setStatus that celebrates when a job moves forward. */
export function useSetStatus() {
  const setStatus = useMutation(api.jobs.setStatus);
  return async (args: { jobId: Id<"jobs">; status: JobStatus }) => {
    await setStatus(args);
    const words = WIN_WORDS[args.status];
    if (words) celebrate(words);
  };
}

const COLOURS = ["#c6ff3d", "#a78bfa", "#5eead4", "#ff8fd0", "#f4f4f5"];

/** The confetti and the message. Mounted once, in the app frame. */
export function Celebrations() {
  const [message, setMessage] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame = 0;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const onCelebrate = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      clearTimeout(hide);
      hide = setTimeout(() => setMessage(null), 4500);
      const c = canvas.current;
      // People who turned motion off still get the message, without the confetti.
      if (!c || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      c.width = innerWidth;
      c.height = innerHeight;
      const bits = Array.from({ length: 140 }, () => ({
        x: innerWidth / 2 + (Math.random() - 0.5) * 200,
        y: innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 14 - 4,
        size: 5 + Math.random() * 6,
        spin: Math.random() * Math.PI,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      }));
      cancelAnimationFrame(frame);
      const start = performance.now();
      const draw = (now: number) => {
        ctx.clearRect(0, 0, c.width, c.height);
        for (const b of bits) {
          b.vy += 0.35;
          b.vx *= 0.99;
          b.x += b.vx;
          b.y += b.vy;
          b.spin += 0.15;
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.spin);
          ctx.fillStyle = b.colour;
          ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
          ctx.restore();
        }
        if (now - start < 3000) frame = requestAnimationFrame(draw);
        else ctx.clearRect(0, 0, c.width, c.height);
      };
      frame = requestAnimationFrame(draw);
    };
    addEventListener(EVENT, onCelebrate);
    return () => {
      removeEventListener(EVENT, onCelebrate);
      cancelAnimationFrame(frame);
      clearTimeout(hide);
    };
  }, []);

  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-50" aria-hidden />
      {message && (
        <div role="status" className="rise fixed inset-x-0 top-6 z-50 mx-auto w-fit max-w-[90vw] rounded-full border border-accent/40 bg-card px-5 py-3 text-sm font-medium shadow-lg">
          <span className="mr-2">🎉</span>
          {message}
        </div>
      )}
    </>
  );
}

/**
 * Wins that happened without a click, like Gmail moving a job to Interviewing overnight: celebrated once each,
 * the next time Today opens. Remembered per browser; a missed celebration is no loss.
 */
export function useCelebrateNewWins(wins: { key: string; message: string }[]) {
  const keys = wins.map((w) => w.key).join("|");
  useEffect(() => {
    if (!wins.length) return;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem("jobpipe:celebrated") ?? "[]");
    } catch {}
    const fresh = wins.filter((w) => !seen.includes(w.key));
    if (!fresh.length) return;
    celebrate(fresh.length === 1 ? fresh[0].message : `${fresh.length} wins since you last looked. Keep going.`);
    try {
      localStorage.setItem("jobpipe:celebrated", JSON.stringify([...seen, ...fresh.map((w) => w.key)].slice(-200)));
    } catch {}
    // Only a new set of wins should fire this again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
}
