import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MicroReportShell } from '../../primitives/micro-report-shell';
import { renderUi } from '../test-utils';

describe('MicroReportShell', () => {
  it('renders title in header', () => {
    renderUi(
      <MicroReportShell title="Test Report" colSpan={2} mode="panel">
        content
      </MicroReportShell>,
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Report');
  });

  it('panel mode renders actions when provided', () => {
    renderUi(
      <MicroReportShell
        title="X"
        colSpan={2}
        mode="panel"
        actions={<button type="button">act</button>}
      >
        body
      </MicroReportShell>,
    );
    expect(screen.getByRole('button', { name: 'act' })).toBeInTheDocument();
  });

  it('print mode hides actions', () => {
    renderUi(
      <MicroReportShell
        title="X"
        colSpan={2}
        mode="print"
        actions={<button type="button">act</button>}
      >
        body
      </MicroReportShell>,
    );
    expect(screen.queryByRole('button', { name: 'act' })).not.toBeInTheDocument();
  });

  it('applies col-span class for given colSpan', () => {
    const { container } = renderUi(
      <MicroReportShell title="X" colSpan={4} mode="panel">
        body
      </MicroReportShell>,
    );
    const el = container.querySelector('[data-slot="micro-report-shell"]');
    expect(el?.getAttribute('data-col-span')).toBe('4');
    expect(el?.className).toMatch(/lg:col-span-4/);
  });

  it('print mode applies break-inside-avoid class', () => {
    const { container } = renderUi(
      <MicroReportShell title="X" colSpan={2} mode="print">
        body
      </MicroReportShell>,
    );
    expect(container.querySelector('[data-slot="micro-report-shell"]')?.className).toMatch(
      /break-inside-avoid/,
    );
  });

  it('renders topNote when provided', () => {
    renderUi(
      <MicroReportShell title="X" colSpan={2} mode="panel" topNote={<div>note</div>}>
        body
      </MicroReportShell>,
    );
    expect(screen.getByText('note')).toBeInTheDocument();
  });
});
