import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { CardMetaRow } from './card-meta-row';

const copy = strings.board.card;

describe('<CardMetaRow>', () => {
  it('renders the paperclip attachment chip when attachmentCount > 0', () => {
    render(
      <CardMetaRow
        description={null}
        dueAt={null}
        commentCount={0}
        attachmentCount={3}
        members={[]}
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides the attachment chip when attachmentCount is 0', () => {
    const { container } = render(
      <CardMetaRow
        description={null}
        dueAt={null}
        commentCount={0}
        attachmentCount={0}
        members={[]}
      />,
    );
    // Nothing else to show either — the whole row collapses to null.
    expect(container).toBeEmptyDOMElement();
  });

  it('the attachment chip tooltip text exists in the string table', () => {
    expect(copy.attachmentsTooltip).toBe('Ekler');
  });
});
