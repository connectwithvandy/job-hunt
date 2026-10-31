import type { Infer } from "convex/values";
import type { resumeV } from "../../convex/lib/validators";

export type Resume = Infer<typeof resumeV>;

// Mirrors the two-column Canva CV. The DOM order is name, headline, summary,
// experience, then sidebar, so hiring software reads it top to bottom correctly.
/** A company's logo from its website, via Google's public site-icon service. */
function Logo({ domain }: { domain?: string }) {
  if (!domain) return null;
  // A site with no icon gets hidden, not shown as a broken picture or Google's 16px stand-in globe.
  const hide = (img: HTMLImageElement) => (img.style.display = "none");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="logo"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`}
      alt=""
      onError={(e) => hide(e.currentTarget)}
      onLoad={(e) => e.currentTarget.naturalWidth <= 16 && hide(e.currentTarget)}
    />
  );
}

// Line icons for the contact details, as on the Canva CV.
const ICONS = {
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
  linkedin: (
    <>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </>
  ),
  email: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  location: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  web: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
    </>
  ),
  github: (
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4M9 18c-4.51 2-5-2-7-2" />
  ),
  substack: <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

const linkIcon = (link: string) => (/github\.com/i.test(link) ? "github" : /substack\.com/i.test(link) ? "substack" : "web");
// Long profile links broke mid-word in the narrow sidebar; known sites show their name (the link still works),
// and anything else may wrap only after a slash.
const linkLabel = (link: string) => {
  const bare = link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  if (/github\.com/i.test(bare)) return "GitHub";
  if (/substack\.com/i.test(bare)) return "Substack";
  return bare.split("/").flatMap((part, i) => (i ? [<wbr key={i} />, `/${part}`] : [part]));
};

/** `logos` maps company or school names to websites, for CVs (like tailored ones) saved before logos existed. */
export function ResumeDoc({ r, photoUrl, logos = {} }: { r: Resume; photoUrl?: string | null; logos?: Record<string, string> }) {
  return (
    <article className="resume">
      <div className="main">
        <h1>{r.name}</h1>
        <p className="headline">{r.headline}</p>
        <h2>Executive Summary</h2>
        <p>{r.summary}</p>
        <h2>Experience</h2>
        {r.experience.map((e) => (
          <section key={e.id} className="role">
            <div className="role-head">
              <div className="flex items-center gap-[2.5mm]">
                <Logo domain={e.domain ?? logos[e.company]} />
                <div>
                  <div className="company">{e.company}</div>
                  <div className="title">{e.role}</div>
                </div>
              </div>
              <div className="dates">
                {e.start} - {e.end}
                <br />
                {e.location}
              </div>
            </div>
            {e.blurb && <p className="blurb">{e.blurb}</p>}
            {e.bullets.length > 0 && (
              <ul>
                {e.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <aside className="side">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="photo" src={photoUrl} alt="" />
        )}
        <div className="contact">
          {r.contact.phone && (
            <span>
              <Icon name="phone" />
              {r.contact.phone}
            </span>
          )}
          {r.contact.linkedin && (
            <a href={r.contact.linkedin}>
              <Icon name="linkedin" />
              LinkedIn Profile
            </a>
          )}
          {r.contact.email && (
            <span>
              <Icon name="email" />
              <span>
                {r.contact.email.replace(/@.*/, "")}
                <wbr />
                {r.contact.email.replace(/^[^@]*/, "")}
              </span>
            </span>
          )}
          {r.contact.location && (
            <span>
              <Icon name="location" />
              {r.contact.location}
            </span>
          )}
          {r.contact.links?.map((l) => (
            <a key={l} href={/^https?:\/\//.test(l) ? l : `https://${l}`}>
              <Icon name={linkIcon(l)} />
              <span>{linkLabel(l)}</span>
            </a>
          ))}
        </div>
        <h2>Education</h2>
        {r.education.map((ed, i) => (
          <div key={i} className="mb-3">
            <div className="side-item-title flex items-center gap-[2mm]">
              <Logo domain={ed.domain ?? logos[ed.school]} />
              {ed.school}
            </div>
            <div>{ed.degree}</div>
            <div className="muted flex justify-between">
              <span>{ed.detail}</span>
              <span>{ed.year}</span>
            </div>
            {ed.notes.length > 0 && (
              <ul>
                {ed.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {r.certifications.length > 0 && <h2>Certification</h2>}
        {r.certifications.map((c) => (
          <div key={c.name} className="mb-2">
            <div className="side-item-title">{c.name}</div>
            <div>{c.detail}</div>
          </div>
        ))}
        <h2>Technical Skills</h2>
        <ul>
          {r.skills.technical.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <h2>Soft Skills</h2>
        <ul>
          {r.skills.soft.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {r.extras.map((x) => (
          <div key={x.title}>
            <h2>{x.title}</h2>
            {x.items.map((it, i) =>
              it.heading ? (
                <div key={i} className="mb-3" style={{ fontSize: "8.8pt" }}>
                  <strong>{it.heading}</strong>
                  <div>{it.text}</div>
                </div>
              ) : (
                <ul key={i}>
                  <li>{it.text}</li>
                </ul>
              ),
            )}
          </div>
        ))}
      </aside>
    </article>
  );
}
