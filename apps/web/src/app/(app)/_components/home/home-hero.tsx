import { SparkleIcon } from 'lucide-react';
import { cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

/**
 * Landing-page hero (DEM-192) — a sparkle mark beside the page title.
 * A simple solid `--primary` badge with a white sparkle; reads cleanly and
 * identically in both themes.
 */
export function HomeHero({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card px-6 py-5 shadow-card',
        className,
      )}
    >
      {/* Top edge highlight — a thin primary-tinted gradient line. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />
      <div className="flex items-center gap-4">
        {/* Simple solid badge — primary fill, white sparkle. */}
        <span className="bg-primary inline-flex size-14 shrink-0 items-center justify-center rounded-2xl">
          <SparkleIcon className="text-primary-foreground size-7" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {strings.workspace.listTitle}
          </h1>
          <p className="text-muted-foreground mt-0.5 truncate text-sm">
            {strings.board.listSectionDescription}
          </p>
        </div>
      </div>
    </section>
  );
}
