import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { StaleBadge } from '../../primitives/stale-badge';
import { renderUi, t } from '../test-utils';

describe('StaleBadge', () => {
  it('returns null when visible=false', () => {
    const { container } = renderUi(
      <StaleBadge visible={false} onRefresh={() => {}} t={t} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders message + refresh button when visible', () => {
    renderUi(<StaleBadge visible onRefresh={() => {}} t={t} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reports.actions.refresh' })).toBeInTheDocument();
  });

  it('invokes onRefresh on click', () => {
    const onRefresh = vi.fn();
    renderUi(<StaleBadge visible onRefresh={onRefresh} t={t} />);
    fireEvent.click(screen.getByRole('button', { name: 'reports.actions.refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('has stale-badge class for print.css hide rule', () => {
    const { container } = renderUi(<StaleBadge visible onRefresh={() => {}} t={t} />);
    expect(container.querySelector('.stale-badge')).not.toBeNull();
  });
});
