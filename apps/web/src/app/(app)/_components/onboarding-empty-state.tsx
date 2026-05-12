'use client';

import { SparklesIcon } from 'lucide-react';
import { Card, CardContent, EmptyState } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { CreateWorkspaceDialog } from './create-workspace-dialog';

/**
 * Onboarding empty state — rendered by `(app)/page.tsx` when the user has no
 * workspaces. The signup bootstrap is best-effort (see
 * `docs/architecture/08-web-ve-mobil.md` §8.1.3), so this is the fallback; it also
 * covers a user who left or archived their last workspace. Explains the
 * workspace → board → list/card model and offers the create-workspace dialog as
 * the primary action.
 */
export function OnboardingEmptyState() {
  const copy = strings.onboarding;
  return (
    <Card>
      <CardContent>
        <EmptyState
          icon={<SparklesIcon className="size-8" />}
          message={
            <span className="flex flex-col items-center gap-1.5">
              <span className="text-foreground text-lg font-semibold tracking-tight">
                {copy.title}
              </span>
              <span>{copy.intro}</span>
              <span className="text-muted-foreground">{copy.hint}</span>
            </span>
          }
          action={<CreateWorkspaceDialog triggerLabel={copy.createCta} />}
        />
      </CardContent>
    </Card>
  );
}
