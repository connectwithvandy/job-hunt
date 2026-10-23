import { Spinner } from "./ui";

export function Loading() {
  return (
    <div className="flex justify-center py-24 text-ink-3">
      <Spinner />
    </div>
  );
}
