import { readFile } from "node:fs/promises";
import path from "node:path";
import { PageHead } from "@/components/bits";
import { ResumeEditor } from "@/components/forms";
import { ResumeDoc } from "@/components/ResumeDoc";
import { PrintButton } from "@/components/ui";
import { getResume } from "@/lib/store";

export default async function MasterResume() {
  const resume = await getResume();
  const json = resume
    ? JSON.stringify(resume, null, 2)
    : await readFile(path.join(process.cwd(), "examples", "resume.example.json"), "utf8");

  return (
    <div>
      <PageHead
        title="Master CV"
        sub="Everything you've ever done, in one place. Each job gets a tailored copy that only reorders and trims this, so put every real number here."
      >
        {resume && <PrintButton />}
      </PageHead>
      <div className="grid gap-8 xl:grid-cols-[auto_1fr]">
        {resume ? (
          <div className="overflow-x-auto">
            <ResumeDoc r={resume} />
          </div>
        ) : (
          <div className="card max-w-xl p-6 text-ink-2">
            No CV yet. The editor has an example to show the shape: replace it with your own and save. Put a photo in data/assets and name it in the &quot;photo&quot; field.
          </div>
        )}
        <div className="no-print min-w-0">
          <div className="label mb-2">Edit</div>
          <ResumeEditor json={json} />
        </div>
      </div>
    </div>
  );
}
