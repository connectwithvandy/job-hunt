import type { Resume } from "@/lib/types";

// Mirrors the two-column Canva CV. The DOM order is name, headline, summary,
// experience, then sidebar, so hiring software reads it top to bottom correctly.
export function ResumeDoc({ r }: { r: Resume }) {
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
              <div>
                <div className="company">{e.company}</div>
                <div className="title">{e.role}</div>
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
        {r.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="photo" src={`/data-asset/${r.photo}`} alt="" />
        )}
        <div className="contact">
          {r.contact.phone && <span>{r.contact.phone}</span>}
          {r.contact.linkedin && <a href={r.contact.linkedin}>LinkedIn Profile</a>}
          {r.contact.email && <span>{r.contact.email}</span>}
          {r.contact.location && <span>{r.contact.location}</span>}
        </div>
        <h2>Education</h2>
        {r.education.map((ed, i) => (
          <div key={i} className="mb-3">
            <div className="side-item-title">{ed.school}</div>
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
