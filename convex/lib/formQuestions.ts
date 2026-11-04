// Reads the questions on a job's application form, so answers can be drafted before the form is opened.
// Greenhouse and Ashby publish them through their public job board APIs; Lever puts them in the apply page.
// Other forms (Workday and the rest) return null: the autofill bookmark still fills the standard answers there.

export type FormQuestion = { question: string; options?: string[]; required: boolean; long: boolean };
export type ReadForm = { source: "greenhouse" | "lever" | "ashby"; questions: FormQuestion[] };

/** Fields the bookmark fills from the profile or the tailored CV, so there's nothing to draft for them. */
const STANDARD =
  /^(first name|last name|full name|name|preferred (first )?name|email( address)?|phone( number)?|resume|resume ?\/ ?cv|cv|cover letter|linkedin( profile| url)?|website|github( url)?|twitter( url)?|portfolio( url)?|other website|current location|location|current company)$/;

function clean(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[✱*]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function keep(q: FormQuestion) {
  const label = q.question.toLowerCase().replace(/[?:.]+$/, "").trim();
  return label.length > 1 && !STANDARD.test(label);
}

/** The job's own id inside the board, from its link. */
export function jobIdFromUrl(link: string, ats: "greenhouse" | "lever" | "ashby"): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (ats === "greenhouse") {
    const token = url.searchParams.get("token") ?? url.searchParams.get("gh_jid");
    if (token && /^\d+$/.test(token)) return token;
    const i = parts.indexOf("jobs");
    return i >= 0 && /^\d+$/.test(parts[i + 1] ?? "") ? parts[i + 1] : null;
  }
  // Lever and Ashby: /<slug>/<uuid>[/apply|/application]
  const id = parts[1];
  return id && /^[0-9a-f-]{20,}$/i.test(id) ? id : null;
}

type GreenhouseQuestion = { label: string; required: boolean; fields: { type: string; values?: { label: string }[] }[] };

export function parseGreenhouse(data: { questions?: GreenhouseQuestion[] }): FormQuestion[] {
  return (data.questions ?? [])
    .map((q) => {
      const field = q.fields.find((f) => f.type !== "input_file") ?? q.fields[0];
      const options = field?.values?.map((v) => v.label).filter(Boolean);
      return { question: clean(q.label), options: options?.length ? options : undefined, required: q.required, long: field?.type === "textarea" };
    })
    .filter((q) => !q.question.toLowerCase().startsWith("resume") && keep(q));
}

type LeverCard = { text?: string; fields: { type: string; text: string; required?: boolean; options?: { text: string }[] }[] };

const unescapeHtml = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function parseLever(html: string): FormQuestion[] {
  const out: FormQuestion[] = [];
  // The location picker sits outside the custom cards.
  const loc = html.match(/<select name="opportunityLocationId"[^>]*>([\s\S]*?)<\/select>/);
  if (loc) {
    const options = [...loc[1].matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map((m) => clean(unescapeHtml(m[1])));
    if (options.length) out.push({ question: "Which location are you applying for?", options, required: true, long: false });
  }
  for (const m of html.matchAll(/value="([^"]*)"\s+name="cards\[[^\]]+\]\[baseTemplate\]"/g)) {
    let card: LeverCard;
    try {
      card = JSON.parse(unescapeHtml(m[1])) as LeverCard;
    } catch {
      continue;
    }
    for (const f of card.fields ?? []) {
      if (f.type === "file-upload") continue;
      const options = f.options?.map((o) => o.text).filter(Boolean);
      out.push({ question: clean(f.text), options: options?.length ? options : undefined, required: !!f.required, long: f.type === "textarea" });
    }
  }
  return out.filter(keep);
}

type AshbyField = { title?: string; type?: string; selectableValues?: { label: string }[] | null };
type AshbyPosting = { applicationForm?: { sections: { fieldEntries: { field?: AshbyField; isRequired?: boolean }[] }[] } } | null;

export function parseAshby(posting: AshbyPosting): FormQuestion[] {
  const out: FormQuestion[] = [];
  for (const s of posting?.applicationForm?.sections ?? []) {
    for (const e of s.fieldEntries) {
      const f = e.field;
      if (!f?.title || f.type === "File") continue;
      const options = f.type === "Boolean" ? ["Yes", "No"] : f.selectableValues?.map((v) => v.label).filter(Boolean);
      out.push({ question: clean(f.title), options: options?.length ? options : undefined, required: !!e.isRequired, long: f.type === "LongText" });
    }
  }
  return out.filter(keep);
}

const ASHBY_QUERY =
  "query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) { jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) { applicationForm { sections { fieldEntries { ... on FormFieldEntry { field isRequired } } } } } }";

/** The form's questions, or null when the form isn't one we can read. Throws only on network trouble. */
export async function readFormQuestions(board: { ats: string; slug: string } | null, link: string): Promise<ReadForm | null> {
  if (!board) return null;
  const signal = AbortSignal.timeout(20_000);
  if (board.ats === "greenhouse") {
    const id = jobIdFromUrl(link, "greenhouse");
    if (!id) return null;
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs/${id}?questions=true`, { signal });
    if (!res.ok) return null;
    return { source: "greenhouse", questions: parseGreenhouse((await res.json()) as { questions?: GreenhouseQuestion[] }) };
  }
  if (board.ats === "lever") {
    const id = jobIdFromUrl(link, "lever");
    if (!id) return null;
    const res = await fetch(`https://jobs.lever.co/${board.slug}/${id}/apply`, { signal, headers: { "user-agent": "Mozilla/5.0 (JobPipe)" } });
    if (!res.ok) return null;
    return { source: "lever", questions: parseLever(await res.text()) };
  }
  if (board.ats === "ashby") {
    const id = jobIdFromUrl(link, "ashby");
    if (!id) return null;
    const res = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationName: "ApiJobPosting", variables: { organizationHostedJobsPageName: board.slug, jobPostingId: id }, query: ASHBY_QUERY }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { jobPosting?: AshbyPosting } };
    return { source: "ashby", questions: parseAshby(body.data?.jobPosting ?? null) };
  }
  return null;
}

/** Questions a person must answer themselves: legal agreements, consent, and declarations. */
export function mustAnswerYourself(question: string) {
  return /arbitrat|agreement|consent|acknowledg|certif|attest|privacy|policy|terms|declar|gender|race|ethnic|veteran|disabilit|pronoun|sexual orientation|criminal|convict/i.test(question);
}
