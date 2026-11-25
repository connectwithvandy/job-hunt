"use client";
import { useEffect } from "react";

/** Notes where a visitor came from, so a sign-up later can be traced to it. The first source wins. */
export function RememberSource({ source }: { source: string }) {
  useEffect(() => {
    try {
      if (!localStorage.getItem("jobpipeSource")) localStorage.setItem("jobpipeSource", source);
    } catch {}
  }, [source]);
  return null;
}
