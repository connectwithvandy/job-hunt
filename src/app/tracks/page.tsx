import { PageHead } from "@/components/bits";
import { TrackForm } from "@/components/forms";
import { getTracks } from "@/lib/store";

export default async function Tracks() {
  const tracks = await getTracks();
  const blank = { id: `track-${tracks.length + 1}`, name: "", color: "#64748B", status: "active" as const, titles: [], pitch: "" };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHead
        title="Tracks"
        sub="Each track is a different game: the same you, pitched for a different kind of role. Pause one to stop searching and scoring it."
      />
      <div className="grid gap-5 md:grid-cols-2">
        {tracks.map((t) => (
          <TrackForm key={t.id} track={t} />
        ))}
        <TrackForm key={blank.id} track={blank} />
      </div>
    </div>
  );
}
