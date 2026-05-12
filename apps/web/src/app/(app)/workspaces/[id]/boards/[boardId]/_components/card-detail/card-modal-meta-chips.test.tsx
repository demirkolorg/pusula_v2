import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardModalMetaChips } from './card-modal-meta-chips';

const m = strings.card.detail.modal;

function setup(overrides: Partial<Parameters<typeof CardModalMetaChips>[0]> = {}) {
  const props = {
    memberCount: 2,
    labelCount: 1,
    dueAt: null,
    coverColor: null,
    canEdit: true,
    open: null,
    onToggle: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof CardModalMetaChips>[0];
  render(<CardModalMetaChips {...props} />);
  return props;
}

describe('<CardModalMetaChips>', () => {
  it('the cover-colour chip is interactive (not disabled) and toggles the "cover" section', async () => {
    const user = userEvent.setup();
    const props = setup();
    const coverChip = screen.getByRole('button', { name: m.coverColor });
    expect(coverChip).not.toBeDisabled();
    expect(coverChip).toHaveAttribute('aria-expanded', 'false');
    await user.click(coverChip);
    expect(props.onToggle).toHaveBeenCalledWith('cover');
  });

  it('marks the cover-colour chip expanded when its section is open', () => {
    setup({ open: 'cover' });
    expect(screen.getByRole('button', { name: m.coverColor })).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders the cover swatch (no label text) when a cover colour is set', () => {
    setup({ coverColor: 'mavi' });
    const coverChip = screen.getByRole('button', { name: m.coverColor });
    expect(coverChip.querySelector('[data-slot="label-swatch"]')).not.toBeNull();
  });

  it('the members / due / labels chips toggle their own sections', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: m.membersChip }));
    await user.click(screen.getByRole('button', { name: m.labelsChip }));
    expect(props.onToggle).toHaveBeenCalledWith('members');
    expect(props.onToggle).toHaveBeenCalledWith('labels');
  });

  it('hides the "add" chip for a read-only viewer', () => {
    setup({ canEdit: false });
    expect(screen.queryByRole('button', { name: m.addMeta })).not.toBeInTheDocument();
  });
});
