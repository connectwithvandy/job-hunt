import { PageHead } from "@/components/bits";
import { ResumeEditor, UploadResume } from "@/components/forms";
import { ResumeDoc } from "@/components/ResumeDoc";
import { PrintButton } from "@/components/ui";
import { getResume } from "@/lib/store";

export default async function MasterResume() {
  const resume = await getResume();

  return (
    <div>
      <PageHead
        title="Master CV"
        sub="Everything you've ever done, in one place. Each job gets a tailored copy that only reorders and trims this, so every real number belongs here."
      >
        {resume && <PrintButton />}
      </PageHead>
      <div className="no-print mb-8 max-w-3xl">
        <UploadResume hasResume={!!resume} />
      </div>
      {resume && (
        <>
          <div className="overflow-x-auto pb-4">
            <ResumeDoc r={resume} />
          </div>
          <details className="no-print card mt-8 max-w-4xl p-6">
            <summary className="cursor-pointer font-medium">Fix something by hand</summary>
            <p className="mt-2 mb-4 text-sm text-ink-2">This is your CV as data. Change any text, keep the quotes and commas, then save.</p>
            <ResumeEditor json={JSON.stringify(resume, null, 2)} />
          </details>
        </>
      )}
    </div>
  );
}
