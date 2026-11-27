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

/** Whether an amount is one of a plan's prices today (founding, full, or after an invite discount). */
const isTodaysPrice = (plan: string, amount: number) => {
  const prices = plan === "pass" ? [PLANS.foundingPass, PLANS.pass] : plan === "month" ? [PLANS.founding, PLANS.full] : [PLANS.week];
  return prices.some((x) => x === amount || Math.round(x * (1 - PLANS.invitePercentOff / 100)) === amount);
};

const date = (at: number) => new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Billing() {
  const status = useQuery(api.payments.status);
  const isOwner = useQuery(api.users.me)?.isOwner ?? false;
  const account = useQuery(api.access.mine);
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
  // In the free week the menu says "Free trial · N days left", so this page says the same (23 Nov walk: it said
  // "You haven't paid yet" and marked the free plan as theirs, with no word about the trial).
  // Covered now (paid or through a partner): the page leads with the plan, not the price cards.
  const paidNow = !isOwner && (!!covered || !!(status.partner && status.partner.until > now));
  const trialUntil =
    !isOwner && !covered && !(status.partner && status.partner.until > now) && account?.trialEndsAt && account.trialEndsAt > now ? account.trialEndsAt : null;

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
              ? `Paid until ${date(status.paidUntil!)}, ${Math.ceil((status.paidUntil! - now) / 86_400_000)} days left. Every feature is included. More time costs ₹${status.prices.month.rupees.toLocaleString("en-IN")} a month or ₹${status.prices.pass.rupees.toLocaleString("en-IN")} for 3 months${status.founding ? ", your founding price" : ""}.`
              : trialUntil
                ? `Free trial: every feature until ${date(trialUntil)}. Nothing to pay, no card needed.`
              : status.paidUntil
                ? `Your paid time ended on ${date(status.paidUntil)}.`
                : "You haven't paid yet."}
        </p>
        {!isOwner && !covered && !(status.partner && status.partner.until > now) && (
          <p className="mt-2 text-sm text-ink-2">
            {trialUntil ? "After that, the free plan is yours to keep" : "Free plan, yours to keep"}: daily jobs, your tracker, a rough fit guess on every job, {FREE.scoresPerDay} AI fit scores a day and {FREE.tailorsTotal} tailored CV to try. A paid plan adds
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

      {paidNow ? (
        <>
      {status.paid.length > 0 && (
        <section className="mt-8">
          <div className="label mb-2">Payments</div>
          <ul className="card divide-y divide-line text-sm">
            {status.paid.map((p) => (
              <li key={p.paymentId} className="flex flex-wrap justify-between gap-2 p-3">
                <span>
                  {date(p.paidAt)} · {p.plan === "pass" ? "3 months" : p.plan === "week" ? "Week Pass" : "1 month"} · ₹{p.amount.toLocaleString("en-IN")}
                  {/* An amount that isn't today's price says why, so nobody reads it as an overcharge (27 Nov review). */}
                  {!isTodaysPrice(p.plan, p.amount) && (
                    // Says what the next payment costs too, so an older, higher price never reads as what you'll pay again (28 Nov review).
                    <span className="text-ink-3">
                      {" "}
                      (launch price, paid {date(p.paidAt)}
                      {p.plan !== "week" && status.prices[p.plan as "month" | "pass"] ? `; it's ₹${status.prices[p.plan as "month" | "pass"].rupees.toLocaleString("en-IN")} now${status.founding ? ", your founding price" : ""}` : ""})
                    </span>
                  )}
                </span>
                <span className="text-ink-3">
                  Covers to {date(p.until)} ·{" "}
                  <span title={`Payment ID ${p.paymentId}. Razorpay emailed the receipt.`}>Receipt in your email</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

          {/* Already covered: plan and receipts first; buying more is one tap away, not a sales page (27 Nov review). */}
          <details className="mt-8">
            <summary className="btn btn-secondary btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">Add more time · from ₹{status.prices.month.rupees.toLocaleString("en-IN")}</summary>
            <div className="mt-6">
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
              {trialUntil ? "Yours after the trial" : !isOwner && !covered && !(status.partner && status.partner.until > now) ? "Your plan now" : "Always included"}
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
              // One lime button on the page: the plan most people pick (27 Nov review).
              <button className={`btn w-full justify-center ${key === "pass" ? "btn-primary" : "btn-secondary"}`} disabled={busy !== null} onClick={() => void pay(key)}>
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
          <button type="button" className="btn-text mt-3 -ml-1 inline-flex min-h-11 items-center underline" onClick={() => setCodeOpen(true)}>
            Have a code?
          </button>
        )}
        </>
      )}
      <div className="mt-4">
        <Feedback state={state} />
      </div>

            </div>
          </details>
        </>
      ) : (
        <>
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
              {trialUntil ? "Yours after the trial" : !isOwner && !covered && !(status.partner && status.partner.until > now) ? "Your plan now" : "Always included"}
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
              // One lime button on the page: the plan most people pick (27 Nov review).
              <button className={`btn w-full justify-center ${key === "pass" ? "btn-primary" : "btn-secondary"}`} disabled={busy !== null} onClick={() => void pay(key)}>
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
          <button type="button" className="btn-text mt-3 -ml-1 inline-flex min-h-11 items-center underline" onClick={() => setCodeOpen(true)}>
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
                  {date(p.paidAt)} · {p.plan === "pass" ? "3 months" : p.plan === "week" ? "Week Pass" : "1 month"} · ₹{p.amount.toLocaleString("en-IN")}
                  {/* An amount that isn't today's price says why, so nobody reads it as an overcharge (27 Nov review). */}
                  {!isTodaysPrice(p.plan, p.amount) && (
                    // Says what the next payment costs too, so an older, higher price never reads as what you'll pay again (28 Nov review).
                    <span className="text-ink-3">
                      {" "}
                      (launch price, paid {date(p.paidAt)}
                      {p.plan !== "week" && status.prices[p.plan as "month" | "pass"] ? `; it's ₹${status.prices[p.plan as "month" | "pass"].rupees.toLocaleString("en-IN")} now${status.founding ? ", your founding price" : ""}` : ""})
                    </span>
                  )}
                </span>
                <span className="text-ink-3">
                  Covers to {date(p.until)} ·{" "}
                  <span title={`Payment ID ${p.paymentId}. Razorpay emailed the receipt.`}>Receipt in your email</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

        </>
      )}
      <p className="mt-8 text-xs text-ink-3">
        Prices include all features; GST is added where it applies. See <Link className="underline" href="/refunds">refunds and cancellation</Link>, or write to hello@jobpipe.in.
      </p>
    </div>
  );
}
