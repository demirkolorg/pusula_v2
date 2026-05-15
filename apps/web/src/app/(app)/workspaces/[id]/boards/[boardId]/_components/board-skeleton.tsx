import { strings } from '@/lib/strings';

/** A single placeholder card row inside a skeleton column. */
function SkeletonCard({ widthClass }: { widthClass: string }) {
  return (
    <div
      className={`bg-muted h-16 rounded-md ${widthClass} animate-pulse motion-reduce:animate-none`}
      aria-hidden
    />
  );
}

/** Placeholder column: a faded header bar + a few card rows. */
function SkeletonColumn({ cardWidths }: { cardWidths: readonly string[] }) {
  return (
    <div
      className="bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-lg border p-2"
      aria-hidden
    >
      <div className="bg-muted h-6 w-32 animate-pulse rounded-sm motion-reduce:animate-none" />
      <div className="flex flex-col gap-2">
        {cardWidths.map((w, i) => (
          <SkeletonCard key={i} widthClass={w} />
        ))}
      </div>
    </div>
  );
}

const COLUMNS: readonly (readonly string[])[] = [
  ['w-full', 'w-5/6', 'w-2/3'],
  ['w-3/4', 'w-full'],
  ['w-full', 'w-1/2', 'w-5/6', 'w-2/3'],
];

/**
 * Loading placeholder for the board screen — a row of skeleton columns with
 * pulsing card rows. Used in place of a "loading…" line while `board.get` is
 * pending so the layout doesn't shift when data arrives.
 */
export function BoardSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{strings.board.skeleton.loading}</span>
      <div className="flex gap-3 overflow-hidden pb-4">
        {COLUMNS.map((cardWidths, i) => (
          <SkeletonColumn key={i} cardWidths={cardWidths} />
        ))}
      </div>
    </div>
  );
}
