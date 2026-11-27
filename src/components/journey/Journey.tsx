"use client";
import { useEffect, useRef } from "react";
import "./journey.css";
import { JOURNEY_HTML } from "./markup";
import { runJourney } from "./run";

/**
 * The signed-out homepage's moving story: one job goes from posting to fit, CV, applied, reply and offer, then lands on
 * a pipeline board (owner asked for "rich motion", 27-28 Nov). "Start free" buttons open the sign-up form below.
 */
export function Journey({ onStart }: { onStart: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stop = runJourney();
    const el = box.current;
    const click = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-start]")) {
        e.preventDefault();
        onStart();
      }
    };
    el?.addEventListener("click", click);
    return () => {
      stop();
      el?.removeEventListener("click", click);
    };
    // Runs once: the story keeps its own state while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={box} className="jp-journey" dangerouslySetInnerHTML={{ __html: JOURNEY_HTML }} />;
}
