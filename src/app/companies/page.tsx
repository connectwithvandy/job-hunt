"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { linkedInPeopleSearch } from "../../../convex/lib/company";
import { PageHead, ScorePill } from "@/components/bits";
import { HiringContacts } from "@/components/job-client";
import { Loading } from "@/components/Loading";
import { ActionButton } from "@/components/ui";

type Status = Doc<"prospects">["status"];
const STATUSES: { value: Status; label: string }[] = [
  { value: "new", label: "To look at" },
  { value: "approaching", label: "Reaching out" },
  { value: "talking", label: "Talking" },
  { value: "skip", label: "Not for me" },
];
const PEOPLE = ["Founder", "CEO", "Head of Sales", "VP Sales"];

export default function Companies() {
  const rows = useQuery(api.prospects.list);
  const findYc = useAction(api.agent.findYcCompanies);
  const findFunded = useAction(api.agent.findFunded);
  const setStatus = useMutation(api.prospects.setStatus);
  const setDream = useMutation(api.prospects.setDream);
  const addDream = useMutation(api.prospects.addDream);
  const suggest = useAction(api.agent.suggestDreams);
  const checkRoles = useAction(api.agent.checkOpenRoles);
  const [tab, setTab] = useState<"dream" | "startups">("dream");
  const [scope, setScope] = useState<"india_remote" | "profile">("india_remote");
  const [show, setShow] = useState<Status>("new");
  const [minFit, setMinFit] = useState(0);
  const [picks, setPicks] = useState("OpenAI, ElevenLabs, Anthropic, Rubrik, Emergent");
  const [newName, setNewName] = useState("");
  if (!rows) return <Loading />;

  const inTab = rows.filter((r) => (tab === "dream" ? r.dream : !r.dream));
  const count = (s: Status) => inTab.filter((r) => r.status === s).length;
  const visible = inTab
    .filter((r) => r.status === show && (r.fit?.score ?? 0) >= minFit)
    .sort((a, b) => (b.openRoles ?? 0) - (a.openRoles ?? 0) || (b.fit?.score ?? -1) - (a.fit?.score ?? -1));
  const dreamCount = rows.filter((r) => r.dream && r.status !== "skip").length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead
        title="Companies"
        sub="Startups worth approaching before they post a role: recent YC companies and ones that just raised money. Reach the founders or sales leaders early, when there's no queue."
      />
      <div className="mb-5 flex gap-2">
        {(
          [
            ["dream", `Dream list · ${dreamCount}`],
            ["startups", `Startups · ${rows.filter((r) => !r.dream).length}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full border px-4 py-1.5 text-sm ${tab === k ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "dream" ? (
        <div className="card mb-6 space-y-3 p-5">
          <p className="text-sm text-ink-2">
            Up to 20 companies you&apos;d love to work for. They&apos;re checked for sales and GTM openings in India or remote, which land in your Jobs list, and re-checked every morning when autopilot is on.
          </p>
          <label className="block">
            <span className="label">Your must-haves</span>
            <input className="field mt-1" value={picks} onChange={(e) => setPicks(e.target.value)} placeholder="Company names, separated by commas" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton
              run={async () => {
                const { added } = await suggest({ mustInclude: picks.split(",") });
                return `Added ${added}. Checked them for open roles too.`;
              }}
              pending="Researching companies… 2 to 3 minutes"
            >
              {dreamCount ? "Fill my list to 20" : "Build my Dream 20"}
            </ActionButton>
            {dreamCount > 0 && (
              <ActionButton
                run={async () => {
                  const { companies, roles } = await checkRoles({});
                  return `Checked ${companies} companies: ${roles} sales and GTM ${roles === 1 ? "opening" : "openings"} in India or remote, added to Jobs.`;
                }}
                pending="Checking open roles…"
                variant="ghost"
              >
                Check for open roles
              </ActionButton>
            )}
          </div>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              await addDream({ name: newName });
              setNewName("");
            }}
          >
            <input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add one company by name" />
            <button className="btn btn-ghost btn-sm">Add</button>
          </form>
        </div>
      ) : (
        <div className="card mb-6 space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton
              run={async () => {
                const { added } = await findYc({ scope });
                return added ? `Added ${added} YC companies, scored for fit.` : "No new YC companies match right now.";
              }}
              pending="Searching YC… about a minute"
            >
              Find YC companies
            </ActionButton>
            <ActionButton
              run={async () => {
                const { added } = await findFunded({ scope });
                return added ? `Added ${added} recently funded companies.` : "No new funding news found. Try again in a few days.";
              }}
              pending="Searching funding news… 1 to 2 minutes"
              variant="ghost"
            >
              Find recently funded
            </ActionButton>
            <select className="field !w-auto !py-1.5 text-sm" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} aria-label="Where">
              <option value="india_remote">India or remote only</option>
              <option value="profile">Where my Roles page says</option>
            </select>
          </div>
          <p className="text-xs text-ink-3">YC companies come from the public YC directory; funding comes from news searches. Each one is scored for fit against your CVs.</p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setShow(s.value)}
            className={`rounded-full border px-3 py-1 text-sm ${show === s.value ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}
          >
            {s.label} · {count(s.value)}
          </button>
        ))}
        <select className="field ml-auto !w-auto !py-1.5 text-sm" value={minFit} onChange={(e) => setMinFit(Number(e.target.value))} aria-label="Fit">
          <option value={0}>Any fit</option>
          <option value={60}>Fit 60+</option>
          <option value={75}>Fit 75+</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-ink-2">{rows.length ? "Nothing here." : "Press Find YC companies or Find recently funded to start your list."}</div>
      ) : (
        <ul className="space-y-4">
          {visible.map((p) => (
            <li key={p._id} className="card p-5">
              <div className="flex items-start gap-4">
                {p.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-soft font-medium">{p.name[0]}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <a href={p.website} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {p.name}
                    </a>
                    <span className="text-sm text-ink-2">{p.oneLiner}</span>
                  </div>
                  <div className="mt-1 text-xs text-ink-3">
                    {[p.batch && `YC ${p.batch}`, p.funding, p.teamSize && `${p.teamSize} people`, p.location, p.isHiring && "Hiring on YC"].filter(Boolean).join(" · ")}
                    {p.fundingSource && (
                      <>
                        {" · "}
                        <a className="underline" href={p.fundingSource} target="_blank" rel="noreferrer">
                          source
                        </a>
                      </>
                    )}
                  </div>
                  {p.whyDream && <p className="mt-2 text-sm text-ink-2">{p.whyDream}</p>}
                  {p.fit && (
                    <p className="mt-2 text-sm text-ink-2">
                      {p.fit.reason} <span className="text-ink">Angle: {p.fit.angle}</span>
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {p.rolesCheckedAt !== undefined &&
                      (p.openRoles ? (
                        <Link href={`/jobs?q=${encodeURIComponent(p.name)}`} className="rounded-full bg-accent px-2.5 py-0.5 font-medium text-on-accent">
                          {p.openRoles} open {p.openRoles === 1 ? "role" : "roles"} in India or remote →
                        </Link>
                      ) : (
                        <span className="text-ink-3">No sales or GTM openings in India or remote at the last check</span>
                      ))}
                    <button className="text-ink-3 underline hover:text-ink" onClick={() => void checkRoles({ prospectId: p._id })}>
                      Check open roles
                    </button>
                    <button className="text-ink-3 underline hover:text-ink" onClick={() => void setDream({ prospectId: p._id, dream: !p.dream })}>
                      {p.dream ? "Take off dream list" : "Add to dream list"}
                    </button>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <ScorePill score={p.fit?.score} />
                  <select
                    className="field !w-auto !py-1 text-xs"
                    value={p.status}
                    onChange={(e) => void setStatus({ prospectId: p._id, status: e.target.value as Status })}
                    aria-label="Status"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <details className="mt-3" open={p.contacts.length > 0}>
                <summary className="cursor-pointer text-sm font-medium">Reach out {p.contacts.length ? `· ${p.contacts.length} saved` : ""}</summary>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {p.ycUrl && (
                      <a className="btn btn-ghost btn-sm" href={p.ycUrl} target="_blank" rel="noreferrer">
                        Founders on YC ↗
                      </a>
                    )}
                    {PEOPLE.map((t) => (
                      <a key={t} className="btn btn-ghost btn-sm" href={linkedInPeopleSearch(p.name, t)} target="_blank" rel="noreferrer">
                        Find {t} ↗
                      </a>
                    ))}
                  </div>
                  <HiringContacts owner={{ prospectId: p._id }} contacts={p.contacts} />
                  <p className="text-xs text-ink-3">Save a person, then press Personalise to get a short note asking whether they&apos;re building a sales team, written around what you have in common.</p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
