import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardModalAddPopover, type CardAddView } from './card-modal-add-popover';

const m = strings.card.detail.modal;

function setup(overrides: Partial<Parameters<typeof CardModalAddPopover>[0]> = {}) {
  const onViewChange = vi.fn<(next: CardAddView | null) => void>();
  const props = {
    canEdit: true,
    membersContent: <div>Üye paneli</div>,
    labelsContent: <div>Etiket paneli</div>,
    dueContent: <div>Tarih paneli</div>,
    coverContent: <div>Kapak paneli</div>,
    attachmentContent: <div>Ek paneli</div>,
    view: null as CardAddView | null,
    onViewChange,
    ...overrides,
  } satisfies Parameters<typeof CardModalAddPopover>[0];
  render(<CardModalAddPopover {...props} />);
  return { onViewChange, props };
}

describe('<CardModalAddPopover>', () => {
  it('does not render the trigger when canEdit is false', () => {
    setup({ canEdit: false });
    expect(screen.queryByRole('button', { name: m.addMeta })).not.toBeInTheDocument();
  });

  it('clicking the trigger opens with the main view', async () => {
    const user = userEvent.setup();
    const { onViewChange } = setup();
    await user.click(screen.getByRole('button', { name: m.addMeta }));
    expect(onViewChange).toHaveBeenCalledWith('main');
  });

  it('renders the main menu items when view is "main"', () => {
    setup({ view: 'main' });
    expect(screen.getByText(m.addPopoverTitle)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.addMenuLabels })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.addMenuDue })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.addMenuMembers })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.addMenuCover })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: m.addMenuAttachment })).toBeInTheDocument();
  });

  it('selecting a main item changes the view via onViewChange', async () => {
    const user = userEvent.setup();
    const { onViewChange } = setup({ view: 'main' });
    await user.click(screen.getByRole('button', { name: m.addMenuLabels }));
    expect(onViewChange).toHaveBeenCalledWith('labels');
  });

  it('renders the sub-panel content when view is a sub-view, with back button', async () => {
    const user = userEvent.setup();
    const { onViewChange } = setup({ view: 'members' });
    expect(screen.getByText('Üye paneli')).toBeInTheDocument();
    expect(screen.getByText(m.addMenuMembers)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: m.addPopoverBack }));
    expect(onViewChange).toHaveBeenLastCalledWith('main');
  });

  it('close button calls onViewChange(null)', async () => {
    const user = userEvent.setup();
    const { onViewChange } = setup({ view: 'main' });
    await user.click(screen.getByRole('button', { name: m.addPopoverClose }));
    expect(onViewChange).toHaveBeenLastCalledWith(null);
  });

  it('escape key closes the popover (Radix → onOpenChange(false))', async () => {
    const user = userEvent.setup();
    const { onViewChange } = setup({ view: 'main' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onViewChange).toHaveBeenLastCalledWith(null));
  });
});
