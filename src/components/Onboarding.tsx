"use client";

import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CUSTOM_COLORS, PRESET_TRACKS } from "../../convex/lib/defaults";
import { errorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/upload";
import { LocationPicker } from "./forms";
import { Spinner } from "./ui";

type Me = NonNullable<FunctionReturnType<typeof api.users.me>>;
type Choice = { key: string; name: string; color: string; titles: string[]; pitch: string };

const fileClass =
  "mt-2 block w-full text-sm text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-soft file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line";

export function Onboarding({ me }: { me: Me }) {
  const [step, setStep] = useState<1 | 2 | 3>(me.resume ? 2 : 1);
  const [chosen, setChosen] = useState<Choice[]>([]);
  const [location, setLocation] = useState(me.location || "India");

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:py-20">
      <p className="display text-sm uppercase tracking-wide">
        JobPipe<span className="text-accent">.</span>
      </p>
      <ol className="mt-8 flex gap-2" aria-label="Progress">
        {[1, 2, 3].map((n) => (
          <li key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-accent" : "bg-line"}`} />
        ))}
      </ol>
      {step === 1 && <StepCv me={me} onDone={() => setStep(2)} />}
      {step === 2 && <StepRoles chosen={chosen} setChosen={setChosen} onBack={() => setStep(1)} onDone={() => setStep(3)} />}
      {step === 3 && <StepWhere location={location} setLocation={setLocation} chosen={chosen} onBack={() => setStep(2)} />}
    </div>
  );
}

function StepCv({ me, onDone }: { me: Me; onDone: () => void }) {
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const setPhoto = useMutation(api.users.setPhoto);
  const readCv = useAction(api.agent.readCv);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="mt-10"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const cvs = (form.getAll("cv") as File[]).filter((f) => f.size);
        const photo = form.get("photo") as File | null;
        if (!cvs.length && !me.resume) return setError("Choose your CV file first.");
        if (cvs.length > 5) return setError("Pick up to 5 CVs for now. You can add more later on the CVs page.");
        setError("");
        try {
          if (photo?.size) {
            setBusy("Uploading your photo…");
            await setPhoto({ storageId: (await uploadFile(await generateUploadUrl(), photo)) as Id<"_storage"> });
          }
          const read = async (cv: File, replaceId?: Id<"resumes">) =>
            readCv({
              storageId: (await uploadFile(await generateUploadUrl(), cv)) as Id<"_storage">,
              fileName: cv.name,
              replaceId,
              label: cv.name.replace(/\.[^.]+$/, ""),
            });
          if (cvs.length) {
            setBusy(cvs.length > 1 ? `Reading your ${cvs.length} CVs… a minute or two` : "Reading your CV… about a minute");
            // The first file becomes the main CV; the rest are added beside it.
            await read(cvs[0], me.defaultResumeId ?? undefined);
            const results = await Promise.allSettled(cvs.slice(1).map((cv) => read(cv)));
            const failed = cvs.slice(1).filter((_, i) => results[i].status === "rejected");
            if (failed.length) {
              const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
              throw new Error(`Couldn't read ${failed.map((f) => f.name).join(", ")}: ${errorMessage(first.reason)} The others are saved.`);
            }
          }
          onDone();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy("");
        }
      }}
    >
      <h1 className="display text-4xl md:text-5xl">First, your CV.</h1>
      <p className="mt-3 text-ink-2">
        PDF or Word. Claude reads it into a master CV with every role, bullet and number. Each job later gets a tailored copy, and nothing gets invented.
      </p>
      <div className="card mt-8 grid gap-6 p-6 sm:grid-cols-2">
        <label className="block">
          <span className="label">Your CVs</span>
          <input type="file" name="cv" multiple accept=".pdf,.docx,.txt,.md" className={fileClass} />
          <span className="mt-2 block text-xs text-ink-3">Have more than one angle? Pick them all. The first becomes your main CV.</span>
        </label>
        <label className="block">
          <span className="label">Photo (optional)</span>
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className={fileClass} />
        </label>
      </div>
      {error && <p className="mt-4 text-sm text-bad">{error}</p>}
      <div className="mt-8 flex items-center gap-4">
        <button className="btn btn-primary" disabled={!!busy}>
          {busy && <Spinner />}
          {busy || "Continue"}
        </button>
        {me.resume && !busy && (
          <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={onDone}>
            Keep the CV I already uploaded
          </button>
        )}
      </div>
    </form>
  );
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "track";
}

function StepRoles({ chosen, setChosen, onBack, onDone }: { chosen: Choice[]; setChosen: (c: Choice[]) => void; onBack: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [titles, setTitles] = useState("");
  const custom = chosen.filter((c) => !PRESET_TRACKS.some((p) => p.key === c.key));
  const toggle = (c: Choice) => setChosen(chosen.some((x) => x.key === c.key) ? chosen.filter((x) => x.key !== c.key) : [...chosen, c]);

  return (
    <div className="mt-10">
      <h1 className="display text-4xl md:text-5xl">What are you going for?</h1>
      <p className="mt-3 text-ink-2">
        Pick every kind of role you&apos;d take. Each becomes a <span className="text-ink">role</span> with its own search and its own CV. You can change them anytime.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {PRESET_TRACKS.map((t) => {
          const on = chosen.some((c) => c.key === t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => toggle(t)}
              className={`card relative overflow-hidden p-5 text-left transition-colors ${on ? "border-accent" : "hover:border-ink-3"}`}
              aria-pressed={on}
            >
              <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: t.color }} />
              <div className="flex items-center justify-between gap-2">
                <span className="display text-lg">{t.name}</span>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${on ? "border-accent bg-accent text-on-accent" : "border-line"}`}>{on ? "✓" : ""}</span>
              </div>
              <p className="mt-2 text-sm text-ink-2">{t.titles.slice(0, 3).join(", ")}</p>
            </button>
          );
        })}
        {custom.map((t) => (
          <button key={t.key} type="button" onClick={() => toggle(t)} className="card border-accent p-5 text-left" aria-pressed>
            <div className="flex items-center justify-between gap-2">
              <span className="display text-lg">{t.name}</span>
              <span className="text-xs text-ink-3">Remove</span>
            </div>
            <p className="mt-2 text-sm text-ink-2">{t.titles.join(", ")}</p>
          </button>
        ))}
      </div>

      <div className="card mt-6 p-5">
        <div className="label mb-3">Something else? Add your own</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
          <input className="field" placeholder="Name, e.g. Customer Success" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field" placeholder="Job titles, comma separated" value={titles} onChange={(e) => setTitles(e.target.value)} />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!name.trim() || !titles.trim()}
            onClick={() => {
              const t = titles.split(",").map((s) => s.trim()).filter(Boolean);
              setChosen([...chosen, { key: `${slug(name)}-${chosen.length}`, name: name.trim(), color: CUSTOM_COLORS[custom.length % CUSTOM_COLORS.length], titles: t, pitch: "" }]);
              setName("");
              setTitles("");
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button className="btn btn-primary" disabled={!chosen.length} onClick={onDone}>
          Continue with {chosen.length || "no"} {chosen.length === 1 ? "role" : "roles"}
        </button>
        <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function StepWhere({ location, setLocation, chosen, onBack }: { location: string; setLocation: (l: string) => void; chosen: Choice[]; onBack: () => void }) {
  const complete = useMutation(api.users.completeOnboarding);
  const findJobs = useAction(api.agent.findJobs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="mt-10">
      <h1 className="display text-4xl md:text-5xl">Where do you want to work?</h1>
      <p className="mt-3 text-ink-2">Pick one, or type a city or country.</p>
      <div className="mt-8">
        <LocationPicker value={location} onChange={setLocation} />
      </div>
      {error && <p className="mt-4 text-sm text-bad">{error}</p>}
      <div className="mt-8 flex items-center gap-4">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await complete({ tracks: chosen.map((c) => ({ ...c, status: "active" as const })), location });
              // Start the first searches; results stream into the Jobs page as they land.
              for (const c of chosen) void findJobs({ trackKey: c.key }).catch(() => {});
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          {busy && <Spinner />}
          {busy ? "Setting up…" : "Find my first jobs"}
        </button>
        <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
