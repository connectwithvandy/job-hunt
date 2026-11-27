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
  // Converted from the posting's own currency, said plainly, so it never reads as our estimate (27 Nov review).
  return `${lo === hi ? `₹${lo}` : `₹${lo}–${hi}`} L/yr (from ${code})`;
}

/**
 * Some boards send their own guess ("₹22–36 L (est.)"). That isn't the company's figure, so we treat
 * it like no pay at all: we only show pay the posting lists (owner, 19 Nov: "dont add salary if we dont know").
 */
const isGuess = (salary: string) => /\best\b|estimat/i.test(salary);

/** The top of a job's pay band in rupees a year, for sorting by pay. Null when no pay is listed or readable. */
export function payPerYearInr(salary: string | null | undefined, rates: Record<string, number>) {
  if (!salary || isGuess(salary)) return null;
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

/**
 * A job's pay to show: in rupees when it converts, else as written. Null when the figure can't be a
 * year's pay, like "USD 45 – 90/year" (really an hourly rate) or "45000-55000 per year" with no currency,
 * and null for a board's own guess: we show only pay the posting lists.
 */
export function payText(salary: string | null | undefined, rates: Record<string, number>) {
  if (!salary || isGuess(salary)) return null;
  const converted = inInr(salary, rates);
  if (converted) return converted;
  const s = salary.toLowerCase();
  // "30L" and "30 L" are lakhs too.
  const inLakhs = /lpa|lakhs?|\bl\b|\d\s*l\b/.test(s);
  const yearly = !/hour|hr\b|month|mo\b|week|day/.test(s) && !inLakhs && !/cr\b|crore/.test(s);
  const nums = [...salary.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*([kK])?/g)].map((m) => Number(m[1]) * (m[2] ? 1000 : 1));
  const top = nums.length ? Math.max(...nums) : 0;
  const rupees = /₹|inr|rs\.?/i.test(salary);
  // A year's pay in rupees runs to lakhs; in other currencies to thousands.
  const foreign = /[$€£]|usd|eur|gbp|aud|sgd|cad/i.test(salary);
  if (yearly && top > 0 && top < (rupees || !foreign ? 100_000 : 1000)) return null;
  // Long rupee figures read better in lakhs: "400000 per month" becomes "₹4 L/month". A bare monthly
  // figure that big can only be rupees; a bare yearly one could be dollars, so it stays as written.
  const monthly = /month|mo\b/.test(s);
  // A bare yearly figure of 3 lakh or more is rupees: no dollar sales salary is written as "500000-600000 per year"
  // (27 Nov review: raw figures read as scraped data).
  const bareRupees = !foreign && !rupees && yearly && top >= 300_000;
  if ((rupees || bareRupees || (!foreign && monthly)) && top >= 100_000 && !/lpa|lakhs?|\bl\b|cr\b|crore/.test(s)) {
    const big = nums.filter((n) => n >= 10_000);
    const l = (n: number) => +(n / 100_000).toFixed(n < 1_000_000 ? 1 : 0);
    const [lo, hi] = [l(Math.min(...big)), l(Math.max(...big))];
    // Monthly pay shows as a year's, like every other figure (27 Nov review: L/month next to L/yr).
    const yearOf = (n: number) => +(n * 12).toFixed(n * 12 < 10 ? 1 : 0);
    // Over ₹1.5 L "a month" can't be told apart from a year's pay the board mislabelled (27 Nov review: a shop sales
    // job read ₹18–30 L/yr). Unknown pay isn't shown (owner, 19 Nov: only pay we know).
    if (monthly && hi >= 1.5) return null;
    if (monthly) return `₹${lo === hi ? yearOf(lo) : `${yearOf(lo)}–${yearOf(hi)}`} L/yr`;
    if (!/week|day|hour|hr\b/.test(s)) return `₹${lo === hi ? lo : `${lo}–${hi}`} L/yr`;
  }
  // Lakhs written out: "5-8 LPA" or "5 to 8 lakhs" becomes "₹5–8 L/yr".
  if (!foreign && inLakhs && top > 0 && top < 1000) {
    const [a, b] = [Math.min(...nums), Math.max(...nums)].map((n) => (monthly ? +(n * 12).toFixed(n * 12 < 10 ? 1 : 0) : n));
    return `${/up to|upto/.test(s) ? "Up to " : ""}₹${a === b ? a : `${a}–${b}`} L/yr`;
  }
  // Monthly rupee pay under a lakh, as a year's: "15000-20000 per month" becomes "₹1.8–2.4 L/yr".
  if ((rupees || !foreign) && monthly && top >= 1000 && top < 100_000) {
    const big = nums.filter((n) => n >= 1000);
    const yr = (n: number) => +((n * 12) / 100_000).toFixed(1);
    const [lo, hi] = [yr(Math.min(...big)), yr(Math.max(...big))];
    return `₹${lo === hi ? lo : `${lo}–${hi}`} L/yr`;
  }
  return salary;
}
