"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Loading } from "@/components/Loading";
import { errorMessage } from "@/lib/errors";

/** What JobPipe does on its own each morning and what it emails you, each with one switch. */
export default function Notifications() {
  const me = useQuery(api.users.me);
  const account = useQuery(api.access.mine);
  const setAutopilot = useMutation(api.users.setAutopilot);
  const setAlerts = useMutation(api.access.setAlerts);
  const [error, setError] = useState("");
  if (!me || !account) return <Loading />;
  const run = async (f: () => Promise<unknown>) => {
    setError("");
    try {
      await f();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Notifications</h1>
      <p className="mb-6 text-sm text-ink-2">What JobPipe does for you each morning, and what it emails you.</p>
      <div className="card divide-y divide-line">
        <Row
          title="Morning search"
          text="Every morning JobPipe looks for new jobs for your roles and adds them to your list."
          on={me.autopilot}
          onChange={(on) => run(() => setAutopilot({ on }))}
        />
        {account.canEdit && (
          <Row
            title="New roles email"
            text="An email with the best new jobs for you, daily when you've been active lately, otherwise Monday and Thursday."
            on={!account.alertsOff}
            onChange={(on) => run(() => setAlerts({ on }))}
          />
        )}
      </div>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      <p className="mt-4 text-xs text-ink-3">Emails about your plan and payments always come, so you never miss something you paid for.</p>
    </div>
  );
}

function Row({ title, text, on, onChange }: { title: string; text: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 p-5">
      <div>
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 text-sm text-ink-2">{text}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
