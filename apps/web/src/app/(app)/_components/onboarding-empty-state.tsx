'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@pusula/ui';
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
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.intro}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{copy.hint}</p>
        <CreateWorkspaceDialog triggerLabel={copy.createCta} />
      </CardContent>
    </Card>
  );
}
