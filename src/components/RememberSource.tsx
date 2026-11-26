"use client";
import { useEffect } from "react";

/** Notes where a visitor came from, so a sign-up later can be traced to it. The first source wins. A link's own
 * ?utm_source= (e.g. a job shared in a WhatsApp group) beats the page's default, so each group can be told apart. */
export function RememberSource({ source }: { source: string }) {
  useEffect(() => {
    try {
      const tagged = new URLSearchParams(window.location.search).get("utm_source")?.slice(0, 40);
      if (!localStorage.getItem("jobpipeSource")) localStorage.setItem("jobpipeSource", tagged || source);
    } catch {}
  }, [source]);
  return null;
}
