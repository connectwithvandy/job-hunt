"use client";
import { useState } from "react";

type Offer = { fixed: string; variable: string; hit: string };

const lakh = (n: number) => `₹${(Math.round(n * 10) / 10).toLocaleString("en-IN")} L`;
const num = (s: string) => Math.max(0, Number(s.replace(/[^0-9.]/g, "")) || 0);

/** What an offer really pays: fixed, plus variable at the share of target the team actually hits. */
function payOf(o: Offer) {
  const fixed = num(o.fixed);
  const variable = num(o.variable);
  const hit = Math.min(200, num(o.hit)) / 100;
  return { ote: fixed + variable, likely: fixed + variable * hit, fixedShare: fixed + variable ? fixed / (fixed + variable) : 0 };
}

function OfferBox({ label, offer, set }: { label: string; offer: Offer; set: (o: Offer) => void }) {
  const p = payOf(offer);
  const field = (key: keyof Offer, name: string, hint: string) => (
    <label className="mt-4 block text-sm">
      <span className="font-medium">{name}</span>
      <input inputMode="decimal" className="field mt-1 w-full" value={offer[key]} onChange={(e) => set({ ...offer, [key]: e.target.value })} placeholder={hint} />
    </label>
  );
  return (
    <div className="card p-6">
      <h2 className="display text-xl">{label}</h2>
      {field("fixed", "Fixed pay a year (₹ lakh)", "e.g. 12")}
      {field("variable", "Variable at 100% of target (₹ lakh)", "e.g. 6")}
      {field("hit", "Share of target the team really hits (%)", "e.g. 70")}
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-ink-3">OTE they quote</dt>
          <dd className="text-lg font-semibold">{lakh(p.ote)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">What you&apos;d likely earn</dt>
          <dd className="text-lg font-semibold text-accent">{lakh(p.likely)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Fixed share</dt>
          <dd className="font-medium">{Math.round(p.fixedShare * 100)}%</dd>
        </div>
        <div>
          <dt className="text-ink-3">Gap from OTE</dt>
          <dd className="font-medium">{lakh(p.ote - p.likely)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function OteCalculator() {
  const [a, setA] = useState<Offer>({ fixed: "12", variable: "6", hit: "70" });
  const [b, setB] = useState<Offer>({ fixed: "15", variable: "3", hit: "90" });
  const pa = payOf(a);
  const pb = payOf(b);
  const better = Math.abs(pa.likely - pb.likely) < 0.05 ? null : pa.likely > pb.likely ? "A" : "B";
  return (
    <div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <OfferBox label="Offer A" offer={a} set={setA} />
        <OfferBox label="Offer B" offer={b} set={setB} />
      </div>
      <p className="mt-5 text-lg">
        {better
          ? `Offer ${better} likely pays ${lakh(Math.abs(pa.likely - pb.likely))} more a year, once you count how often the team really hits target.`
          : "Both offers likely pay about the same once you count how often the team hits target."}
      </p>
    </div>
  );
}
