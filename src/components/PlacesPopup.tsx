"use client";

// Asks people who signed up before several cities were possible where they'd take a job, once.
// Someone in a smaller city often got almost no jobs; adding a big city or two fixes that.

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { LocationPicker } from "./forms";
import { errorMessage } from "@/lib/errors";

export function PlacesPopup({ location }: { location: string }) {
  const save = useMutation(api.users.setLocation);
  const [value, setValue] = useState(location);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const done = async (place: string) => {
    setBusy(true);
    setError("");
    try {
      await save({ location: place });
      setClosed(true);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="places-title">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <h2 id="places-title" className="display text-2xl">
          Where would you take a job?
        </h2>
        <p className="mt-2 text-sm text-ink-2">
          You can now pick more than one city. Smaller cities list few sales roles, so adding a big city or two finds you far more jobs.
        </p>
        <div className="mt-5">
          <LocationPicker value={value} onChange={setValue} />
        </div>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void done(value)}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="text-sm text-ink-3 hover:text-ink" disabled={busy} onClick={() => void done(location)}>
            Keep it as it is
          </button>
        </div>
        <p className="mt-4 text-xs text-ink-3">New searches use this from tomorrow morning. You can change it any time on the Roles page.</p>
      </div>
    </div>
  );
}
