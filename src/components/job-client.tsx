"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { CLOSENESS_LABEL, type ContactWithChat } from "../../convex/lib/chats";
import { STATUS_LABELS } from "../../convex/lib/defaults";
import { nextFollowUp } from "../../convex/lib/followups";
import { downloadDocx } from "@/lib/docx";
import { errorMessage } from "@/lib/errors";
import { type ActionState, attempt, CopyAndOpen, CopyButton, Feedback, LeftToday, Spinner } from "./ui";

type JobStatus = Doc<"jobs">["status"];
type Outreach = Doc<"jobs">["outreach"][number];
type OutreachStatus = Outreach["status"];

/**
 * Gets everything ready in one click: opens the form, downloads the tailored CV and copies the
 * cover letter, so applying is the autofill bookmark, attach, paste, Submit.
 */
export function ApplyButton({ job }: { job: Doc<"jobs"> & { pack?: { resume: Parameters<typeof downloadDocx>[0]; coverLetter: string } } }) {
  const setStatus = useMutation(api.jobs.setStatus);
  const [done, setDone] = useState("");
  const link = job.sourceUrl || job.url;
  if (!link) return null;
  return (
    <div className="space-y-2">
      <button
        className="btn btn-primary"
        onClick={async () => {
          // Open first, inside the click, or the browser blocks the new tab.
          window.open(link, "_blank", "noreferrer");
          const ready: string[] = [];
          if (job.pack) {
            await downloadDocx(job.pack.resume, `${job.pack.resume.name} CV ${job.company}`);
            ready.push("CV downloaded");
            if (job.pack.coverLetter) {
              await navigator.clipboard.writeText(job.pack.coverLetter).then(() => ready.push("cover letter copied"), () => {});
            }
          }
          if (job.status === "new") await setStatus({ jobId: job._id, status: "applying" });
          setDone(
            ready.length
              ? `${ready.join(", ")}. On the form: click your Autofill bookmark, attach the CV, paste the letter, Submit.`
              : "Form opened. Write your tailored CV in step 1 first to have it downloaded here too.",
          );
        }}
      >
        Apply ↗
      </button>
      {done && <p className="text-sm text-ink-2">{done}</p>}
    </div>
  );
}

export function StatusSelect({ jobId, status }: { jobId: Id<"jobs">; status: JobStatus }) {
  const setStatus = useMutation(api.jobs.setStatus);
  return (
    <select className="field !w-auto !py-1.5 text-sm" value={status} onChange={(e) => void setStatus({ jobId, status: e.target.value as JobStatus })}>
      {Object.entries(STATUS_LABELS).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}

export function FindJobs({ tracks }: { tracks: Doc<"tracks">[] }) {
  const findJobs = useAction(api.agent.findJobs);
  const active = tracks.filter((t) => t.status === "active");
  const [trackKey, setTrackKey] = useState(active.length > 1 ? "all" : (active[0]?.key ?? ""));
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div className="card p-5">
      <div className="label mb-3">Find jobs</div>
      <div className="flex flex-wrap gap-2">
        <select className="field !w-auto" value={trackKey} onChange={(e) => setTrackKey(e.target.value)}>
          {active.length > 1 && <option value="all">All roles</option>}
          {active.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          disabled={busy || !trackKey}
          onClick={() =>
            start(async () =>
              setState(
                await attempt(async () => {
                  if (trackKey !== "all") {
                    const { added, trackName } = await findJobs({ trackKey });
                    return added ? `Found ${added} new ${added === 1 ? "job" : "jobs"} for ${trackName}. Score them to see which fit.` : "No new jobs since last time.";
                  }
                  const results = await Promise.allSettled(active.map((t) => findJobs({ trackKey: t.key })));
                  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
                  if (failed.length === results.length) throw failed[0].reason;
                  const added = results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value.added : 0), 0);
                  const note = failed.length ? ` ${failed.length} ${failed.length === 1 ? "role" : "roles"} didn't finish; try again.` : "";
                  return (added ? `Found ${added} new ${added === 1 ? "job" : "jobs"} across your roles. Score them to see which fit.` : "No new jobs since last time.") + note;
                }),
              ),
            )
          }
        >
          {busy && <Spinner />}
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">Searches Dreamwork, Himalayas and any other job board you switch on, for every title on the role, posted in the last 30 days, in the place you chose on the Roles page.</p>
      <div className="mt-1">
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

/** A star that marks a job as a favourite. Favourites sort first, and ask a few questions before their first CV. */
export function FavoriteStar({ jobId, favorite, className = "" }: { jobId: Id<"jobs">; favorite: boolean; className?: string }) {
  const setFavorite = useMutation(api.jobs.setFavorite);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
      title={favorite ? "Favourite: click to remove" : "Add to favourites"}
      disabled={busy}
      className={`text-xl leading-none ${favorite ? "text-accent" : "text-ink-3 hover:text-ink"} ${className}`}
      onClick={async () => {
        setBusy(true);
        try {
          await setFavorite({ jobId, favorite: !favorite });
        } finally {
          setBusy(false);
        }
      }}
    >
      {favorite ? "★" : "☆"}
    </button>
  );
}

type TailorQuestion = { question: string; why: string };

/** Writes the tailored CV, cover letter and hiring-manager note from the CV you pick. */
/** `anyway` is set when the app says to skip this job: the button then says so, and writes past the warning. */
/** For a favourite, the first write asks a few questions first; once a draft exists, you can ask for them to sharpen it. */
export function TailorButton({
  jobId,
  resumes,
  defaultResumeId,
  redo,
  anyway,
  favorite,
}: {
  jobId: Id<"jobs">;
  resumes: { _id: Id<"resumes">; label: string }[];
  defaultResumeId: Id<"resumes"> | null;
  redo: boolean;
  anyway?: boolean;
  favorite?: boolean;
}) {
  const tailor = useAction(api.agent.tailor);
  const getQuestions = useAction(api.agent.tailorQuestions);
  const addFacts = useMutation(api.users.addFacts);
  const [resumeId, setResumeId] = useState(defaultResumeId ?? resumes[0]?._id);
  const [feedback, setFeedback] = useState("");
  // Null until asked for; then the questions shown, with your answers.
  const [questions, setQuestions] = useState<TailorQuestion[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);

  const write = async (letterOnly?: boolean) => {
    await tailor({ jobId, resumeId, feedback: redo ? feedback : undefined, anyway, letterOnly });
    setFeedback("");
    setQuestions(null);
    setAnswers([]);
  };
  /** Fetches the questions; returns how many there are. */
  const ask = async () => {
    setAsking(true);
    try {
      const qs = await getQuestions({ jobId, resumeId });
      setQuestions(qs);
      setAnswers(qs.map(() => ""));
      return qs.length;
    } finally {
      setAsking(false);
    }
  };
  const run = (fn: () => Promise<string | void>) => start(async () => setState(await attempt(fn)));

  const picker = resumes.length > 1 && (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      From
      <select className="field !w-auto !py-1.5 text-sm" value={resumeId} onChange={(e) => setResumeId(e.target.value as Id<"resumes">)}>
        {resumes.map((r) => (
          <option key={r._id} value={r._id}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );

  if (questions?.length) {
    return (
      <div className="w-full space-y-3">
        {picker}
        <p className="text-sm text-ink-2">A few questions first. Answer the ones that apply; the AI keeps your answers for every job, and you can edit them on the CVs page.</p>
        {questions.map((q, i) => (
          <label key={i} className="block">
            <span className="text-sm font-medium">{q.question}</span>
            <textarea className="field mt-1 h-16 text-sm" value={answers[i] ?? ""} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
            <span className="mt-0.5 block text-xs text-ink-3">{q.why}</span>
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !resumeId}
            onClick={() =>
              run(async () => {
                const answered = questions.map((q, i) => ({ question: q.question, answer: (answers[i] ?? "").trim() })).filter((a) => a.answer);
                if (answered.length) await addFacts({ facts: answered });
                await write();
              })
            }
          >
            {busy && <Spinner />}
            {busy ? "Writing… about a minute" : redo ? "Rewrite it" : "Write it"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => (redo ? setQuestions(null) : run(() => write()))}>
            {redo ? "Not now" : "Skip questions"}
          </button>
          <LeftToday kind="cvsLeft" label="tailored CVs" />
          <Feedback state={busy ? null : state} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {picker}
      {redo && (
        <label className="block w-full">
          <span className="label">What should change? (optional)</span>
          <textarea
            className="field mt-1 h-20 text-sm"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Lead with my enterprise deals, make the summary shorter, sound less formal in the cover letter"
          />
        </label>
      )}
      <button
        className={`btn btn-sm ${anyway && !redo ? "btn-ghost" : redo && feedback.trim() ? "btn-primary" : redo ? "btn-ghost" : "btn-primary"}`}
        disabled={busy || asking || !resumeId}
        onClick={() =>
          run(async () => {
            // A favourite's first CV starts with a few questions, unless there's nothing worth asking.
            if (favorite && !redo && questions === null && (await ask())) return;
            await write();
          })
        }
      >
        {(busy || asking) && <Spinner />}
        {asking
          ? "Reading the job…"
          : busy
            ? "Writing… about a minute"
            : redo
              ? feedback.trim()
                ? "Rewrite with my changes"
                : "Write them again"
              : anyway
                ? "Write it anyway"
                : "Write my CV and cover letter"}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || asking || !resumeId} onClick={() => run(() => write(true))}>
        {redo ? "Rewrite just the cover letter" : "Just the cover letter"}
      </button>
      {redo && (
        <button
          type="button"
          className="text-sm text-ink-2 underline hover:text-ink"
          disabled={busy || asking}
          onClick={() => run(async () => ((await ask()) ? undefined : "Nothing to ask: your CV and answers already cover this job."))}
        >
          {asking ? "Reading the job…" : "Answer a few questions to sharpen it"}
        </button>
      )}
      <LeftToday kind="cvsLeft" label="tailored CVs" />
      <Feedback state={busy ? null : state} />
    </div>
  );
}

export function AddJob() {
  const addJob = useAction(api.agent.addJob);
  const tailor = useAction(api.agent.tailor);
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "text">("text");
  const [busy, setBusy] = useState("");
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy("Reading the job…");
        setState(
          await attempt(async () => {
            const id = await addJob({ link: String(form.get("link") ?? "") || undefined, text: String(form.get("text") ?? "") || undefined });
            let cvError = "";
            if (form.get("write")) {
              setBusy("Writing your CV and cover letter… about a minute");
              try {
                await tailor({ jobId: id });
              } catch (err) {
                // The job is saved; its page says why and has the button to try the writing again.
                cvError = errorMessage(err);
              }
            }
            router.push(`/jobs/${id}${cvError ? `?cvError=${encodeURIComponent(cvError)}` : ""}`);
          }),
        );
        setBusy("");
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="label">Paste a job description</span>
        <button type="button" className="text-xs text-ink-3 underline" onClick={() => setMode(mode === "link" ? "text" : "link")}>
          {mode === "link" ? "Paste the description instead" : "Use a link instead"}
        </button>
      </div>
      {mode === "link" ? (
        <input name="link" className="field" placeholder="LinkedIn, Dreamwork or careers page link" />
      ) : (
        <textarea name="text" className="field h-28" placeholder="Paste the whole job post here" />
      )}
      <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" name="write" defaultChecked />
        Also write my tailored CV, cover letter and a note to the hiring manager
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary" disabled={!!busy}>
          {busy && <Spinner />}
          {busy || "Add job"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}

export function CoverLetter({ jobId, text }: { jobId: Id<"jobs">; text: string }) {
  const save = useMutation(api.jobs.saveCoverLetter);
  const [value, setValue] = useState(text);
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div>
      <textarea className="field h-64 leading-relaxed" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <CopyButton text={value} label="Copy cover letter" />
        {value !== text ? (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => start(async () => setState(await attempt(async () => (await save({ jobId, text: value }), "Saved."))))}>
            {busy ? "Saving…" : "Save edits"}
          </button>
        ) : (
          // Application forms usually want the letter as a file, so it opens as a page to save as PDF or Word.
          <Link href={`/jobs/${jobId}/letter`} className="btn btn-ghost btn-sm">
            Download as PDF or Word
          </Link>
        )}
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

type HiringContact = NonNullable<Doc<"jobs">["hiringContacts"]>[number];

/** Swaps the "<first name>" placeholder for a real first name when there is one. */
export function personalise(text: string, name?: string) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? text.replace(/<first name>|<name>/gi, first) : text;
}

/** A written message you can edit, save and copy. */
function SavedText({ jobId, field, text, rows, copyLabel }: { jobId: Id<"jobs">; field: "directNote" | "email"; text: string; rows: string; copyLabel: string }) {
  const save = useMutation(api.jobs.savePackText);
  const [value, setValue] = useState(text);
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div>
      <textarea className={`field ${rows} text-sm leading-relaxed`} value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="mt-2 flex items-center gap-2">
        <CopyButton text={value} label={copyLabel} />
        {value !== text && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => start(async () => setState(await attempt(async () => (await save({ jobId, field, text: value }), "Saved."))))}>
            {busy ? "Saving…" : "Save edits"}
          </button>
        )}
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

export function DirectNote({ jobId, text }: { jobId: Id<"jobs">; text: string }) {
  return <SavedText jobId={jobId} field="directNote" text={text} rows="h-32" copyLabel="Copy note" />;
}

export function EmailDraft({ jobId, subject, body }: { jobId: Id<"jobs">; subject: string; body: string }) {
  const save = useMutation(api.jobs.savePackText);
  const [value, setValue] = useState(subject);
  return (
    <div className="space-y-2">
      <input
        className="field text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== subject && void save({ jobId, field: "emailSubject", text: value })}
        aria-label="Email subject"
      />
      <SavedText jobId={jobId} field="email" text={body} rows="h-56" copyLabel="Copy email" />
    </div>
  );
}

const blankContact = (): HiringContact => ({ id: crypto.randomUUID(), name: "", title: "", linkedinUrl: "", email: "", phone: "" });

/** The people you plan to contact at this company, with one-click LinkedIn, email and phone. */
/** Contacts live on a job, or on a company you're approaching before it posts a role. */
export type ContactOwner = { jobId: Id<"jobs"> } | { prospectId: Id<"prospects"> };

export function HiringContacts({ owner, contacts, note, emailSubject, email }: { owner: ContactOwner; contacts: HiringContact[]; note?: string; emailSubject?: string; email?: string }) {
  const saveForJob = useMutation(api.jobs.saveHiringContacts);
  const saveForProspect = useMutation(api.prospects.saveContacts);
  const jobId = "jobId" in owner ? owner.jobId : null;
  const findEmail = useAction(api.agent.findEmail);
  const canFind = useAction(api.agent.canFindEmails);
  // Reading LinkedIn posts is on the owner's account only, for now.
  const isOwner = useQuery(api.users.me)?.isOwner ?? false;
  const [finderOn, setFinderOn] = useState(false);
  const [finding, setFinding] = useState("");
  useEffect(() => {
    canFind({}).then(setFinderOn, () => {});
  }, [canFind]);
  const [editing, setEditing] = useState<HiringContact | null>(null);
  const [state, setState] = useState<ActionState>(null);
  const store = async (next: HiringContact[]) =>
    setState(await attempt(async () => void (await ("jobId" in owner ? saveForJob({ jobId: owner.jobId, contacts: next }) : saveForProspect({ prospectId: owner.prospectId, contacts: next })))));

  return (
    <div>
      {contacts.length > 0 && (
        <ul className="mb-3 space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-medium">{c.name}</span>
                  {c.title && <span className="text-sm text-ink-2"> · {c.title}</span>}
                </div>
                <div className="flex gap-3 text-xs text-ink-3">
                  <button className="hover:text-ink" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                  <button className="hover:text-ink" onClick={() => window.confirm(`Remove ${c.name}?`) && void store(contacts.filter((x) => x.id !== c.id))}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.linkedinUrl && (
                  <a className="btn btn-ghost btn-sm" href={c.linkedinUrl} target="_blank" rel="noreferrer">
                    LinkedIn profile ↗
                  </a>
                )}
                {c.linkedinUrl && (c.note || note) && <CopyAndOpen text={c.note ?? personalise(note!, c.name)} url={c.linkedinUrl} />}
                {c.email && (
                  <a
                    className="btn btn-ghost btn-sm"
                    href={`mailto:${c.email}?${new URLSearchParams({ subject: c.emailSubject ?? emailSubject ?? "", body: c.email2 ?? personalise(email ?? note ?? "", c.name) }).toString().replace(/\+/g, "%20")}`}
                  >
                    Email {c.email} ↗
                  </a>
                )}
                {c.phone && <CopyButton text={c.phone} label={`Copy ${c.phone}`} />}
                {!c.email && finderOn && jobId && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={!!finding}
                    onClick={async () => {
                      setFinding(c.id);
                      setState(await attempt(async () => {
                        const { email: found, confidence } = await findEmail({ jobId, contactId: c.id });
                        return `Found ${found} (${confidence}% sure).`;
                      }));
                      setFinding("");
                    }}
                  >
                    {finding === c.id ? "Looking up…" : "Find email"}
                  </button>
                )}
              </div>
              <SendTracking contact={c} note={note} email={email} save={(patch) => store(contacts.map((x) => (x.id === c.id ? { ...x, ...patch } : x)))} />
              {c.sentAt && (
                <FollowUpBox
                  thread={{ sentAt: c.sentAt, replied: !!c.repliedAt, followUps: c.followUps }}
                  channel={c.channel ?? "linkedin"}
                  url={c.channel === "email" ? (c.email ? `mailto:${c.email}` : "") : c.linkedinUrl}
                  write={{ ...("jobId" in owner ? { jobId: owner.jobId } : { prospectId: owner.prospectId }), contactId: c.id, kind: "hiring" }}
                  markSent={(index, text) => store(contacts.map((x) => (x.id === c.id ? { ...x, followUps: (x.followUps ?? []).map((f, i) => (i === index ? { ...f, text, sentAt: Date.now() } : f)) } : x)))}
                />
              )}
              {(isOwner || !!c.recentPosts?.length) && <RecentPosts owner={owner} contact={c} canRead={isOwner} />}
              <CommonGround owner={owner} contact={c} />
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <form
          className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const person: HiringContact = {
              ...editing,
              id: editing.id,
              name: String(f.get("name")).trim(),
              title: String(f.get("title")).trim(),
              linkedinUrl: String(f.get("linkedinUrl")).trim(),
              email: String(f.get("email")).trim(),
              phone: String(f.get("phone")).trim(),
            };
            const exists = contacts.some((c) => c.id === person.id);
            await store(exists ? contacts.map((c) => (c.id === person.id ? person : c)) : [...contacts, person]);
            setEditing(null);
          }}
        >
          <input name="name" className="field text-sm" placeholder="Name" defaultValue={editing.name} required />
          <input name="title" className="field text-sm" placeholder="Title, like Head of Sales" defaultValue={editing.title} />
          <input name="linkedinUrl" type="url" className="field text-sm" placeholder="LinkedIn profile link" defaultValue={editing.linkedinUrl} />
          <input name="email" type="email" className="field text-sm" placeholder="Email" defaultValue={editing.email} />
          <input name="phone" className="field text-sm" placeholder="Phone" defaultValue={editing.phone} />
          <div className="flex items-center gap-2">
            <button className="btn btn-primary btn-sm">Save person</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(blankContact())}>
          + Add a person
        </button>
      )}
      <Feedback state={state} />
    </div>
  );
}

/** Whether you've messaged this person yet, how, and whether they wrote back. */
/** Their latest LinkedIn posts, so a message can open with something they actually said. */
function RecentPosts({ owner, contact: c, canRead }: { owner: ContactOwner; contact: HiringContact; canRead: boolean }) {
  const read = useAction(api.agent.readRecentPosts);
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const posts = c.recentPosts ?? [];
  return (
    <div className="mt-2 text-sm">
      {posts.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-ink-2">Their latest posts ({posts.length}). Personalise below uses them.</summary>
          <ul className="mt-2 space-y-2">
            {posts.map((p) => (
              <li key={p.url + p.text.slice(0, 20)} className="rounded-lg bg-soft p-2 text-xs text-ink-2">
                {p.at && <span className="text-ink-3">{new Date(p.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · </span>}
                <span className="line-clamp-4 whitespace-pre-line">{p.text}</span>
                {p.url && (
                  <a className="underline" href={p.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {canRead && c.linkedinUrl && (
        <button
          className="btn btn-ghost btn-sm mt-1"
          disabled={busy}
          onClick={() =>
            start(async () =>
              setState(
                await attempt(async () => {
                  const n = await read({ ...("jobId" in owner ? { jobId: owner.jobId } : { prospectId: owner.prospectId }), contactId: c.id });
                  return n ? `Read ${n} ${n === 1 ? "post" : "posts"}.` : "No public posts found.";
                }),
              ),
            )
          }
        >
          {busy && <Spinner />}
          {busy ? "Reading their posts…" : posts.length ? "Read their posts again" : "Read their recent posts"}
        </button>
      )}
      <Feedback state={busy ? null : state} />
    </div>
  );
}

/** Whether a message asks for something (a call, a chat) or just puts you on their radar, for comparing which gets more replies. */
const asks = (text?: string) => !!text && /\?/.test(text);

function SendTracking({ contact: c, save, note, email }: { contact: HiringContact; save: (patch: Partial<HiringContact>) => Promise<void>; note?: string; email?: string }) {
  if (c.repliedAt) {
    return (
      <p className="mt-2 text-xs text-good">
        Replied {new Date(c.repliedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.{" "}
        <button className="text-ink-3 underline hover:text-ink" onClick={() => void save({ repliedAt: undefined })}>
          Undo
        </button>
      </p>
    );
  }
  if (c.sentAt) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span>
          Sent by {c.channel === "email" ? "email" : "LinkedIn"} {new Date(c.sentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => void save({ repliedAt: Date.now() })}>
          They replied
        </button>
        <button className="underline hover:text-ink" onClick={() => void save({ sentAt: undefined, channel: undefined, asked: undefined, followUps: undefined })}>
          Not sent
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">
      <span>Sent it?</span>
      <button className="btn btn-ghost btn-sm" onClick={() => void save({ sentAt: Date.now(), channel: "linkedin", asked: asks(c.note ?? note) })}>
        Sent on LinkedIn
      </button>
      {c.email && (
        <button className="btn btn-ghost btn-sm" onClick={() => void save({ sentAt: Date.now(), channel: "email", asked: asks(c.email2 ?? email ?? note) })}>
          Sent by email
        </button>
      )}
    </div>
  );
}

type FollowUp = NonNullable<HiringContact["followUps"]>[number];

/** The next follow-up to a message with no reply: when it's due, written on request, then copied and marked sent. */
export function FollowUpBox({
  thread,
  channel,
  url,
  write,
  markSent,
}: {
  thread: { sentAt?: number; replied: boolean; followUps?: FollowUp[] };
  channel: "linkedin" | "email";
  url: string;
  write: { jobId?: Id<"jobs">; prospectId?: Id<"prospects">; contactId: string; kind: "hiring" | "referral" };
  markSent: (index: number, text: string) => Promise<void>;
}) {
  const run = useAction(api.agent.followUp);
  const [now] = useState(() => Date.now());
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const next = nextFollowUp(thread);
  const index = (thread.followUps ?? []).filter((f) => f.sentAt).length;
  const draft = thread.followUps?.[index];
  const [text, setText] = useState(draft?.text ?? "");
  // A new draft from the server replaces what's in the box.
  const [shown, setShown] = useState(draft?.writtenAt);
  if (draft && draft.writtenAt !== shown) {
    setShown(draft.writtenAt);
    setText(draft.text);
  }
  const sentOnes = (thread.followUps ?? []).filter((f) => f.sentAt);
  if (!next) {
    return sentOnes.length && !thread.replied ? <p className="mt-2 text-xs text-ink-3">Both follow-ups sent. Leave this one now: silence is an answer too.</p> : null;
  }
  const days = Math.ceil((next.dueAt - now) / 86_400_000);
  const when = days <= 0 ? "due now" : `due in ${days} ${days === 1 ? "day" : "days"}`;
  const writeIt = () => start(async () => setState(await attempt(async () => void (await run(write)))));
  return (
    <div className={`mt-3 rounded-lg border p-3 ${days <= 0 ? "border-accent" : "border-line"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          Follow-up {next.n} <span className="text-xs font-normal text-ink-3">· {when}</span>
        </span>
        <button className={`btn btn-sm ${draft ? "btn-ghost" : days <= 0 ? "btn-primary" : "btn-ghost"}`} disabled={busy} onClick={writeIt}>
          {busy && <Spinner />}
          {busy ? "Writing…" : draft ? "Write another" : `Write follow-up ${next.n}`}
        </button>
      </div>
      {!draft && <p className="mt-1 text-xs text-ink-3">{next.n === 1 ? "A new reason to reply, not a nudge." : "The last one: short, kind, with an easy out."}</p>}
      {draft && (
        <div className="mt-2">
          {draft.subject && <p className="mb-1 text-xs text-ink-3">Subject: {draft.subject}</p>}
          <textarea className="field h-28 text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {url ? <CopyAndOpen text={text} url={url} label={channel === "email" ? "Copy & open email" : "Copy & open LinkedIn"} /> : <CopyButton text={text} />}
            <button className="btn btn-ghost btn-sm" onClick={() => start(async () => setState(await attempt(async () => void (await markSent(index, text)))))}>
              Mark sent
            </button>
          </div>
        </div>
      )}
      <Feedback state={busy ? null : state} />
    </div>
  );
}

/** How well you know someone, from your loaded LinkedIn chats. */
function ChatLine({ p }: { p: Pick<ContactWithChat, "chat" | "closeness"> }) {
  if (!p.chat) return null;
  const last = new Date(p.chat.lastAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  return (
    <div className="text-xs text-ink-3">
      {CLOSENESS_LABEL[p.closeness]} · {p.chat.messages} {p.chat.messages === 1 ? "message" : "messages"}, last {last}
    </div>
  );
}

export function PeoplePicker({ jobId, people, best }: { jobId: Id<"jobs">; people: ContactWithChat[]; best: number }) {
  const draft = useAction(api.agent.draftNotes);
  const [picked, setPicked] = useState<Id<"contacts">[]>(people.slice(0, best).map((p) => p._id));
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div>
      <ul className="divide-y divide-line">
        {people.map((p, i) => (
          <li key={p._id} className="flex items-center gap-3 py-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#c6ff3d]"
              checked={picked.includes(p._id)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, p._id] : picked.filter((x) => x !== p._id))}
              aria-label={`Ask ${p.firstName}`}
            />
            <div className="min-w-0 flex-1">
              <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {p.firstName} {p.lastName}
              </a>
              <div className="truncate text-xs text-ink-2">{p.position}</div>
              <ChatLine p={p} />
            </div>
            {i < best && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">Best to ask</span>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !picked.length}
          onClick={() =>
            start(async () =>
              setState(
                await attempt(async () => {
                  const { drafted } = await draft({ jobId, contactIds: picked });
                  return `Drafted ${drafted} ${drafted === 1 ? "note" : "notes"}.`;
                }),
              ),
            )
          }
        >
          {busy && <Spinner />}
          {busy ? "Writing notes…" : !picked.length ? "Tick someone to ask" : `Draft ${picked.length} referral ${picked.length === 1 ? "note" : "notes"}`}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

const OUTREACH_FLOW: { status: OutreachStatus; label: string }[] = [
  { status: "sent", label: "Sent" },
  { status: "replied", label: "Replied" },
  { status: "referred", label: "Referred me" },
];

export function OutreachCard({ jobId, o, cvName }: { jobId: Id<"jobs">; o: Outreach; cvName: string }) {
  const setOutreach = useMutation(api.jobs.setOutreach);
  const sendFollowUp = useMutation(api.jobs.sendOutreachFollowUp);
  const [message, setMessage] = useState(o.message);
  const [saved, setSaved] = useState("");
  const sentLabel = o.sentAt ? ` ${new Date(o.sentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "";
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{o.name}</div>
          <div className="text-xs text-ink-2">{o.position}</div>
        </div>
        <span className="text-xs text-ink-3">
          {o.status === "draft" ? "Not sent yet" : o.status === "referred" ? "Referred you" : o.status === "replied" ? "Replied" : `Sent${sentLabel}`}
        </span>
      </div>
      <textarea
        className="field h-36 text-sm leading-relaxed"
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setSaved("");
        }}
      />
      {cvName && <p className="mt-1 text-xs text-ink-3">Attach {cvName} in LinkedIn before you send.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyAndOpen text={message} url={o.url} />
        {message !== o.message && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await setOutreach({ jobId, contactId: o.contactId, status: o.status, message });
              setSaved("Edits saved.");
            }}
          >
            Save edits
          </button>
        )}
        {OUTREACH_FLOW.map((s) => (
          <button
            key={s.status}
            className={`btn btn-sm ${o.status === s.status ? "btn-primary" : "btn-ghost"}`}
            onClick={async () => {
              await setOutreach({ jobId, contactId: o.contactId, status: s.status, message });
              setSaved(`Marked ${s.label.toLowerCase()}.`);
            }}
          >
            {s.label}
          </button>
        ))}
        {saved && <span className="text-xs text-good">{saved}</span>}
      </div>
      {o.status === "sent" && (
        <FollowUpBox
          thread={{ sentAt: o.sentAt, replied: false, followUps: o.followUps }}
          channel="linkedin"
          url={o.url}
          write={{ jobId, contactId: o.contactId, kind: "referral" }}
          markSent={async (index, text) => void (await sendFollowUp({ jobId, contactId: o.contactId, index, text }))}
        />
      )}
    </div>
  );
}

/** What the web says about the company, gathered on request. */
export function CompanyResearch({ jobId, company, research }: { jobId: Id<"jobs">; company: string; research?: Doc<"jobs">["research"] }) {
  const run = useAction(api.agent.research);
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const go = () => start(async () => setState(await attempt(async () => void (await run({ jobId })))));
  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="display text-2xl">About {company}</h2>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={go}>
          {busy && <Spinner />}
          {busy ? "Searching the web…" : research ? "Refresh" : "Look them up"}
        </button>
      </div>
      {!research ? (
        <p className="text-sm text-ink-2">Size, funding, recent news and their India presence, from a quick web search. Worth reading before you message anyone there.</p>
      ) : (
        <dl className="space-y-3 text-sm">
          <p className="leading-relaxed">{research.summary}</p>
          {(
            [
              ["Size", research.size],
              ["Funding", research.funding],
              ["India", research.india],
              ["Why they're hiring", research.hiringSignals],
            ] as const
          ).map(([k, val]) => (
            <div key={k}>
              <dt className="label">{k}</dt>
              <dd className="mt-0.5 text-ink-2">{val}</dd>
            </div>
          ))}
          {research.news.length > 0 && (
            <div>
              <dt className="label">Recent news</dt>
              <dd>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
                  {research.news.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {research.sources.length > 0 && (
            <p className="text-xs text-ink-3">
              Sources:{" "}
              {research.sources.slice(0, 5).map((u, i) => (
                <a key={u} className="underline hover:text-ink" href={u} target="_blank" rel="noreferrer">
                  {i ? ", " : ""}
                  {hostOf(u)}
                </a>
              ))}
              {` · checked ${new Date(research.createdAt).toLocaleDateString("en-IN")}`}
            </p>
          )}
        </dl>
      )}
      <Feedback state={busy ? null : state} />
    </div>
  );
}

/** Likely questions, stories to tell, questions to ask, and a 90-day plan. */
export function InterviewPrep({ jobId, prep }: { jobId: Id<"jobs">; prep?: Doc<"jobs">["prep"] }) {
  const run = useAction(api.agent.prep);
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const go = () => start(async () => setState(await attempt(async () => void (await run({ jobId })))));
  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="display text-2xl">Interview prep</h2>
        <button className={`btn btn-sm ${prep ? "btn-ghost" : "btn-primary"}`} disabled={busy} onClick={go}>
          {busy && <Spinner />}
          {busy ? "Preparing… about a minute" : prep ? "Redo" : "Prepare me"}
        </button>
      </div>
      {!prep ? (
        <p className="text-sm text-ink-2">Likely questions with answer outlines from your CV, four stories to have ready, sharp questions to ask them, and a first-90-days plan.</p>
      ) : (
        <div className="space-y-5 text-sm">
          <details open>
            <summary className="cursor-pointer font-medium">Likely questions</summary>
            <ol className="mt-2 space-y-3">
              {prep.questions.map((q) => (
                <li key={q.question}>
                  <div className="font-medium">{q.question}</div>
                  <div className="text-xs text-ink-3">{q.why}</div>
                  <p className="mt-1 text-ink-2">{q.answer}</p>
                </li>
              ))}
            </ol>
          </details>
          <details>
            <summary className="cursor-pointer font-medium">Stories to have ready</summary>
            <ul className="mt-2 space-y-3">
              {prep.stories.map((st) => (
                <li key={st.title}>
                  <div className="font-medium">{st.title}</div>
                  {st.angle && <p className="text-xs text-accent">For this job: {st.angle}</p>}
                  <p className="text-ink-2">
                    <span className="text-ink-3">Situation: </span>
                    {st.situation}
                  </p>
                  <p className="text-ink-2">
                    <span className="text-ink-3">What you did: </span>
                    {st.action}
                  </p>
                  <p className="text-ink-2">
                    <span className="text-ink-3">Result: </span>
                    {st.result}
                  </p>
                  {st.reflection && (
                    <p className="text-ink-2">
                      <span className="text-ink-3">What you learned: </span>
                      {st.reflection}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-3">
              New stories are saved to your <a className="underline" href="/stories">story bank</a>, so the next interview reuses the ones you already know.
            </p>
          </details>
          <details>
            <summary className="cursor-pointer font-medium">Questions to ask them</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
              {prep.askThem.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </details>
          <details>
            <summary className="cursor-pointer font-medium">Your first 90 days</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
              {prep.first90Days.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <Feedback state={busy ? null : state} />
    </div>
  );
}

/** Paste their profile (and optionally search the web) to find shared ground and get messages written for this one person. */
function CommonGround({ owner, contact }: { owner: ContactOwner; contact: HiringContact }) {
  const forJob = useAction(api.agent.personalise);
  const forProspect = useAction(api.agent.personaliseProspect);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState("");
  const [web, setWeb] = useState(false);
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const first = contact.name.split(/\s+/)[0];
  const go = () =>
    start(async () =>
      setState(
        await attempt(async () => {
          const args = { contactId: contact.id, profileText: profile.trim() || undefined, searchWeb: web };
          await ("jobId" in owner ? forJob({ jobId: owner.jobId, ...args }) : forProspect({ prospectId: owner.prospectId, ...args }));
          setProfile("");
          setOpen(false);
        }),
      ),
    );

  return (
    <div className="mt-3 border-t border-line pt-3 text-sm">
      {contact.commonGround && (
        <div className="mb-3">
          <div className="label mb-1">What you have in common</div>
          {contact.commonGround.length ? (
            <ul className="list-disc space-y-1 pl-5">
              {contact.commonGround.map((g) => (
                <li key={g.point}>
                  {g.point} <span className="text-ink-3">· {g.use}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">Nothing clear in common, so the messages lead with your strongest proof point instead.</p>
          )}
          {contact.note && (
            <details className="mt-2">
              <summary className="cursor-pointer text-ink-2">Note and email written for {first}</summary>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-soft p-3">{contact.note}</p>
              {contact.email2 && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-soft p-3">
                  <span className="font-medium">{contact.emailSubject}</span>
                  {"\n\n"}
                  {contact.email2}
                </p>
              )}
              <p className="mt-1 text-xs text-ink-3">The LinkedIn and email buttons above now use these.</p>
            </details>
          )}
        </div>
      )}
      {!open ? (
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          {contact.commonGround ? "Personalise again" : `Personalise for ${first}`}
        </button>
      ) : (
        <div className="space-y-2">
          <textarea
            className="field h-28 text-sm"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder={`Open ${first}'s LinkedIn profile, copy the About and Experience sections, and paste them here`}
          />
          <label className="flex items-center gap-2 text-ink-2">
            <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} />
            Also search the web for {first}&apos;s talks, posts and articles
          </label>
          <div className="flex items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy || (!profile.trim() && !web && !contact.profileText)} onClick={go}>
              {busy && <Spinner />}
              {busy ? "Finding common ground…" : "Find common ground"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <Feedback state={busy ? null : state} />
    </div>
  );
}

/** A source link's site name; the AI sometimes returns text that isn't a link, which shouldn't break the page. */
function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.slice(0, 40);
  }
}
