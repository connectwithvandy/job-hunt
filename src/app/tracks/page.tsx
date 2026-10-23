"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CUSTOM_COLORS } from "../../../convex/lib/defaults";
import { PageHead } from "@/components/bits";
import { LocationForm, TrackForm } from "@/components/forms";
import { Loading } from "@/components/Loading";

export default function Tracks() {
  const me = useQuery(api.users.me);
  const [suffix] = useState(() => Math.random().toString(36).slice(2, 8));
  if (!me) return <Loading />;
  const blank = {
    key: `track-${suffix}-${me.tracks.length}`,
    name: "",
    color: CUSTOM_COLORS[me.tracks.length % CUSTOM_COLORS.length],
    status: "active" as const,
    titles: [],
    pitch: "",
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHead title="Tracks" sub="Each track is a different game: the same you, pitched for a different kind of role. Pause one to stop searching and scoring it." />
      <div className="mb-5 max-w-xl">
        <LocationForm location={me.location} />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {me.tracks.map((t) => (
          <TrackForm key={t._id} track={t} resumes={me.resumes} />
        ))}
        <TrackForm key={blank.key} track={blank} resumes={me.resumes} />
      </div>
    </div>
  );
}
