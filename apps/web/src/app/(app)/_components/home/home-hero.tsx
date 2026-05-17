import { SparkleIcon } from 'lucide-react';
import { cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

/**
 * Landing-page hero (DEM-192) — a glowing sparkle mark beside the page title.
 * Token-driven so the purple glow + gradient badge read correctly in both
 * themes: the badge is a `--primary` gradient with an inset ring, sitting over
 * a blurred `--primary` halo, inside a card panel topped by a faint highlight.
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
        <span className="relative inline-flex shrink-0">
          {/* Glow halo behind the badge. */}
          <span
            aria-hidden
            className="absolute inset-0 -z-10 rounded-2xl bg-primary/45 blur-lg"
          />
          <span
            aria-hidden
            className="text-primary inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/35 to-primary/5 ring-1 ring-inset ring-primary/30"
          >
            <SparkleIcon className="size-7" />
          </span>
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
