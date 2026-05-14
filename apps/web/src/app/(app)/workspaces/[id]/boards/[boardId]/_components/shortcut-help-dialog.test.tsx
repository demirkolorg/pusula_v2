import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { ShortcutHelpDialog } from './shortcut-help-dialog';

describe('<ShortcutHelpDialog>', () => {
  it('renders general, board, and card modal shortcut groups', () => {
    render(<ShortcutHelpDialog open onOpenChange={() => undefined} includeCardModal />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.groups.general)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.groups.board)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.groups.cardModal)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.keys.ctrlSpace)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.actions.globalSearch)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.actions.newCard)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.actions.editTitle)).toBeInTheDocument();
  });

  it('hides the card modal group when includeCardModal is false', () => {
    render(<ShortcutHelpDialog open onOpenChange={() => undefined} includeCardModal={false} />);

    expect(screen.queryByText(strings.shortcuts.groups.cardModal)).not.toBeInTheDocument();
    expect(screen.queryByText(strings.shortcuts.actions.editTitle)).not.toBeInTheDocument();
  });
});
