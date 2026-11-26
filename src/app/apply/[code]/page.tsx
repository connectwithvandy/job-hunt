"use client";

import { useAction } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";

// Apply on a job from the LinkedIn post. The app frame (Shell) asks visitors to sign up and set up first, so this
// page only renders for members. It saves the role to their list and opens it inside JobPipe, where they see the
// fit, tailor the CV and apply (owner, 26 Nov 2026).
export default function ApplyPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const add = useAction(api.agent.addPostedJob);
  const [failed, setFailed] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    add({ code })
      .then((id) => (id ? router.replace(`/jobs/${id}`) : setFailed("This job link has expired. Your new matches are on the Jobs tab.")))
      .catch(() => setFailed("We couldn't add this job just now. Try the link again in a minute."));
  }, [add, code, router]);
  return <p className="mx-auto max-w-xl py-16 text-ink-2">{failed || "Adding this job to your list…"}</p>;
}
