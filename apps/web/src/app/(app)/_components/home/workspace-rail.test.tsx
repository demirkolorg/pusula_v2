import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import type { WorkspaceRow } from './types';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The create-workspace dialog drags in TanStack Query + tRPC; stub it as an
// inert element so the rail test stays focused on selection + navigation.
vi.mock('../create-workspace-dialog', () => ({
  CreateWorkspaceDialog: () => null,
}));

import { WorkspaceRail } from './workspace-rail';

const workspace = (id: string, name: string, over: Partial<WorkspaceRow> = {}): WorkspaceRow => ({
  id,
  name,
  slug: `${name.toLowerCase()}-slug`,
  role: 'owner',
  createdAt: new Date('2026-01-01'),
  boardCount: 3,
  memberCount: 5,
  lastActivityAt: null,
  ...over,
});

describe('<WorkspaceRail>', () => {
  const workspaces = [workspace('w1', 'Alpha'), workspace('w2', 'Beta')];

  it('renders the eyebrow and the workspace count', () => {
    render(
      <WorkspaceRail workspaces={workspaces} selectedWorkspaceId="w1" onSelect={() => {}} />,
    );
    expect(screen.getByText(strings.home.rail.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(strings.home.rail.count(2))).toBeInTheDocument();
  });

  it('marks the selected workspace with aria-pressed', () => {
    render(
      <WorkspaceRail workspaces={workspaces} selectedWorkspaceId="w1" onSelect={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /Alpha/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Beta/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onSelect with the workspace id when a row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <WorkspaceRail workspaces={workspaces} selectedWorkspaceId="w1" onSelect={onSelect} />,
    );
    await user.click(screen.getByRole('button', { name: /Beta/ }));
    expect(onSelect).toHaveBeenCalledWith('w2');
  });

  it('links each workspace settings icon to the workspace page', () => {
    render(
      <WorkspaceRail workspaces={workspaces} selectedWorkspaceId="w1" onSelect={() => {}} />,
    );
    expect(
      screen.getByRole('link', { name: strings.home.rail.settingsLabel('Alpha') }),
    ).toHaveAttribute('href', '/workspaces/w1');
  });
});
