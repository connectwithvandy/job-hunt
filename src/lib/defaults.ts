import type { Track } from "./types";

// Starter tracks for a sales and GTM job search. Edit them on the Tracks page.
export const DEFAULT_TRACKS: Track[] = [
  {
    id: "sdr-leadership",
    name: "Sales Development Leadership",
    color: "#C6FF3D",
    status: "active",
    titles: ["Sales Development Manager", "Senior Manager Sales Development", "Head of Sales Development", "BDR Manager"],
    pitch: "Builds and scales SDR teams across regions that beat pipeline targets.",
  },
  {
    id: "ai-gtm",
    name: "AI GTM",
    color: "#38BDF8",
    status: "active",
    titles: ["GTM Engineer", "AI GTM", "Growth Engineer Sales", "GTM Automation"],
    pitch: "A sales leader who builds the AI workflows that make reps faster.",
  },
  {
    id: "gtm-strategy",
    name: "GTM Strategy",
    color: "#F472B6",
    status: "active",
    titles: ["GTM Strategy", "Revenue Operations", "Founder's Office GTM", "Founder's Office", "Business Operations"],
    pitch: "Fixes funnels with data: conversion, territory and handoff design.",
  },
  {
    id: "account-executive",
    name: "Account Executive",
    color: "#FB923C",
    status: "active",
    titles: ["Account Executive", "Senior Account Executive", "Enterprise Account Executive"],
    pitch: "Knows the full cycle from first call to close, and how pipeline is really built.",
  },
];

export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  applying: "Getting ready",
  applied: "Applied",
  screening: "Screening",
  interview: "Interviewing",
  offer: "Offer",
  rejected: "Closed",
  dismissed: "Not for me",
};

export const PIPELINE: { status: string; label: string }[] = [
  { status: "applying", label: "Getting ready" },
  { status: "applied", label: "Applied" },
  { status: "screening", label: "Screening" },
  { status: "interview", label: "Interviewing" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Closed" },
];
