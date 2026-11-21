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
import { PlanCards } from "@/components/PlanCards";

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
  // A promo code typed in; checked live against each plan so the cards show the price after it.
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const monthPromo = useQuery(api.payments.checkPromo, applied ? { code: applied, plan: "month" } : "skip");
  const passPromo = useQuery(api.payments.checkPromo, applied ? { code: applied, plan: "pass" } : "skip");
  if (!status) return <Loading />;
  const promoOf = (plan: PlanKey) => (plan === "month" ? monthPromo : plan === "pass" ? passPromo : undefined);

  const pay = async (plan: PlanKey) => {
    setBusy(plan);
    setState(null);
    try {
      await loadCheckout();
      const promo = promoOf(plan)?.ok ? applied : undefined;
      const order = await createOrder({ plan, promo });
      if (order.free) {
        setState({ message: `Code applied. You're covered until ${date(order.until)}.` });
        setBusy(null);
        return;
      }
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
            Free plan, yours to keep: daily jobs, your tracker, a quick match % on every job, {FREE.scoresPerDay} AI fit scores a day and {FREE.tailorsTotal} tailored CV to try. A paid plan adds
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
        <>
        <PlanCards
          prices={{ month: status.prices.month, pass: status.prices.pass }}
          founding={
            status.founding
              ? status.foundingLeft > 0
                ? `Founding price: ${status.foundingLeft} of ${PLANS.foundingSeats} places left. You keep it for as long as you stay.`
                : "You keep your founding price."
              : null
          }
          freeAction={
            <div className="btn btn-ghost w-full cursor-default justify-center text-ink-3">
              {!isOwner && !covered && !(status.partner && status.partner.until > now) ? "Your plan now" : "Always included"}
            </div>
          }
          note={(key) => {
            const promo = promoOf(key);
            if (promo) return <p className={`mt-2 text-xs ${promo.ok ? "text-good" : "text-ink-3"}`}>{promo.ok ? `Code ${applied}: ${promo.message}` : promo.message}</p>;
            const invite = status.invite;
            if (!invite) return null;
            return (
              <p className="mt-2 text-xs text-good">
                {invite.percentOff}% off, ₹{invite[key].toLocaleString("en-IN")}:{" "}
                {invite.why === "friend" ? "you joined through a friend's link." : "a friend you invited joined and paid. Thank you!"}
              </p>
            );
          }}
          action={(key) => {
            const promo = promoOf(key);
            return (
              <button className="btn btn-primary w-full justify-center" disabled={busy !== null} onClick={() => void pay(key)}>
                {busy === key && <Spinner />}
                {busy === key
                  ? "Opening payment…"
                  : promo?.ok && promo.rupees === 0
                    ? "Use my code"
                    : covered
                      ? { week: "Add a week", month: "Add 1 month", pass: "Add 3 months" }[key]
                      : `Pay ₹${(promo?.ok ? promo.rupees : status.invite ? status.invite[key] : status.prices[key].rupees).toLocaleString("en-IN")}`}
              </button>
            );
          }}
        />
        {/* A small link, not a full-width box: most people have no code (19 Nov). */}
        {codeOpen || applied ? (
          <form
            className="mt-4 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(code.trim().toUpperCase());
            }}
          >
            <label className="text-sm text-ink-2" htmlFor="promo">
              Your code
            </label>
            <input id="promo" autoFocus className="field w-48 py-1.5 text-sm uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" />
            <button className="btn btn-ghost btn-sm" type="submit" disabled={!code.trim()}>
              Apply
            </button>
          </form>
        ) : (
          <button type="button" className="mt-4 text-sm text-ink-2 underline" onClick={() => setCodeOpen(true)}>
            Have a code?
          </button>
        )}
        </>
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
