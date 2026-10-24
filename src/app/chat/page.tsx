"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Loading } from "@/components/Loading";
import { errorMessage } from "@/lib/errors";

const STARTERS = [
  "Which of my jobs should I go after first, and why?",
  "Help me negotiate pay for an SDR Manager role in Bangalore",
  "Run a mock interview with me for my strongest job",
  "Rewrite my LinkedIn headline for Sales Development leadership roles",
];
const JOB_STARTERS = ["Is this job worth my time?", "What would they ask me in the interview?", "Help me write to the hiring manager", "What should I ask for in pay?"];

export default function ChatPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Chat />
    </Suspense>
  );
}

function Chat() {
  const params = useSearchParams();
  const router = useRouter();
  const chatId = params.get("id") as Id<"chats"> | null;
  const jobId = params.get("job") as Id<"jobs"> | null;
  const chats = useQuery(api.chats.list);
  const chat = useQuery(api.chats.get, chatId ? { chatId } : "skip");
  const job = useQuery(api.jobs.get, !chatId && jobId ? { jobId } : "skip");
  const send = useMutation(api.chats.send);
  const remove = useMutation(api.chats.remove);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const lastText = chat?.messages.at(-1)?.text;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.length, lastText]);

  if (!chats) return <Loading />;
  const busy = !!chat?.pending;

  const submit = async (text: string) => {
    if (!text.trim() || busy) return;
    setError("");
    setDraft("");
    try {
      const id = await send({ chatId: chatId ?? undefined, text, jobId: chatId ? undefined : (jobId ?? undefined) });
      if (!chatId) router.replace(`/chat?id=${id}`);
    } catch (err) {
      setDraft(text);
      setError(errorMessage(err));
    }
  };

  const starters = !chatId && jobId ? JOB_STARTERS : STARTERS;
  return (
    <div className="mx-auto flex max-w-6xl gap-6">
      <aside className="hidden w-60 shrink-0 md:block">
        <button className="btn btn-primary btn-sm mb-3 w-full" onClick={() => router.push("/chat")}>
          + New chat
        </button>
        <ul className="space-y-1 text-sm">
          {chats.map((c) => (
            <li key={c._id} className="group flex items-center">
              <button
                onClick={() => router.push(`/chat?id=${c._id}`)}
                className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left ${c._id === chatId ? "bg-soft text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {c.title}
              </button>
              <button
                aria-label="Delete chat"
                className="hidden px-2 text-ink-3 hover:text-ink group-hover:block"
                onClick={async () => {
                  await remove({ chatId: c._id });
                  if (c._id === chatId) router.push("/chat");
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-[calc(100vh-6rem)] min-w-0 flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="display text-3xl">{chat ? chat.title : job ? `About ${job.job.title} at ${job.job.company}` : "Ask anything"}</h1>
          <button className="btn btn-ghost btn-sm md:hidden" onClick={() => router.push("/chat")}>
            New chat
          </button>
        </div>

        <div className="flex-1 space-y-4">
          {!chat ? (
            <div className="card p-6">
              <p className="mb-4 text-sm text-ink-2">
                I know your CVs, your roles, the jobs in your list and the companies you&apos;re approaching, and I can search the web. Ask about anything in your job hunt.
              </p>
              <div className="flex flex-wrap gap-2">
                {starters.map((s) => (
                  <button key={s} className="rounded-full border border-line px-3 py-1.5 text-left text-sm text-ink-2 hover:text-ink" onClick={() => void submit(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-accent text-on-accent" : "card"}`}>
                  {m.role === "assistant" && !m.text && busy ? <span className="text-ink-3">Thinking…</span> : <Rendered text={m.text} />}
                </div>
              </div>
            ))
          )}
          <div ref={bottom} />
        </div>

        <form
          className="sticky bottom-0 mt-4 bg-paper pb-2 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(draft);
          }}
        >
          {error && <p className="mb-2 text-sm text-bad">{error}</p>}
          <div className="card flex items-end gap-2 p-2">
            <textarea
              className="field min-h-[44px] flex-1 resize-none !border-0 text-sm"
              rows={Math.min(8, Math.max(1, draft.split("\n").length))}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(draft);
                }
              }}
              placeholder={busy ? "Writing a reply…" : "Ask anything. Enter sends, Shift+Enter adds a line."}
            />
            <button className="btn btn-primary btn-sm" disabled={busy || !draft.trim()}>
              Send
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/** Light formatting for replies: paragraphs, bullet and numbered lists, and **bold**. */
function Rendered({ text }: { text: string }) {
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d/.test(lines[0]);
          const items = lines.map((l, j) => <li key={j}>{bold(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>);
          return ordered ? (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {bold(block.replace(/^#+\s*/gm, ""))}
          </p>
        );
      })}
    </div>
  );
}
