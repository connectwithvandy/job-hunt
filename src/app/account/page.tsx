"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { PageHead } from "@/components/bits";
import { AnswersForm } from "@/components/forms";
import { readCv } from "@/lib/cvReadback";
import { Loading } from "@/components/Loading";
import { attempt, Feedback, type ActionState } from "@/components/ui";

export default function Account() {
  const me = useQuery(api.access.mine);
  const user = useQuery(api.users.me);
  if (!me || !user) return <Loading />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHead title="About you" sub="Who you are to JobPipe. Check what it read from your CV, where you'd work, and the answers it puts on forms." />
      <Details me={me} />
      <CvRead cv={user.resume} />
      <WhereYouWork location={user.location} workModes={user.workModes} />
      <section className="card mb-6 p-6">
        <h2 className="h2 mb-1">Answers for application forms</h2>
        <p className="mb-4 text-[15px] text-ink-2">Notice period and pay come up on almost every form. Each job&apos;s Apply step and the chat use these.</p>
        <AnswersForm answers={user.answers} location={user.location} firstFew={3} />
      </section>
      <PasswordForm />
    </div>
  );
}

function Details({ me }: { me: { email: string; name: string; linkedin: string; canEdit: boolean } }) {
  const save = useMutation(api.access.updateProfile);
  const [name, setName] = useState(me.name);
  const [linkedin, setLinkedin] = useState(me.linkedin);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  return (
    <section className="card mb-6 p-6">
      <h2 className="h2 mb-4">Your details</h2>
      <div className="space-y-4">
        <label className="block">
          <span className="label">Name</span>
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} disabled={!me.canEdit} />
        </label>
        <div>
          <span className="label">Email</span>
          <p className="mt-1 text-[15px] [overflow-wrap:anywhere]">
            {me.email.split("@")[0]}
            <wbr />@{me.email.split("@")[1]}
          </p>
          <span className="mt-1 block text-[13px] text-ink-3">You sign in with this. To change it, write to hello@jobpipe.in.</span>
        </div>
        <label className="block">
          <span className="label">LinkedIn profile link</span>
          <input className="field mt-1" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/your-name" disabled={!me.canEdit} />
        </label>
      </div>
      {me.canEdit ? (
        <div className="mt-5 flex items-center gap-3">
          <button
            className={`btn btn-sm ${name !== me.name || linkedin !== me.linkedin ? "btn-primary" : "btn-secondary"}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState(await attempt(async () => (await save({ name, linkedin }), "Saved.")));
              setBusy(false);
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <Feedback state={busy ? null : state} />
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-3">Your name comes from your main CV.</p>
      )}
    </section>
  );
}

/** One line of the CV read-back: what it is on the left, what JobPipe read on the right. */
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-3 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_1fr]">
      <span className="text-sm text-ink-3">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

/** What JobPipe took from the main CV, so a misread can be fixed before it shapes every tailored CV and score. */
function CvRead({ cv }: { cv: Parameters<typeof readCv>[0] }) {
  const r = readCv(cv);
  const edit = (
    <Link href="/resume" className="btn-text">
      Looks wrong? Edit CV
    </Link>
  );
  if (!r) {
    return (
      <section className="card mb-6 p-6">
        <h2 className="h2 mb-1">How JobPipe reads your CV</h2>
        <p className="text-sm text-ink-2">
          No CV yet. <Link href="/resume" className="underline">Add your CV</Link> and this shows what JobPipe takes from it.
        </p>
      </section>
    );
  }
  const none = <span className="text-ink-3">Not found in your CV.</span>;
  return (
    <section className="card mb-6 p-6">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="h2">How JobPipe reads your CV</h2>
        <span className="shrink-0 max-sm:hidden">{edit}</span>
      </div>
      <p className="mb-4 text-sm text-ink-2">Every fit score and tailored CV starts from this. If something here is wrong, fix it in your CV.</p>
      <div>
        <Item label="Now">{r.current ?? none}</Item>
        <Item label="Experience">{r.statedYears ? `${r.statedYears}, as your CV says${r.years !== null && !r.statedYears.startsWith(String(r.years)) ? ` (your dates add up to about ${r.years})` : ""}` : r.years !== null ? `About ${r.years} ${r.years === 1 ? "year" : "years"}, from your dates` : none}</Item>
        <Item label="Last roles">
          {r.roles.length ? (
            <ul className="space-y-1">
              {r.roles.map((x, i) => (
                <li key={i}>
                  <span className="font-medium">{x.title || "Role not named"}</span> · {x.company || "Company not named"}
                  {x.when && <span className="text-ink-3"> · {x.when}</span>}
                </li>
              ))}
            </ul>
          ) : (
            none
          )}
        </Item>
        <Item label="Markets">{r.regions.length ? r.regions.join(", ") : none}</Item>
        <Item label="Tools and skills">{r.skills.length ? r.skills.join(", ") : none}</Item>
        <Item label="Numbers it reuses">
          {r.numbers.length ? (
            <ul className="list-disc space-y-1 pl-4">
              {r.numbers.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : (
            <span className="text-ink-3">No numbers found. Results with numbers (quota %, pipeline, team size) make every tailored CV stronger.</span>
          )}
        </Item>
      </div>
      <div className="mt-3 sm:hidden">{edit}</div>
    </section>
  );
}

const MODE_WORDS: Record<string, string> = { onsite: "in office", hybrid: "hybrid", remote: "remote" };

/** Where they'd work, as picked on Roles, with a way back there to change it. */
function WhereYouWork({ location, workModes }: { location: string; workModes: string[] }) {
  return (
    <section className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-6">
      <div className="min-w-0">
        <h2 className="h2">Where you&apos;d work</h2>
        <p className="mt-1 text-sm text-ink-2">
          {location || "Not picked yet"}
          {workModes.length ? ` · ${workModes.map((m) => MODE_WORDS[m] ?? m).join(", ")}` : ""}
        </p>
      </div>
      <Link href="/tracks" className="btn btn-secondary btn-sm">
        Change in Roles
      </Link>
    </section>
  );
}

function PasswordForm() {
  const change = useAction(api.access.changePassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  return (
    <section className="card p-6">
      <h2 className="h2 mb-4">Sign-in &amp; password</h2>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setState(
            await attempt(async () => {
              await change({ current, next });
              setCurrent("");
              setNext("");
              return "Password changed.";
            }),
          );
          setBusy(false);
        }}
      >
        <label className="block">
          <span className="label">Current password</span>
          <input className="field mt-1" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">New password</span>
          <input className="field mt-1" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          <span className="mt-1 block text-xs text-ink-3">At least 8 characters.</span>
        </label>
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary btn-sm" disabled={busy || !current || next.length < 8} title={!current || next.length < 8 ? "Type your current password and a new one (8+ characters)" : undefined}>
            {busy ? "Changing…" : "Change password"}
          </button>
          <Feedback state={busy ? null : state} />
        </div>
      </form>
    </section>
  );
}
