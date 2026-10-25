"use client";

import { useEffect, useState } from "react";

// Shows foreign pay in Indian rupees, in lakhs a year, so offers compare at a glance.

// Longer symbols first, so "S$120,000" reads as Singapore dollars, not US.
const SYMBOLS: Record<string, string> = { US$: "USD", CA$: "CAD", NZ$: "NZD", S$: "SGD", A$: "AUD", C$: "CAD", $: "USD", "£": "GBP", "€": "EUR", "₹": "INR" };
const CODES = ["USD", "GBP", "EUR", "INR", "SGD", "AED", "CAD", "AUD", "CHF", "JPY", "NZD", "SEK", "DKK", "PLN"];

/** Rough rupees per unit, used until (or if) live rates load. */
const FALLBACK: Record<string, number> = { USD: 88, GBP: 117, EUR: 102, INR: 1, SGD: 68, AED: 24, CAD: 63, AUD: 58, CHF: 110, JPY: 0.58, NZD: 52, SEK: 9.3, DKK: 13.7, PLN: 24 };

let cached: Record<string, number> | null = null;

/** Live rupee rates from frankfurter.app (free, no key), loaded once per visit. */
export function useInrRates() {
  const [rates, setRates] = useState(cached ?? FALLBACK);
  useEffect(() => {
    if (cached) return;
    fetch("https://api.frankfurter.app/latest?from=INR")
      .then((r) => r.json())
      .then((d: { rates: Record<string, number> }) => {
        cached = { ...FALLBACK, ...Object.fromEntries(Object.entries(d.rates).map(([k, perInr]) => [k, 1 / perInr])), INR: 1 };
        setRates(cached);
      })
      .catch(() => {});
  }, []);
  return rates;
}

/** "USD 105,100 – 112,500/year" becomes "≈ ₹92–99 L/yr". Null when it isn't foreign pay we can read. */
export function inInr(salary: string | null | undefined, rates: Record<string, number>) {
  if (!salary) return null;
  const code = CODES.find((c) => salary.toUpperCase().includes(c)) ?? Object.entries(SYMBOLS).find(([s]) => salary.includes(s))?.[1];
  if (!code || code === "INR" || !rates[code]) return null;
  const s = salary.toLowerCase();
  const perYear = /hour|hr\b/.test(s) ? 2080 : /month|mo\b/.test(s) ? 12 : /week/.test(s) ? 52 : 1;
  // Ignore stray small numbers ("2 bonuses") except in hourly pay.
  const nums = [...salary.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*([kK])?/g)].map((m) => Number(m[1]) * (m[2] ? 1000 : 1)).filter((n) => n >= (perYear === 2080 ? 5 : 100));
  if (!nums.length) return null;
  const lakhs = (n: number) => Math.round((n * perYear * rates[code]) / 100_000);
  const [lo, hi] = [lakhs(Math.min(...nums)), lakhs(Math.max(...nums))];
  return lo === hi ? `≈ ₹${lo} L/yr` : `≈ ₹${lo}–${hi} L/yr`;
}

/** The top of a job's pay band in rupees a year, for sorting by pay. Null when no pay is listed or readable. */
export function payPerYearInr(salary: string | null | undefined, rates: Record<string, number>) {
  if (!salary) return null;
  const s = salary.toLowerCase();
  // Indian posts often say "25-35 LPA" or "₹30 L": lakhs per year.
  const lakhs = s.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)?\s*(\d+(?:\.\d+)?)?\s*(lpa|lakhs?|l\b)/);
  if (lakhs) return Number(lakhs[2] ?? lakhs[1]) * 100_000;
  const code = CODES.find((c) => salary.toUpperCase().includes(c)) ?? Object.entries(SYMBOLS).find(([sym]) => salary.includes(sym))?.[1];
  if (!code || !rates[code]) return null;
  const perYear = /hour|hr\b/.test(s) ? 2080 : /month|mo\b/.test(s) ? 12 : /week/.test(s) ? 52 : 1;
  const nums = [...salary.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*([kK])?/g)].map((m) => Number(m[1]) * (m[2] ? 1000 : 1)).filter((n) => n >= (perYear === 2080 ? 5 : 100));
  return nums.length ? Math.max(...nums) * perYear * rates[code] : null;
}

/** A researched pay range, like "₹28L – ₹40L a year" or "$90k – $120k a year". */
export function payRange(pay: { low: number; high: number; currency: string }) {
  const one = (n: number) =>
    pay.currency === "INR" ? `₹${n >= 1e7 ? `${+(n / 1e7).toFixed(1)}Cr` : `${+(n / 1e5).toFixed(n < 1e6 ? 1 : 0)}L`}` : `${pay.currency === "USD" ? "$" : `${pay.currency} `}${Math.round(n / 1000)}k`;
  return `${one(pay.low)} – ${one(pay.high)} a year`;
}
