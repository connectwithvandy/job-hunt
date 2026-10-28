import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { Resume } from "@/components/ResumeDoc";

// A plain, single-column Word CV: application tracking systems read these best.

const heading = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } });
const line = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 60 } });
const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 40 } });

export async function resumeDocx(r: Resume): Promise<Blob> {
  const contact = [r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin].filter(Boolean).join("  |  ");
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: r.name, bold: true, size: 36 })] }),
    line(r.headline, { bold: true, size: 22 }),
    line(contact, { size: 18 }),
    heading("Summary"),
    line(r.summary),
    heading("Experience"),
  ];
  for (const e of r.experience) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 40 },
        children: [new TextRun({ text: `${e.role}, ${e.company}`, bold: true }), new TextRun({ text: `   ${e.start} – ${e.end}${e.location ? `  ·  ${e.location}` : ""}`, size: 18 })],
      }),
    );
    if (e.blurb) children.push(line(e.blurb, { italics: true, size: 18 }));
    children.push(...e.bullets.map(bullet));
  }
  if (r.education.length) {
    children.push(heading("Education"));
    for (const ed of r.education) {
      children.push(line(`${ed.degree}, ${ed.school}${ed.year ? ` (${ed.year})` : ""}`, { bold: true }));
      if (ed.detail) children.push(line(ed.detail, { size: 18 }));
      children.push(...ed.notes.map(bullet));
    }
  }
  if (r.certifications.length) {
    children.push(heading("Certifications"), ...r.certifications.map((c) => bullet(c.detail ? `${c.name}: ${c.detail}` : c.name)));
  }
  const skills = [...r.skills.technical, ...r.skills.soft];
  if (skills.length) children.push(heading("Skills"), line(skills.join(", ")));
  for (const x of r.extras) {
    children.push(heading(x.title), ...x.items.map((i) => bullet(i.heading ? `${i.heading}: ${i.text}` : i.text)));
  }
  const doc = new Document({ styles: { default: { document: { run: { font: "Calibri", size: 21 } } } }, sections: [{ children }] });
  return Packer.toBlob(doc);
}

/** A cover letter on one page: name and contact on top, then the letter's paragraphs. */
export async function letterDocx(r: Resume, text: string): Promise<Blob> {
  const contact = [r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin].filter(Boolean).join("  |  ");
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: r.name, bold: true, size: 32 })] }),
    new Paragraph({ children: [new TextRun({ text: contact, size: 18 })], spacing: { after: 360 } }),
    ...text.trim().split(/\n\s*\n/).map((p) => new Paragraph({ children: p.split("\n").map((l, i) => new TextRun({ text: l, break: i ? 1 : 0 })), spacing: { after: 200 } })),
  ];
  const doc = new Document({ styles: { default: { document: { run: { font: "Calibri", size: 22 } } } }, sections: [{ children }] });
  return Packer.toBlob(doc);
}

export async function downloadLetterDocx(r: Resume, text: string, fileName: string) {
  save(await letterDocx(r, text), fileName);
}

/** Builds the Word file and hands it to the browser as a download. */
export async function downloadDocx(r: Resume, fileName: string) {
  save(await resumeDocx(r), fileName);
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
