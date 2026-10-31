"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { LOCATION_CHOICES, PRESET_TRACKS } from "../../convex/lib/defaults";
import { autofillBookmarklet } from "@/lib/autofill";
import { parseConnectionsCsv } from "@/lib/connections";
import { myOwnMessages, parseMessagesCsv } from "@/lib/linkedinMessages";
import { errorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/upload";
import { timeAgo } from "./bits";
import type { Resume } from "./ResumeDoc";
import { type ActionState, ActionButton, attempt, Feedback, Spinner } from "./ui";
import { payRange } from "@/lib/money";

const fileClass =
  "text-sm text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-soft file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line";

export function ImportConnections() {
  const clear = useMutation(api.contacts.clearBatch);
  const importBatch = useMutation(api.contacts.importBatch);
  const [busy, setBusy] = useState("");
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const file = new FormData(e.currentTarget).get("file") as File | null;
        setState(
          await attempt(async () => {
            if (!file?.size) throw new Error("Choose your Connections.csv file.");
            const rows = parseConnectionsCsv(await file.text());
            setBusy("Replacing your old list…");
            while (await clear()) {
              // keep deleting until the old list is gone
            }
            for (let i = 0; i < rows.length; i += 400) {
              setBusy(`Loading ${Math.min(i + 400, rows.length).toLocaleString()} of ${rows.length.toLocaleString()}…`);
              try {
                await importBatch({ rows: rows.slice(i, i + 400) });
              } catch (err) {
                // The old list is already gone, so say how far it got rather than leave a silent half list.
                throw new Error(`Only ${i.toLocaleString()} of ${rows.length.toLocaleString()} connections loaded: ${errorMessage(err)} Load the file again to finish.`);
              }
            }
            return `Loaded ${rows.length.toLocaleString()} connections.`;
          }),
        );
        setBusy("");
      }}
    >
      <input type="file" name="file" accept=".csv,text/csv" className={fileClass} />
      <button className="btn btn-primary" disabled={!!busy}>
        {busy && <Spinner />}
        {busy || "Load connections"}
      </button>
      <Feedback state={busy ? null : state} />
    </form>
  );
}

export function ImportChats() {
  const clear = useMutation(api.contacts.clearChats);
  const importChats = useMutation(api.contacts.importChats);
  const setMyMessages = useMutation(api.users.setMyMessages);
  const [busy, setBusy] = useState("");
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const file = new FormData(e.currentTarget).get("file") as File | null;
        setState(
          await attempt(async () => {
            if (!file?.size) throw new Error("Choose your messages.csv file.");
            const text = await file.text();
            const rows = parseMessagesCsv(text);
            setBusy("Replacing your old chats…");
            while (await clear()) {
              // keep deleting until the old chats are gone
            }
            for (let i = 0; i < rows.length; i += 200) {
              setBusy(`Loading ${Math.min(i + 200, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} people…`);
              try {
                await importChats({ rows: rows.slice(i, i + 200) });
              } catch (err) {
                throw new Error(`Only ${i.toLocaleString()} of ${rows.length.toLocaleString()} people loaded: ${errorMessage(err)} Load the file again to finish.`);
              }
            }
            // A few longer messages you wrote yourself, so letters and notes sound like you.
            await setMyMessages({ messages: myOwnMessages(text) });
            return `Loaded your chats with ${rows.length.toLocaleString()} people. Your messages will now sound like the ones you send.`;
          }),
        );
        setBusy("");
      }}
    >
      <input type="file" name="file" accept=".csv,text/csv" className={fileClass} />
      <button className="btn btn-primary" disabled={!!busy}>
        {busy && <Spinner />}
        {busy || "Load chats"}
      </button>
      <Feedback state={busy ? null : state} />
    </form>
  );
}

export function UploadResume({ replace, onAdded }: { replace?: { _id: Id<"resumes">; label: string }; onAdded?: (id: Id<"resumes">) => void }) {
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const setPhoto = useMutation(api.users.setPhoto);
  const readCv = useAction(api.agent.readCv);
  const [busy, setBusy] = useState("");
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="card p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const cv = form.get("cv") as File | null;
        const photo = form.get("photo") as File | null;
        setState(
          await attempt(async () => {
            if (!cv?.size && !photo?.size) throw new Error("Choose your CV file first.");
            if (photo?.size) {
              setBusy("Uploading your photo…");
              await setPhoto({ storageId: (await uploadFile(await generateUploadUrl(), photo)) as Id<"_storage"> });
            }
            if (!cv?.size) return "Photo updated.";
            setBusy("Reading your CV… about a minute");
            const label = String(form.get("label") ?? "").trim() || undefined;
            const { roles, resumeId } = await readCv({ storageId: (await uploadFile(await generateUploadUrl(), cv)) as Id<"_storage">, fileName: cv.name, replaceId: replace?._id, label });
            onAdded?.(resumeId);
            return `Read your CV: ${roles} roles. Check it below and fix anything by hand.`;
          }),
        );
        setBusy("");
      }}
    >
      <h2 className="display mb-1 text-2xl">{replace ? `Replace "${replace.label}"` : "Add another CV"}</h2>
      <p className="mb-5 text-sm text-ink-2">
        PDF or Word. Claude reads it in, keeping every role, bullet and number.
        {replace ? " This replaces the CV below." : " Keep one per angle, like an SDR Leader CV and a GTM CV, and pick which role uses which."}
      </p>
      {!replace && (
        <label className="mb-4 block">
          <span className="label">Name it</span>
          <input name="label" className="field mt-1" placeholder="e.g. GTM Strategy CV" />
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">CV</span>
          <input type="file" name="cv" accept=".pdf,.docx,.txt,.md" className={`mt-2 block w-full ${fileClass}`} />
        </label>
        <label className="block">
          <span className="label">Photo (optional)</span>
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className={`mt-2 block w-full ${fileClass}`} />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={!!busy}>
          {busy && <Spinner />}
          {busy || "Upload"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}

export function ResumeEditor({ resumeId, resume }: { resumeId: Id<"resumes">; resume: Resume }) {
  const save = useMutation(api.users.saveResume);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const json = String(new FormData(e.currentTarget).get("json"));
        setBusy(true);
        setState(
          await attempt(async () => {
            let parsed: Resume;
            try {
              parsed = JSON.parse(json) as Resume;
            } catch (err) {
              throw new Error(`That isn't valid JSON: ${errorMessage(err)}`);
            }
            await save({ resumeId, resume: parsed });
            return "CV saved.";
          }),
        );
        setBusy(false);
      }}
    >
      <textarea name="json" defaultValue={JSON.stringify(resume, null, 2)} spellCheck={false} className="field h-[70vh] font-mono text-xs leading-relaxed" />
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save CV"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}

type TrackInput = Pick<Doc<"tracks">, "key" | "name" | "color" | "status" | "titles" | "pitch" | "company" | "resumeId" | "pay">;

/** One role you want: its job titles to search, the CV it's pitched from, and whether it's searching. */
export function TrackForm({ track, resumes, isNew = false }: { track: TrackInput; resumes: { _id: Id<"resumes">; label: string }[]; isNew?: boolean }) {
  const save = useMutation(api.users.saveTrack);
  const [open, setOpen] = useState(!isNew);
  const [titles, setTitles] = useState(track.titles);
  const [draft, setDraft] = useState("");
  const similar = useAction(api.agent.similarTitles);
  const [ideas, setIdeas] = useState<{ title: string; why: string }[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const addTitle = () => {
    const t = draft.trim();
    if (t && !titles.some((x) => x.toLowerCase() === t.toLowerCase())) setTitles([...titles, t]);
    setDraft("");
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="card flex min-h-40 items-center justify-center border-dashed p-6 text-ink-2 hover:text-ink">
        + Add a role
      </button>
    );
  }
  return (
    <form
      className="card relative space-y-4 overflow-hidden p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const all = draft.trim() ? [...titles, draft.trim()] : titles;
        setBusy(true);
        setState(
          await attempt(async () => {
            await save({
              key: track.key,
              name: String(f.get("name")).trim() || all[0] || "",
              color: track.color,
              status: f.get("active") ? "active" : "paused",
              titles: all,
              pitch: String(f.get("pitch") ?? "").trim(),
              company: String(f.get("company") ?? "").trim() || undefined,
              resumeId: (String(f.get("resumeId") ?? "") || undefined) as Id<"resumes"> | undefined,
            });
            setTitles(all);
            setDraft("");
            return "Saved.";
          }),
        );
        setBusy(false);
      }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: track.color }} />
      {isNew && (
        <div>
          <span className="label">Start from a sales role</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESET_TRACKS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="rounded-full border border-dashed border-line px-3 py-1 text-sm text-ink-2 hover:border-accent hover:text-ink"
                onClick={(e) => {
                  const form = e.currentTarget.form!;
                  (form.elements.namedItem("name") as HTMLInputElement).value = p.name;
                  (form.elements.namedItem("pitch") as HTMLInputElement).value = p.pitch;
                  setTitles(p.titles);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <input name="name" defaultValue={track.name} className="field display !text-xl" placeholder="Role, like Head of Sales Development" />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm">
          <input type="checkbox" name="active" defaultChecked={track.status === "active"} className="h-4 w-4" />
          Searching
        </label>
      </div>
      <div>
        <span className="label">Job titles to search</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {titles.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full border border-line bg-soft px-3 py-1 text-sm">
              {t}
              <button type="button" aria-label={`Remove ${t}`} className="text-ink-3 hover:text-ink" onClick={() => setTitles(titles.filter((x) => x !== t))}>
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          className="field mt-2"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTitle();
            }
          }}
          onBlur={addTitle}
          placeholder="Type a title and press Enter, like BDR Manager"
        />
        {!isNew && (
          <div className="mt-2">
            <button
              type="button"
              className="text-sm text-ink-3 underline hover:text-ink"
              disabled={thinking}
              onClick={async () => {
                setThinking(true);
                setState(await attempt(async () => void setIdeas(await similar({ trackKey: track.key }))));
                setThinking(false);
              }}
            >
              {thinking ? "Finding similar titles…" : "Suggest similar titles"}
            </button>
            {ideas && (
              <div className="mt-2 flex flex-wrap gap-2">
                {ideas
                  .filter((i) => !titles.includes(i.title))
                  .map((i) => (
                    <button
                      key={i.title}
                      type="button"
                      title={i.why}
                      className="rounded-full border border-dashed border-line px-3 py-1 text-sm text-ink-2 hover:border-accent hover:text-ink"
                      onClick={() => setTitles([...titles, i.title])}
                    >
                      + {i.title}
                    </button>
                  ))}
                <span className="w-full text-xs text-ink-3">Tap to add, then Save.</span>
                <ul className="w-full space-y-1 text-xs text-ink-3">
                  {ideas
                    .filter((i) => !titles.includes(i.title))
                    .map((i) => (
                      <li key={i.title}>
                        <span className="text-ink-2">{i.title}:</span> {i.why}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      {!isNew && <PayLine trackKey={track.key} pay={track.pay} />}
      {resumes.length > 0 && (
        <label className="block">
          <span className="label">Pitch from this CV</span>
          <select name="resumeId" defaultValue={track.resumeId ?? ""} className="field mt-1">
            <option value="">Your default CV</option>
            {resumes.map((r) => (
              <option key={r._id} value={r._id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-ink-2">More options</summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="label">How you want to come across</span>
            <input name="pitch" defaultValue={track.pitch} className="field mt-1" placeholder="e.g. Builds SDR teams that hit pipeline targets" />
          </label>
          <label className="block">
            <span className="label">Only this company (for an internal move)</span>
            <input name="company" defaultValue={track.company ?? ""} className="field mt-1" placeholder="Leave empty to search everywhere" />
          </label>
        </div>
      </details>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Saving…" : isNew ? "Add role" : "Save"}
        </button>
        {isNew && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}

/** What to ask for in this role, researched on the web when you press the button. */
function PayLine({ trackKey, pay }: { trackKey: string; pay?: TrackInput["pay"] }) {
  const estimate = useAction(api.agent.estimateRolePay);
  return (
    <div className="rounded-lg bg-soft p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="label mr-2">Pay to ask for</span>
          {pay ? <b>{payRange(pay)}</b> : <span className="text-ink-3">Not checked yet</span>}
        </span>
        <ActionButton size="sm" variant="ghost" pending="Checking salaries…" run={async () => void (await estimate({ trackKey }))}>
          {pay ? "Check again" : "Estimate my pay"}
        </ActionButton>
      </div>
      {pay && <p className="mt-1 text-xs text-ink-2">{pay.basis}</p>}
    </div>
  );
}

/** Quick picks for where to search, plus a box for any city or country. */
export function LocationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isChoice = (v: string) => LOCATION_CHOICES.some((c) => c.value.toLowerCase() === v.trim().toLowerCase());
  // What you typed stays in the box, even when it starts like a quick pick ("India, Pune").
  const [typed, setTyped] = useState(() => (isChoice(value) ? "" : value));
  const picked = typed ? undefined : LOCATION_CHOICES.find((c) => c.value.toLowerCase() === value.trim().toLowerCase());
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {LOCATION_CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => {
              setTyped("");
              onChange(c.value);
            }}
            aria-pressed={picked === c}
            className={`rounded-full border px-4 py-1.5 text-sm ${picked === c ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}
          >
            {c.value}
          </button>
        ))}
      </div>
      <input
        className="field mt-3 max-w-sm"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          onChange(e.target.value);
        }}
        placeholder="Or type a city or country, like Bengaluru"
      />
      <p className="mt-2 text-xs text-ink-3">{picked ? picked.hint : "Jobs there, plus remote jobs open to that place"}</p>
    </div>
  );
}

export function LocationForm({ location, markets }: { location: string; markets: string }) {
  const save = useMutation(api.users.setLocation);
  const saveMarkets = useMutation(api.users.setMarkets);
  const [value, setValue] = useState(location);
  const [pref, setPref] = useState(markets);
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="card p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setState(await attempt(async () => (await Promise.all([save({ location: value }), saveMarkets({ markets: pref })]), "Saved.")));
      }}
    >
      <span className="label mb-3 block">Where you want to work</span>
      <LocationPicker value={value} onChange={setValue} />
      <label className="mt-4 block">
        <span className="label">Markets and time zones you prefer</span>
        <input className="field mt-1" value={pref} onChange={(e) => setPref(e.target.value)} placeholder="e.g. APAC and EMEA first, North America second" />
        <span className="mt-1 block text-xs text-ink-3">Fit scores rank jobs covering your preferred markets higher.</span>
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn btn-primary btn-sm">Save</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

const STARTER_QUESTIONS = [
  // Contact
  "Full name",
  "Email",
  "Phone",
  "Current location",
  "LinkedIn profile",
  // Current job
  "Current company",
  "Current job title",
  "Total years of experience",
  "Years managing teams",
  "Largest team managed",
  "Notice period",
  "Can you buy out or shorten your notice?",
  "Earliest start date",
  // Pay
  "Current CTC (fixed + variable)",
  "Expected CTC",
  "Current quota and attainment",
  "Largest deal closed",
  // Experience
  "Industries you've sold into",
  "Markets covered",
  "Sales tools and CRMs you use",
  "Biggest professional achievement",
  // Eligibility and preferences
  "Work authorization",
  "Need visa sponsorship?",
  "Willing to relocate?",
  "Preferred work mode",
  "Comfortable working US or EMEA hours?",
  "Willing to travel?",
  // Motivation
  "Why are you looking to move?",
  "What are you looking for in your next role?",
  "Reason for any career gap",
  "How did you hear about us?",
  // Education
  "Highest degree",
  "University",
  "Graduation year",
];

/** Answers that only depend on where you'll work, filled in from your Roles page. */
function presetAnswers(location: string): Record<string, string> {
  const city = location.trim();
  if (!city || /^(remote|anywhere|india)$/i.test(city)) return {};
  return { "Willing to relocate?": `No. ${city} or remote only.`, "Preferred work mode": `Remote, or hybrid in ${city}` };
}

/** Your standard answers for application forms, written once and copied in one click. */
export function AnswersForm({
  answers,
  location,
  onChange,
}: {
  answers: { question: string; answer: string }[];
  location: string;
  /** Hears every edit, so onboarding can save answers typed but not yet saved. */
  onChange?: (rows: { question: string; answer: string }[]) => void;
}) {
  const save = useMutation(api.users.saveAnswers);
  const draft = useAction(api.agent.draftAnswers);
  const [drafting, setDrafting] = useState(false);
  const [rows, setRowsState] = useState(() => {
    const have = new Set(answers.map((a) => a.question));
    return [...answers, ...STARTER_QUESTIONS.filter((q) => !have.has(q)).map((q) => ({ question: q, answer: presetAnswers(location)[q] ?? "" }))];
  });
  const setRows = (next: { question: string; answer: string }[]) => {
    setRowsState(next);
    onChange?.(next);
  };
  // The starting rows (pre-filled answers included) count as typed, even if never touched.
  useEffect(() => {
    onChange?.(rows);
    // Once, on mount: later changes go through setRows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const set = (i: number, k: "question" | "answer", val: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  return (
    <div className="card p-6">
      <h2 className="display mb-1 text-2xl">Application answers</h2>
      <p className="mb-4 text-sm text-ink-2">The questions every form asks. Write them once; each job&apos;s Apply step and the chat use them.</p>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
            <input className="field text-sm" value={r.question} onChange={(e) => set(i, "question", e.target.value)} placeholder="Question" />
            <textarea className="field min-h-[42px] text-sm" rows={r.answer.length > 80 ? 3 : 1} value={r.answer} onChange={(e) => set(i, "answer", e.target.value)} placeholder="Your answer" />
            <button type="button" aria-label="Remove" className="text-ink-3 hover:text-ink" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows([...rows, { question: "", answer: "" }])}>
          + Add a question
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={drafting}
          onClick={async () => {
            setDrafting(true);
            setState(
              await attempt(async () => {
                const empty = rows.filter((r) => r.question.trim() && !r.answer.trim()).map((r) => r.question);
                const drafts = await draft({ questions: empty });
                const byQ = new Map(drafts.map((d) => [d.question, d.answer]));
                setRows(rows.map((r) => (!r.answer.trim() && byQ.get(r.question) ? { ...r, answer: byQ.get(r.question)! } : r)));
                return `Filled ${drafts.length} from your CV. Check them, then save.`;
              }),
            );
            setDrafting(false);
          }}
        >
          {drafting ? "Reading your CV…" : "Fill from my CV"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setState(await attempt(async () => (await save({ answers: rows.filter((r) => r.question.trim() && r.answer.trim()) }), "Saved.")));
            setBusy(false);
          }}
        >
          {busy ? "Saving…" : "Save answers"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

/** What you told the AI that your CV doesn't say, from the questions before tailoring. Every tailored CV and letter uses it. */
export function FactsForm({ facts }: { facts: { question: string; answer: string; at: number }[] }) {
  const save = useMutation(api.users.setFacts);
  const [rows, setRows] = useState<{ question: string; answer: string; at?: number }[]>(() => facts);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const set = (i: number, k: "question" | "answer", val: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  return (
    <div className="card p-6">
      <h2 className="display mb-1 text-2xl">What the AI knows beyond your CV</h2>
      <p className="mb-4 text-sm text-ink-2">
        Your answers to the questions asked before writing a CV, like how many managers you&apos;ve led. Every tailored CV and cover letter can use them as facts, numbers included, so keep them true.
      </p>
      {rows.length === 0 && <p className="mb-3 text-sm text-ink-3">Nothing yet. Star a job and write its CV to be asked a few questions, or add one here.</p>}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
            <input className="field text-sm" value={r.question} onChange={(e) => set(i, "question", e.target.value)} placeholder="Question or topic" />
            <textarea className="field min-h-[42px] text-sm" rows={r.answer.length > 80 ? 3 : 1} value={r.answer} onChange={(e) => set(i, "answer", e.target.value)} placeholder="Your answer" />
            <button type="button" aria-label="Remove" className="text-ink-3 hover:text-ink" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ghost btn-sm" disabled={rows.length >= 40} onClick={() => setRows([...rows, { question: "", answer: "" }])}>
          + Add a fact
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setState(await attempt(async () => (await save({ facts: rows.filter((r) => r.answer.trim()) }), "Saved.")));
            setBusy(false);
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </div>
  );
}

/** The draggable autofill bookmark, carrying your saved answers. Re-drag it after changing them. */
export function AutofillLink({ answers }: { answers: { question: string; answer: string }[] }) {
  const ref = useRef<HTMLAnchorElement>(null);
  // React refuses javascript: links in JSX, so the address is set on the element directly.
  useEffect(() => {
    ref.current?.setAttribute("href", autofillBookmarklet(answers));
  }, [answers]);
  return (
    <div className="card p-6">
      <h2 className="display mb-1 text-2xl">Autofill application forms</h2>
      <p className="mb-2 text-sm text-warn md:hidden">Set this up on your computer: phone browsers can&apos;t drag bookmarks.</p>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-ink-2">
        <li>Show your browser&apos;s bookmarks bar (Cmd+Shift+B in Chrome).</li>
        <li>Drag the button below onto it.</li>
        <li>On any application form (Greenhouse, Lever, Ashby, Workday and others), click the bookmark. Filled fields turn green; check them and upload your CV yourself.</li>
      </ol>
      <a ref={ref} className="btn btn-primary inline-flex cursor-grab" onClick={(e) => e.preventDefault()} draggable>
        JobPipe autofill
      </a>
      <p className="mt-3 text-xs text-ink-3">
        It carries your {answers.length} saved answers and sends nothing anywhere. After you change an answer, drag it again to replace the old bookmark.
      </p>
    </div>
  );
}

/** A few things you wrote yourself, so cover letters and messages sound like you. */
export function WritingSampleForm({ sample, rules, posts, myMessagesCount }: { sample: string; rules: string; posts: string; myMessagesCount: number }) {
  const save = useMutation(api.users.setWritingSample);
  const [value, setValue] = useState(sample);
  const [myRules, setMyRules] = useState(rules);
  const [myPosts, setMyPosts] = useState(posts);
  const [state, setState] = useState<ActionState>(null);
  return (
    <form
      className="card p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setState(await attempt(async () => (await save({ sample: value, rules: myRules, posts: myPosts }), "Saved. New CVs, letters and messages will use it.")));
      }}
    >
      <span className="label block">How you write</span>
      <p className="mt-1 text-sm text-ink-2">
        Paste two or three things you wrote yourself: an email to a client, a LinkedIn post, a message to a colleague. Cover letters, referral notes and
        emails will copy your style. Only your style is used; facts still come from your CV.
      </p>
      <textarea className="field mt-3 h-40 text-sm" value={value} maxLength={4000} onChange={(e) => setValue(e.target.value)} placeholder="Hi Priya, thanks for the time today..." />
      <label className="mt-4 block">
        <span className="label">Your LinkedIn posts</span>
        <span className="mt-1 block text-sm text-ink-2">
          Paste three or four posts you wrote. Notes and emails pick up your personality from them: your energy, your humour, the way you make a point.
          {myMessagesCount > 0
            ? ` They also use ${myMessagesCount} messages you sent on LinkedIn, from your chats file.`
            : " Loading your LinkedIn chats under People adds the messages you send too."}
        </span>
        <textarea
          className="field mt-2 h-40 text-sm"
          value={myPosts}
          maxLength={6000}
          onChange={(e) => setMyPosts(e.target.value)}
          placeholder="Hiring an SDR is easy. Keeping one past month three is the real job..."
        />
      </label>
      <label className="mt-4 block">
        <span className="label">Your rules</span>
        <span className="mt-1 block text-sm text-ink-2">Anything every tailored CV, letter and message should or shouldn&apos;t do, one per line.</span>
        <textarea
          className="field mt-2 h-24 text-sm"
          value={myRules}
          maxLength={1500}
          onChange={(e) => setMyRules(e.target.value)}
          placeholder={"Never call me an Account Executive\nNever mention my notice period\nOne ask only, a 15-minute call"}
        />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary btn-sm">Save</button>
        <span className="text-xs text-ink-3">{value.length} / 4000</span>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** The Gmail script, with this person's private code and the app's address baked in. */
function gmailScript(token: string, endpoint: string) {
  return `// JobPipe: reads recruiting emails from the last 2 days and moves your jobs along.
// Only emails mentioning applications, interviews, offers or rejections are sent.
// Once a day after 9:00 (India time) it also emails you a short summary from JobPipe.
// It also reads your calendar from yesterday to three weeks ahead. JobPipe keeps only meetings
// with a company you're applying to, and drops the rest. Set CALENDAR to false to leave it out.
const TOKEN = "${token}";
const ENDPOINT = "${endpoint}";
const DAILY_SUMMARY = true;
const CALENDAR = true;

// First in the file, so Google's Run button runs it. Run it once: it checks every hour from then on.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sync").timeBased().everyHours(1).create();
  sync();
}

function calendarEvents() {
  const now = Date.now();
  return CalendarApp.getDefaultCalendar().getEvents(new Date(now - 86400000), new Date(now + 21 * 86400000)).slice(0, 200).map(function (e) {
    const notes = e.getDescription() || "";
    const link = (notes.match(/https:\\/\\/(meet\\.google\\.com|[\\w.-]*zoom\\.us|teams\\.microsoft\\.com)\\/[^\\s"<]+/) || [""])[0];
    return {
      // A repeating meeting shares one id, so its start time tells the meetings apart.
      id: e.getId() + "@" + e.getStartTime().getTime(),
      title: e.getTitle(),
      start: e.getStartTime().toISOString(),
      end: e.getEndTime().toISOString(),
      description: notes.slice(0, 1000),
      guests: e.getGuestList().map(function (g) { return g.getEmail(); }),
      link: link || e.getLocation() || "",
    };
  });
}

function sync() {
  const query = 'newer_than:2d -in:sent -category:promotions -category:social ' +
    '(application OR applying OR interview OR offer OR unfortunately OR candidacy OR recruiter OR "next steps")';
  // LinkedIn emails you when someone messages you; recruiters often write there first.
  const linkedIn = 'newer_than:2d from:(messages-noreply@linkedin.com OR inmail-hit-reply@linkedin.com OR hit-reply@linkedin.com)';
  const messages = [];
  GmailApp.search(query, 0, 50).concat(GmailApp.search(linkedIn, 0, 30)).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      messages.push({ id: m.getId(), from: m.getFrom(), subject: m.getSubject(), snippet: m.getPlainBody().slice(0, 1500), date: m.getDate().toISOString() });
    });
  });
  const body = { token: TOKEN, messages: messages, digest: DAILY_SUMMARY };
  if (CALENDAR) body.events = calendarEvents();
  const res = UrlFetchApp.fetch(ENDPOINT, { method: "post", contentType: "application/json", payload: JSON.stringify(body), muteHttpExceptions: true });
  let reply = {};
  try { reply = JSON.parse(res.getContentText()); } catch (e) {}
  if (reply.digest) GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), reply.digest.subject, reply.digest.text);
}

`;
}

/** One button to Google's permission page; after that JobPipe reads recruiting emails and meetings every hour. */
function ConnectGmail({ connected, email, inboxAt, onScript }: { connected: boolean; email: string; inboxAt: number | null; onScript: () => void }) {
  const start = useMutation(api.google.start);
  const disconnect = useAction(api.google.disconnect);
  const [busy, setBusy] = useState(false);
  // Google sends people back here with ?gmail=connected or ?gmail=error.
  const [failed] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("gmail") === "error");
  if (connected) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-good">
          Gmail connected{email ? ` (${email})` : ""}
          {inboxAt ? `, last checked ${timeAgo(inboxAt)}` : ", checking now"}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await disconnect({}).catch(() => {});
            setBusy(false);
          }}
        >
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <div className="card space-y-3 p-5 text-sm">
      <div>
        <div className="font-medium">Get recruiter replies here automatically</div>
        <p className="text-ink-2">Replies and interview invites move your jobs along by themselves, checked every hour.</p>
      </div>
      {failed && <p className="text-bad">That didn&apos;t connect. Try again, and tick both boxes on Google&apos;s page.</p>}
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          window.location.href = await start({});
        }}
      >
        {busy ? "Opening Google…" : "Connect Gmail"}
      </button>
      <p className="text-ink-3">
        Google may say it hasn&apos;t checked JobPipe yet: click <b>Advanced</b>, then <b>Go to JobPipe</b>, then <b>Allow</b>.
      </p>
      <details className="text-ink-2">
        <summary className="cursor-pointer underline">What does it read? Is it safe?</summary>
        <div className="mt-2 space-y-1">
          <p>
            JobPipe only reads. It looks at recruiting emails and LinkedIn message alerts from the last two days, and your calendar for the next three weeks,
            keeping only meetings with companies you&apos;re applying to. It can&apos;t send, delete or change anything.
          </p>
          <p>
            Disconnect here anytime, or at{" "}
            <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              myaccount.google.com/permissions
            </a>
            .
          </p>
        </div>
      </details>
      <button type="button" className="text-ink-3 underline" onClick={onScript}>
        Use a Google Script instead
      </button>
    </div>
  );
}

/** Sets up the Gmail script that moves jobs along when recruiters write back. */
export function GmailSync() {
  const getToken = useMutation(api.inbox.token);
  const me = useQuery(api.users.me);
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);
  const endpoint = (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(".convex.cloud", ".convex.site") + "/inbox";
  // The script checks in every hour, so more than three hours of quiet means it stopped.
  const [now] = useState(() => Date.now());
  const inboxAt = me?.inboxAt ?? null;
  const live = inboxAt !== null && now - inboxAt < 3 * 3_600_000;
  const google = useQuery(api.google.status);
  // With Connect Gmail set up, that's the way in; the script stays for whoever already uses it.
  if (google?.available && !script) {
    return <ConnectGmail connected={google.connected} email={google.email} inboxAt={inboxAt} onScript={async () => setScript(gmailScript((await getToken()) ?? "", endpoint))} />;
  }
  if (!script) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-sm ${live ? "text-good" : "text-ink-2"}`}>
          {live ? `Gmail connected, last checked ${timeAgo(inboxAt)}` : inboxAt ? `Gmail stopped checking ${timeAgo(inboxAt)}. Run setup in the script again.` : "Gmail isn't connected yet."}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={async () => setScript(gmailScript((await getToken()) ?? "", endpoint))}>
          {inboxAt ? "Show the Gmail script" : "Track replies and get a morning email"}
        </button>
      </div>
    );
  }
  return (
    <div className="card space-y-4 p-5 text-sm">
      <div>
        <div className="font-medium">Get recruiter replies here automatically</div>
        <p className="text-ink-2">Two minutes, once. It runs inside your own Gmail.</p>
      </div>
      <ol className="space-y-3">
        <li className="flex flex-wrap items-center gap-3">
          <span className="text-ink-3">1.</span>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              await navigator.clipboard.writeText(script);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy the code"}
          </button>
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <span className="text-ink-3">2.</span>
          <a className="btn btn-ghost btn-sm" href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">
            Open Google Script
          </a>
          <span className="text-ink-2">Select everything there, paste, and press Save.</span>
        </li>
        <li className="flex flex-wrap items-baseline gap-3">
          <span className="text-ink-3">3.</span>
          <span className="text-ink-2">
            Press <b>Run</b>. Google asks for permission: click <b>Advanced</b>, then <b>Go to Untitled project</b>, then <b>Allow</b>.
          </span>
        </li>
      </ol>
      <p className="text-ink-2">Done. This page will say &quot;Gmail connected&quot; within a minute.</p>
      <details className="text-ink-2">
        <summary className="cursor-pointer underline">What does it read? Is it safe?</summary>
        <div className="mt-2 space-y-1">
          <p>
            Google warns because the code is yours, not an app Google has reviewed. It runs in your own account and sends JobPipe only recruiting emails
            from the last two days, plus your calendar for the next three weeks, where JobPipe keeps only meetings with companies you&apos;re applying to.
          </p>
          <p>Replies and interview invites move your jobs along, and each morning after 9:00 you get a short summary email from yourself.</p>
          <p>
            Turn it off anytime at{" "}
            <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              myaccount.google.com/permissions
            </a>{" "}
            or by deleting the script.
          </p>
        </div>
      </details>
      <details className="text-ink-2">
        <summary className="cursor-pointer underline">See the code</summary>
        <p className="mt-2">Keep it private: it lets the script update your jobs.</p>
        <textarea readOnly className="field mt-2 h-40 font-mono text-xs" value={script} />
      </details>
    </div>
  );
}
