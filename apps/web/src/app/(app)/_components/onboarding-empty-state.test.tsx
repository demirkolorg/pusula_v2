import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { OnboardingEmptyState } from './onboarding-empty-state';

// The dialog pulls in TanStack Query + the tRPC client; for this presentational
// test we only care that the CTA renders with the right label, so stub it.
vi.mock('./create-workspace-dialog', () => ({
  CreateWorkspaceDialog: ({ triggerLabel }: { triggerLabel?: string } = {}) => (
    <button type="button">{triggerLabel ?? 'Yeni workspace'}</button>
  ),
}));

describe('<OnboardingEmptyState>', () => {
  it('renders the welcome heading, intro, hint, and the create-workspace CTA', () => {
    render(<OnboardingEmptyState />);
    expect(screen.getByText(strings.onboarding.title)).toBeInTheDocument();
    expect(screen.getByText(strings.onboarding.intro)).toBeInTheDocument();
    expect(screen.getByText(strings.onboarding.hint)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.onboarding.createCta })).toBeInTheDocument();
  });
});
