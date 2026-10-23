import Link from "next/link";
import { PageHead } from "@/components/bits";
import { ImportConnections } from "@/components/forms";
import { contactsAt } from "@/lib/contacts";
import { getContacts, getJobs } from "@/lib/store";

export default async function Network() {
  const [contacts, jobs] = await Promise.all([getContacts(), getJobs()]);

  // Companies in your job list where you know someone, warmest first.
  const byCompany = new Map<string, { company: string; jobIds: string[]; people: number }>();
  for (const j of jobs.filter((j) => j.status !== "dismissed")) {
    const key = j.company.toLowerCase();
    const entry = byCompany.get(key) ?? { company: j.company, jobIds: [], people: contactsAt(j.company, contacts).length };
    entry.jobIds.push(j.id);
    byCompany.set(key, entry);
  }
  const warm = [...byCompany.values()].filter((c) => c.people > 0).sort((a, b) => b.people - a.people);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead title="Network" sub="Your LinkedIn connections, matched against every company you're looking at." />

      <section className="card mb-8 p-6">
        <h2 className="display mb-1 text-2xl">{contacts.length ? `${contacts.length.toLocaleString()} connections loaded` : "Load your connections"}</h2>
        <ol className="mb-5 mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>
            On LinkedIn, open{" "}
            <a className="underline" href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer">
              Get a copy of your data
            </a>
            .
          </li>
          <li>Choose &quot;Want something in particular?&quot;, tick only Connections, and request the archive.</li>
          <li>LinkedIn emails you a link, usually within 10 to 30 minutes. Unzip it and pick Connections.csv below.</li>
        </ol>
        <ImportConnections />
        <p className="mt-3 text-xs text-ink-3">The file stays on your computer. Loading a new one replaces the old list. Some connections hide their email, which is fine: notes go through LinkedIn.</p>
      </section>

      {contacts.length > 0 && (
        <section>
          <h2 className="display mb-4 text-3xl">Where you know someone</h2>
          {warm.length === 0 ? (
            <div className="card p-8 text-ink-2">None of the companies in your job list match a connection yet. Add more jobs and check back.</div>
          ) : (
            <ul className="card divide-y divide-line">
              {warm.map((c) => (
                <li key={c.company}>
                  <Link href={`/jobs/${c.jobIds[0]}`} className="flex items-center justify-between px-5 py-3 hover:bg-soft">
                    <span className="font-medium">{c.company}</span>
                    <span className="text-sm text-ink-2">
                      {c.people} {c.people === 1 ? "person" : "people"} · {c.jobIds.length} {c.jobIds.length === 1 ? "job" : "jobs"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
