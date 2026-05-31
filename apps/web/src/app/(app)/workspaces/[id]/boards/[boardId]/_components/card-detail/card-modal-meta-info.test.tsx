import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { CardModalMetaInfo } from './card-modal-meta-info';

const m = strings.card.detail.modal;

function setup(overrides: Partial<Parameters<typeof CardModalMetaInfo>[0]> = {}) {
  const props = {
    memberCount: 0,
    labelCount: 0,
    dueAt: null,
    coverColor: null,
    attachmentCount: 0,
    ...overrides,
  } satisfies Parameters<typeof CardModalMetaInfo>[0];
  const { container } = render(<CardModalMetaInfo {...props} />);
  return { container };
}

describe('<CardModalMetaInfo>', () => {
  it('renders nothing when all counts are zero and no due/cover', () => {
    const { container } = setup();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders members and labels when their counts are positive', () => {
    setup({ memberCount: 2, labelCount: 1 });
    expect(screen.getByLabelText(m.metaInfoMembers(2))).toBeInTheDocument();
    expect(screen.getByLabelText(m.metaInfoLabels(1))).toBeInTheDocument();
  });

  it('omits members when count is zero', () => {
    setup({ memberCount: 0, labelCount: 1 });
    expect(screen.queryByLabelText(m.metaInfoMembers(0))).not.toBeInTheDocument();
    expect(screen.getByLabelText(m.metaInfoLabels(1))).toBeInTheDocument();
  });

  it('renders the overdue badge when dueAt is in the past', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    setup({ dueAt: past });
    expect(screen.getByText(m.overdueBadge)).toBeInTheDocument();
  });

  it('does not render the overdue badge for a future dueAt', () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    setup({ dueAt: future });
    expect(screen.queryByText(m.overdueBadge)).not.toBeInTheDocument();
  });

  it('renders the cover swatch when coverColor is set', () => {
    const { container } = setup({ coverColor: 'mavi' });
    expect(container.querySelector('[data-slot="label-swatch"]')).not.toBeNull();
  });

  it('renders the attachment count when positive', () => {
    setup({ attachmentCount: 3 });
    expect(screen.getByLabelText(m.metaInfoAttachments(3))).toBeInTheDocument();
  });
});
