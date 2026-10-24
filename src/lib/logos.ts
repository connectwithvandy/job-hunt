import type { Resume } from "@/components/ResumeDoc";

/** Company and school names to websites, gathered from your master CVs. */
export function logoMap(cvs: Resume[]) {
  const map: Record<string, string> = {};
  for (const r of cvs) {
    for (const e of r.experience) if (e.domain) map[e.company] = e.domain;
    for (const e of r.education) if (e.domain) map[e.school] = e.domain;
  }
  return map;
}
