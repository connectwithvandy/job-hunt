"use client";

// The one-screen way in from a job's Apply link (owner, 26 Nov 2026). Signed out: Google, or email and password.
// Signed in but not set up: the role they want, their CV (read into the form), their name and where they'd work,
// then "See my fit" opens the job inside JobPipe. Nothing is guessed: no country, no role from the job they clicked.
// Pay, notice period, phone and LinkedIn are asked later, when they matter.

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PRESET_TRACKS, type WorkMode } from "../../convex/lib/defaults";
import { errorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/upload";
import { LocationPicker } from "./forms";
import { Spinner } from "./ui";
import { Logo } from "@/components/Sidebar";

type Me = NonNullable<FunctionReturnType<typeof api.users.me>>;
const ALL: WorkMode[] = ["onsite", "hybrid", "remote"];

function JobHeader({ code }: { code: string }) {
  const job = useQuery(api.postedJobs.get, { code });
  if (!job) return null;
  return (
    <p className="card px-5 py-4 text-ink-2">
      Applying to <span className="font-medium text-ink">{job.title}</span> at{" "}
      <span className="font-medium text-ink">{job.company}</span> · {job.where}
    </p>
  );
}

function Frame({
  code,
  children,
}: {
  code: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl px-5 py-10 md:py-14">
      <p className="inline-flex">
        <Logo />
      </p>
      <div className="mt-6">
        <JobHeader code={code} />
      </div>
      {children}
    </div>
  );
}

/** Signed out: one tap with Google, or email and password. */
export function ApplySignUp({ code }: { code: string }) {
  const { signIn } = useAuthActions();
  const googleOn = useQuery(api.access.googleOn);
  const [flow, setFlow] = useState<"signUp" | "signIn">("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Frame code={code}>
      <h1 className="display mt-8 text-4xl leading-tight">
        See how well you fit this role
      </h1>
      <p className="mt-3 text-ink-2">
        Free. Your CV is scored against the job before you apply.
      </p>
      {googleOn && (
        <>
          <button
            type="button"
            className="btn btn-primary mt-8 w-full justify-center"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await signIn("google", { redirectTo: `/apply/${code}` });
              } catch (err) {
                setError(errorMessage(err));
                setBusy(false);
              }
            }}
          >
            Continue with Google
          </button>
          <p className="my-6 text-center text-sm text-ink-3">or with email</p>
        </>
      )}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await signIn("password", { email: email.trim(), password, flow });
          } catch (err) {
            setError(
              flow === "signUp"
                ? `${errorMessage(err)} Already have an account? Sign in instead.`
                : errorMessage(err),
            );
          }
          setBusy(false);
        }}
      >
        <label className="block">
          <span className="label">Email</span>
          <input
            className="field mt-1"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">
            {flow === "signUp" ? "Pick a password" : "Password"}
          </span>
          <input
            className="field mt-1"
            type="password"
            required
            minLength={8}
            autoComplete={
              flow === "signUp" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn btn-ghost w-full justify-center" disabled={busy}>
          {busy && <Spinner />}
          {flow === "signUp" ? "Continue with email" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">
        {flow === "signUp" ? "Already a member? " : "New here? "}
        <button
          type="button"
          className="text-accent underline"
          onClick={() => setFlow(flow === "signUp" ? "signIn" : "signUp")}
        >
          {flow === "signUp" ? "Sign in" : "Create an account"}
        </button>
      </p>
    </Frame>
  );
}

/** Signed in, not set up yet: everything on one screen. */
export function ApplySetup({
  code,
  me,
}: {
  code: string;
  me: Me | null | undefined;
}) {
  const quickJoin = useMutation(api.access.quickJoin);
  const setName = useMutation(api.access.setName);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const readCv = useAction(api.agent.readCv);
  const complete = useMutation(api.users.completeOnboarding);
  const [chosen, setChosen] = useState<string[]>([]);
  const [cvState, setCvState] = useState<"" | "reading" | "done">(
    me?.resume ? "done" : "",
  );
  const [typedName, setTypedName] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [modes, setModes] = useState<WorkMode[]>(ALL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The name comes from the CV once it's read, and stays editable.
  const name = typedName ?? me?.resume?.name ?? "";
  const toggle = (key: string) =>
    setChosen(
      chosen.includes(key)
        ? chosen.filter((k) => k !== key)
        : chosen.length < 8
          ? [...chosen, key]
          : chosen,
    );
  const source = () => {
    try {
      return {
        ref: localStorage.getItem("jobpipeRef") ?? undefined,
        source: localStorage.getItem("jobpipeSource") ?? undefined,
      };
    } catch {
      return {};
    }
  };
  const roleName = PRESET_TRACKS.find((t) => t.key === chosen[0])?.name ?? "";

  const readFile = async (file: File) => {
    if (!chosen.length)
      return setError("Pick the role you want first, then add your CV.");
    setError("");
    setCvState("reading");
    try {
      const s = source();
      const ok = await quickJoin({
        role: roleName,
        ...(s.ref && { ref: s.ref }),
        ...(s.source && { source: s.source }),
      });
      if (!ok)
        throw new Error(
          "We couldn't let you in with this role. Write to vandana@jobpipe.in and we'll sort it.",
        );
      await readCv({
        storageId: (await uploadFile(
          await generateUploadUrl(),
          file,
        )) as Id<"_storage">,
        fileName: file.name,
        replaceId: me?.defaultResumeId ?? undefined,
        label: file.name.replace(/\.[^.]+$/, ""),
      });
      setCvState("done");
    } catch (err) {
      setCvState("");
      setError(errorMessage(err));
    }
  };

  const ready =
    chosen.length > 0 && cvState === "done" && name.trim() && location.trim();
  return (
    <Frame code={code}>
      <h1 className="display mt-8 text-4xl leading-tight">
        See how well you fit
      </h1>
      <p className="mt-3 text-ink-2">
        One screen. We fill in what your CV tells us; you choose the rest.
      </p>

      <section className="mt-8">
        <span className="label">Roles you want</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESET_TRACKS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={chosen.includes(t.key)}
              onClick={() => toggle(t.key)}
              className={`rounded-full border px-4 py-1.5 text-sm ${chosen.includes(t.key) ? "border-accent bg-accent font-medium text-on-accent" : "border-line bg-card text-ink-2 hover:text-ink"}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <span className="label">Your CV</span>
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md"
          disabled={cvState === "reading"}
          className="mt-2 block w-full text-sm text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-soft file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
          }}
        />
        <p className="mt-2 text-xs text-ink-3">
          {cvState === "reading" ? (
            <>
              <Spinner /> Reading your CV… about a minute. Fill in the rest
              meanwhile.
            </>
          ) : cvState === "done" ? (
            "CV read. Check your name below."
          ) : (
            "PDF or Word. No file to hand? On LinkedIn, open your profile, press More, then Save to PDF."
          )}
        </p>
      </section>

      <label className="mt-8 block">
        <span className="label">Your name</span>
        <input
          className="field mt-1"
          value={name}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={cvState === "reading" ? "Filling in from your CV…" : ""}
          autoComplete="name"
        />
      </label>

      <section className="mt-8">
        <span className="label">Where you&apos;d work</span>
        <div className="mt-2">
          <LocationPicker
            value={location}
            modes={modes}
            noDefault
            onChange={(p, m) => (setLocation(p), setModes(m))}
          />
        </div>
      </section>

      {error && <p className="mt-6 text-sm text-bad">{error}</p>}
      <button
        className="btn btn-primary mt-8 w-full justify-center"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await setName({ name: name.trim() });
            await complete({
              tracks: PRESET_TRACKS.filter((t) => chosen.includes(t.key)).map(
                (t) => ({ ...t, status: "active" as const }),
              ),
              location,
              workModes: modes,
            });
            // The app frame now shows the Apply page, which saves the job and opens it with its fit score.
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        {busy && <Spinner />}
        See my fit
      </button>
      {!ready && !busy && (
        <p className="mt-3 text-center text-xs text-ink-3">
          {!chosen.length
            ? "Pick a role"
            : cvState !== "done"
              ? "Add your CV"
              : !name.trim()
                ? "Add your name"
                : "Pick where you'd work"}{" "}
          to continue.
        </p>
      )}
    </Frame>
  );
}
