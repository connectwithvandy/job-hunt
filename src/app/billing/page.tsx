"use client";

import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { FREE, PLANS, type PlanKey } from "../../../convex/lib/plans";
import { PageHead } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { Feedback, Spinner, type ActionState } from "@/components/ui";
import { errorMessage } from "@/lib/errors";

type RazorpayReply = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCheckout = { open: () => void; on: (event: string, fn: (e: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

/** Razorpay's checkout script, loaded the first time someone presses Pay. */
function loadCheckout() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("The payment window couldn't load. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

const date = (at: number) => new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Billing() {
  const status = useQuery(api.payments.status);
  const isOwner = useQuery(api.users.me)?.isOwner ?? false;
  const createOrder = useAction(api.payments.createOrder);
  const confirm = useAction(api.payments.confirm);
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [state, setState] = useState<ActionState>(null);
  const [now] = useState(() => Date.now());
  if (!status) return <Loading />;

  const pay = async (plan: PlanKey) => {
    setBusy(plan);
    setState(null);
    try {
      await loadCheckout();
      const order = await createOrder({ plan });
      const checkout = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: "INR",
        name: "JobPipe",
        description: order.label,
        prefill: { email: order.email, name: order.name },
        theme: { color: "#C6FF3D" },
        handler: async (reply: RazorpayReply) => {
          try {
            const { until } = await confirm({ orderId: reply.razorpay_order_id, paymentId: reply.razorpay_payment_id, signature: reply.razorpay_signature });
            setState({ message: `Paid. You're covered until ${date(until)}. A receipt is on its way from Razorpay.` });
          } catch (err) {
            setState({ error: errorMessage(err) });
          }
          setBusy(null);
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      checkout.on("payment.failed", (e) => {
        setState({ error: e.error?.description ? `The payment didn't go through: ${e.error.description}` : "The payment didn't go through." });
        setBusy(null);
      });
      checkout.open();
    } catch (err) {
      setState({ error: errorMessage(err) });
      setBusy(null);
    }
  };

  const covered = status.paidUntil && status.paidUntil > now;
  const plans: { key: PlanKey; note: string }[] = [
    { key: "week", note: "Seven days of every AI tool, for a week you're applying hard. Nothing renews by itself." },
    { key: "month", note: "Pay a month at a time. Nothing renews by itself: pay again when you want another month." },
    { key: "pass", note: "One payment for three months, a typical search. Nothing renews by itself." },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead title="Plan & billing" sub="Pay by UPI, card or net banking through Razorpay. Every paid plan has every feature." />

      <section className="card mb-6 p-6">
        <div className="label mb-1">Your plan</div>
        <p className="text-lg">
          {isOwner
            ? "Owner: every feature, no limits, nothing to pay."
            : status.partner && status.partner.until > now
            ? `3-month plan, ${date(status.partner.from)} to ${date(status.partner.until)}. Every feature is included.`
            : covered
              ? `Paid until ${date(status.paidUntil!)}.`
              : status.paidUntil
                ? `Your paid time ended on ${date(status.paidUntil)}.`
                : "You haven't paid yet."}
        </p>
        {!isOwner && !covered && !(status.partner && status.partner.until > now) && (
          <p className="mt-2 text-sm text-ink-2">
            Free plan, yours to keep: daily jobs, your tracker, the fit guess on every job, {FREE.scoresPerDay} AI fit scores a day and {FREE.tailorsPerWeek} tailored CV a week. A paid plan adds
            more scores and CVs, company research, interview prep, referral and hiring-manager messages, and the chat.
          </p>
        )}
        {status.partner && status.partner.until > now && (
          <p className="mt-1 text-sm text-ink-2">
            In partnership with{" "}
            <a className="underline" href={status.partner.url} target="_blank" rel="noopener noreferrer">
              {status.partner.name}
            </a>
            . Nothing to pay.
          </p>
        )}
      </section>

      {isOwner && <div className="label mb-2">What members see</div>}
      {!status.on ? (
        <p className="card p-6 text-ink-2">Payments aren&apos;t switched on yet. Nothing to do for now.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map(({ key, note }) => {
            const p = status.prices[key];
            return (
              <section key={key} className="card flex flex-col p-6">
                <h2 className="display text-2xl">{p.label}</h2>
                <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
                  {p.was && <s className="text-xl text-ink-3">₹{p.was.rupees.toLocaleString("en-IN")}</s>}
                  <span className="display text-4xl">₹{p.rupees.toLocaleString("en-IN")}</span>
                  {p.was && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">{p.was.percentOff}% off</span>}
                </p>
                {status.founding && key !== "week" && <p className="mt-1 text-xs text-good">Founding offer for the first {PLANS.foundingSeats} people, kept while you stay.</p>}
                <p className="mt-2 flex-1 text-sm text-ink-2">{note}</p>
                <button className="btn btn-primary mt-4" disabled={busy !== null} onClick={() => void pay(key)}>
                  {busy === key && <Spinner />}
                  {busy === key ? "Opening payment…" : covered ? { week: "Add a week", month: "Add 1 month", pass: "Add 3 months" }[key] : `Pay ₹${p.rupees.toLocaleString("en-IN")}`}
                </button>
              </section>
            );
          })}
        </div>
      )}
      <div className="mt-4">
        <Feedback state={state} />
      </div>

      {status.paid.length > 0 && (
        <section className="mt-8">
          <div className="label mb-2">Payments</div>
          <ul className="card divide-y divide-line text-sm">
            {status.paid.map((p) => (
              <li key={p.paymentId} className="flex flex-wrap justify-between gap-2 p-3">
                <span>
                  {date(p.paidAt)} · {p.plan === "pass" ? "3-month pass" : p.plan === "week" ? "Week Pass" : "1 month"} · ₹{p.amount.toLocaleString("en-IN")}
                </span>
                <span className="text-ink-3">covers to {date(p.until)} · {p.paymentId}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-xs text-ink-3">
        Prices include all features; GST is added where it applies. See <Link className="underline" href="/refunds">refunds and cancellation</Link>, or write to vandana@jobpipe.in.
      </p>
    </div>
  );
}
