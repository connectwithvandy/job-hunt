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
      <PageHead title="Roles" sub="The kinds of roles you want. Each one searches its job titles and is pitched from its own CV. Switch one off to stop searching for it." />
      <div className="mb-5 max-w-xl">
        <LocationForm location={me.location} markets={me.markets} />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {me.tracks.map((t) => (
          <TrackForm key={t._id} track={t} resumes={me.resumes} />
        ))}
        <TrackForm key={blank.key} track={blank} resumes={me.resumes} isNew />
      </div>
    </div>
  );
}
