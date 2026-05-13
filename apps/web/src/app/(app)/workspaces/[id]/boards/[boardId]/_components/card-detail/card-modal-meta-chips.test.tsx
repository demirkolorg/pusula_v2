import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
    membersContent: <div>Üye menüsü</div>,
    dueContent: <div>Tarih menüsü</div>,
    labelsContent: <div>Etiket menüsü</div>,
    coverContent: <div>Kapak menüsü</div>,
    ...overrides,
  } satisfies Parameters<typeof CardModalMetaChips>[0];
  render(<CardModalMetaChips {...props} />);
  return props;
}

describe('<CardModalMetaChips>', () => {
  it('the cover-colour chip is interactive and opens its dropdown content', async () => {
    const user = userEvent.setup();
    setup();
    const coverChip = screen.getByRole('button', { name: m.coverColor });
    expect(coverChip).not.toBeDisabled();
    expect(coverChip).toHaveAttribute('aria-expanded', 'false');
    await user.click(coverChip);
    expect(coverChip).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Kapak menüsü')).toBeInTheDocument();
  });

  it('renders the cover swatch (no label text) when a cover colour is set', () => {
    setup({ coverColor: 'mavi' });
    const coverChip = screen.getByRole('button', { name: m.coverColor });
    expect(coverChip.querySelector('[data-slot="label-swatch"]')).not.toBeNull();
  });

  it('the members / due / labels chips open their dropdown content', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: m.membersChip }));
    expect(screen.getByText('Üye menüsü')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Üye menüsü')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: m.labelsChip }));
    expect(screen.getByText('Etiket menüsü')).toBeInTheDocument();
  });

  it('hides the "add" chip for a read-only viewer', () => {
    setup({ canEdit: false });
    expect(screen.queryByRole('button', { name: m.addMeta })).not.toBeInTheDocument();
  });
});
