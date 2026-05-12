import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { CardModalHeader } from './card-modal-header';

const copy = strings.card.detail;
const m = copy.modal;

function setup(overrides: Partial<Parameters<typeof CardModalHeader>[0]> = {}) {
  const props = {
    boardName: 'Yol Haritası',
    listName: 'Yapılacaklar',
    archived: false,
    canArchive: true,
    archivePending: false,
    onArchiveToggle: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<CardModalHeader {...props} />);
  return props;
}

describe('<CardModalHeader>', () => {
  it('shows the board / list breadcrumb', () => {
    setup();
    expect(screen.getByText(/Yol Haritası/)).toBeInTheDocument();
    expect(screen.getByText(/Yapılacaklar/)).toBeInTheDocument();
  });

  it('shows the archived badge only when archived', () => {
    const { rerender } = render(
      <CardModalHeader
        boardName="B"
        listName="L"
        archived={false}
        canArchive
        onArchiveToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(m.archivedBadge)).not.toBeInTheDocument();
    rerender(
      <CardModalHeader
        boardName="B"
        listName="L"
        archived
        canArchive
        onArchiveToggle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(m.archivedBadge)).toBeInTheDocument();
  });

  it('the close button calls onClose', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', { name: copy.close }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('the ⋮ menu exposes archive (and disabled move/copy) for an editor', async () => {
    const user = userEvent.setup();
    setup({ archived: false });
    await user.click(screen.getByRole('button', { name: m.more }));
    expect(await screen.findByRole('menuitem', { name: m.menuArchive })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: m.menuMove })).toHaveAttribute('aria-disabled', 'true');
  });

  it('the ⋮ menu offers restore when the card is archived', async () => {
    const user = userEvent.setup();
    const props = setup({ archived: true });
    await user.click(screen.getByRole('button', { name: m.more }));
    const restore = await screen.findByRole('menuitem', { name: m.menuRestore });
    await user.click(restore);
    expect(props.onArchiveToggle).toHaveBeenCalledWith(false);
  });
});
