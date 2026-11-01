"use client";

import { useSyncExternalStore } from "react";

// Dark is the default look; light is one click away and remembered in this browser. The layout sets the
// saved choice before the page paints, so there's no flash of the wrong colours.

const KEY = "jobpipe:theme";
const listeners = new Set<() => void>();
const current = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The sun/moon switch. `labelled` adds the words, for the app menu where an icon alone isn't clear. */
export function ThemeToggle({ className = "", labelled = false }: { className?: string; labelled?: boolean }) {
  const theme = useSyncExternalStore(subscribe, current, () => "dark");
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={
        labelled
          ? `flex items-center gap-2 text-left text-sm text-ink-2 hover:text-ink ${className}`
          : `grid h-8 w-8 place-items-center rounded-full border border-line text-ink-2 transition hover:border-accent hover:text-ink ${className}`
      }
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(KEY, next);
        } catch {}
        listeners.forEach((fn) => fn());
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        {theme === "dark" ? (
          <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        )}
      </svg>
      {labelled && (next === "light" ? "Light mode" : "Dark mode")}
    </button>
  );
}

/** Runs before the page paints: applies the saved choice. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
