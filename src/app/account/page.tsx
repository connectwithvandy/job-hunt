"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { PageHead } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { attempt, Feedback, type ActionState } from "@/components/ui";

export default function Account() {
  const me = useQuery(api.access.mine);
  if (!me) return <Loading />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHead title="Profile" sub="Who you are to JobPipe. Your CVs, roles and form answers live under Setup." />
      <Details me={me} />
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
      <h2 className="display mb-4 text-2xl">Your details</h2>
      <div className="space-y-4">
        <label className="block">
          <span className="label">Name</span>
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} disabled={!me.canEdit} />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input className="field mt-1" value={me.email} disabled />
          <span className="mt-1 block text-xs text-ink-3">You sign in with this. To change it, write to vandana@jobpipe.in.</span>
        </label>
        <label className="block">
          <span className="label">LinkedIn profile link</span>
          <input className="field mt-1" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/your-name" disabled={!me.canEdit} />
        </label>
      </div>
      {me.canEdit ? (
        <div className="mt-5 flex items-center gap-3">
          <button
            className="btn btn-primary btn-sm"
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

function PasswordForm() {
  const change = useAction(api.access.changePassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  return (
    <section className="card p-6">
      <h2 className="display mb-4 text-2xl">Password</h2>
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
          <button className="btn btn-primary btn-sm" disabled={busy || !current || next.length < 8}>
            {busy ? "Changing…" : "Change password"}
          </button>
          <Feedback state={busy ? null : state} />
        </div>
      </form>
    </section>
  );
}
