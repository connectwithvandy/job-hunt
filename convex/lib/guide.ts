// The steps that get someone from signing up to their first application, worked out from what they've done so far.
// Today shows them as a checklist with one next step open, and a pop-up the first time each step comes up.

export type GuideStep = { key: "cv" | "roles" | "connections" | "score" | "tailor" | "apply"; title: string; why: string; done: boolean };

export type GuideProgress = { hasCv: boolean; roles: number; contacts: number; jobs: number; scored: number; tailored: number; applied: number };

export function guideSteps(p: GuideProgress): GuideStep[] {
  return [
    { key: "cv", title: "Add your CV", why: "Everything JobPipe does starts from it.", done: p.hasCv },
    { key: "roles", title: "Pick your roles", why: "So it knows which jobs to look for.", done: p.roles > 0 },
    { key: "connections", title: "Add your LinkedIn connections", why: "Every job then shows who you know there. A referral is the fastest way in.", done: p.contacts > 0 },
    { key: "score", title: "Get your jobs scored", why: "JobPipe reads each job against your CV and tells you how well it fits, and why.", done: p.scored > 0 },
    { key: "tailor", title: "Tailor your CV for your best job", why: "It rewrites your CV and cover letter for that one role, using only what's true.", done: p.tailored > 0 },
    { key: "apply", title: "Apply, then mark it applied", why: "JobPipe then reminds you when to follow up.", done: p.applied > 0 },
  ];
}

/** The step to do now. Connections take LinkedIn up to 30 minutes, so once requested, the next step comes first. */
export function nextGuideStep(steps: GuideStep[], connectionsRequested: boolean) {
  const open = steps.filter((s) => !s.done);
  return open.find((s) => !(s.key === "connections" && connectionsRequested)) ?? open[0] ?? null;
}
