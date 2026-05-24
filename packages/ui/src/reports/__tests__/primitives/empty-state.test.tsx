import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ReportEmptyState } from '../../primitives/empty-state';
import { renderUi, t } from '../test-utils';

describe('ReportEmptyState', () => {
  it('renders the i18n key as message', () => {
    renderUi(<ReportEmptyState i18nKey="reports.x.empty" t={t} />);
    expect(screen.getByText('reports.x.empty')).toBeInTheDocument();
  });

  it('renders description when descriptionKey provided', () => {
    renderUi(<ReportEmptyState i18nKey="reports.x.empty" descriptionKey="reports.x.desc" t={t} />);
    expect(screen.getByText('reports.x.desc')).toBeInTheDocument();
  });

  it('has role=status for screen readers', () => {
    renderUi(<ReportEmptyState i18nKey="reports.x.empty" t={t} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('print mode marker on element', () => {
    const { container } = renderUi(
      <ReportEmptyState i18nKey="reports.x.empty" t={t} mode="print" />,
    );
    expect(container.querySelector('[data-slot="report-empty-state"]')?.getAttribute('data-mode')).toBe('print');
  });
});
