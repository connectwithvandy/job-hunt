"use client";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";

/** Counts one visit to a job page from the daily LinkedIn post (or the day's list). */
export function CountVisit({ code }: { code: string }) {
  const count = useMutation(api.postedJobs.count);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void count({ code, kind: "visit" }).catch(() => {});
  }, [code, count]);
  return null;
}

/** The job's Apply button: counts the click, then goes to /apply/CODE (sign-up first, then the job in JobPipe). */
export function ApplyLink({ code, className, children }: { code: string; className?: string; children: React.ReactNode }) {
  const count = useMutation(api.postedJobs.count);
  return (
    <Link href={`/apply/${code}`} prefetch={false} className={className} onClick={() => void count({ code, kind: "apply" }).catch(() => {})}>
      {children}
    </Link>
  );
}
