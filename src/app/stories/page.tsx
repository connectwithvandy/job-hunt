"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState, useTransition } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { MAX_STORIES } from "../../../convex/lib/defaults";
import { PageHead } from "@/components/bits";
import { Loading } from "@/components/Loading";
import { ActionButton, attempt, Feedback, Spinner, type ActionState } from "@/components/ui";

type Story = Doc<"stories">;
const BLANK = { title: "", situation: "", action: "", result: "", reflection: "", answers: [] as string[] };

export default function Stories() {
  const stories = useQuery(api.stories.list);
  const build = useAction(api.agent.buildStoryBank);
  const [adding, setAdding] = useState(false);
  if (!stories) return <Loading />;
  // Which story to tell for which question, so a question in the room has an answer ready.
  const byQuestion = stories.flatMap((s) => s.answers.map((q) => ({ q, title: s.title })));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title="Stories"
        sub="The handful of stories from your career worth knowing by heart. Interview prep reuses these instead of writing new ones for every job, so each telling gets sharper."
      >
        {stories.length < MAX_STORIES && (
          <ActionButton
            run={async () => {
              const { added } = await build();
              return `Added ${added} ${added === 1 ? "story" : "stories"}.`;
            }}
            pending="Writing… about a minute"
            variant={stories.length ? "ghost" : "primary"}
          >
            {stories.length ? "Find more in my CV" : "Write my stories from my CV"}
          </ActionButton>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)}>
          Add one myself
        </button>
      </PageHead>

      {adding && (
        <div className="mb-6">
          <StoryForm initial={BLANK} onDone={() => setAdding(false)} />
        </div>
      )}

      {stories.length === 0 && !adding ? (
        <div className="card p-8 text-ink-2">
          No stories yet. Write them from your CV in one click, or they&apos;ll fill in as you prepare for interviews from a job&apos;s page.
        </div>
      ) : (
        <div className="space-y-4">
          {stories.map((s) => (
            <StoryCard key={s._id} story={s} />
          ))}
        </div>
      )}

      {byQuestion.length > 0 && (
        <section className="mt-10">
          <h2 className="display mb-3 text-2xl">If they ask…</h2>
          <ul className="card divide-y divide-line">
            {byQuestion.map(({ q, title }) => (
              <li key={q + title} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                <span>{q}</span>
                <span className="text-ink-2">{title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StoryCard({ story }: { story: Story }) {
  const remove = useMutation(api.stories.remove);
  const [editing, setEditing] = useState(false);
  if (editing) return <StoryForm id={story._id} initial={story} onDone={() => setEditing(false)} />;
  return (
    <article className="card p-5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="display text-xl">{story.title}</h3>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
          <ActionButton run={async () => void (await remove({ storyId: story._id }))} variant="ghost" size="sm">
            Delete
          </ActionButton>
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-3">{story.usedFor.length ? `Used in prep for ${story.usedFor.length} ${story.usedFor.length === 1 ? "job" : "jobs"}` : "Not used yet"}</p>
      <dl className="mt-3 space-y-2">
        <Part label="Situation" text={story.situation} />
        <Part label="What you did" text={story.action} />
        <Part label="Result" text={story.result} />
        <Part label="What you learned" text={story.reflection} />
      </dl>
      {story.unverified.length > 0 && (
        <p className="mt-3 rounded-lg bg-warn/10 p-3 text-warn">Check these numbers, they aren&apos;t in any of your CVs: {story.unverified.join(", ")}</p>
      )}
    </article>
  );
}

function Part({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-ink-2">{text}</dd>
    </div>
  );
}

function StoryForm({ id, initial, onDone }: { id?: Id<"stories">; initial: typeof BLANK; onDone: () => void }) {
  const save = useMutation(api.stories.save);
  const [s, setS] = useState({ title: initial.title, situation: initial.situation, action: initial.action, result: initial.result, reflection: initial.reflection, answers: initial.answers.join("\n") });
  const [busy, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const field = (key: keyof typeof s, label: string, hint: string, rows = 3) => (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="field mt-1 text-sm" rows={rows} value={s[key]} placeholder={hint} onChange={(e) => setS({ ...s, [key]: e.target.value })} />
    </label>
  );
  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          // Numbers that aren't in a CV show as a warning on the saved card.
          const result = await attempt(async () => void (await save({ storyId: id, story: { ...s, answers: s.answers.split("\n") } })));
          if (result?.error) setState(result);
          else onDone();
        });
      }}
    >
      <label className="block">
        <span className="label">Title</span>
        <input className="field mt-1" value={s.title} placeholder="e.g. Won back our biggest lost account" onChange={(e) => setS({ ...s, title: e.target.value })} />
      </label>
      {field("situation", "Situation", "Where you were, what was at stake, what you had to do.")}
      {field("action", "What you did", "Your part, in first person. Specific steps.")}
      {field("result", "Result", "What changed, with real numbers.")}
      {field("reflection", "What you learned", "What you'd do again, or differently. Interviewers ask this to judge seniority.", 2)}
      {field("answers", "Questions it answers, one per line", "Tell me about a deal you lost\nHow do you handle a hard stakeholder?", 3)}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy && <Spinner />}
          Save
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
        <Feedback state={busy ? null : state} />
      </div>
    </form>
  );
}
