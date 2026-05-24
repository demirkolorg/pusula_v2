import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { RestrictedScopeBanner } from '../../primitives/restricted-scope-banner';
import { renderUi, t } from '../test-utils';

describe('RestrictedScopeBanner', () => {
  it('interpolates excludedCount + kind into i18n key', () => {
    renderUi(
      <RestrictedScopeBanner
        restricted={{ excludedKind: 'board', excludedCount: 2 }}
        t={t}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('reports.restricted.banner');
    expect(alert.textContent).toContain('count=2');
    expect(alert.textContent).toContain('kind=reports.restricted.kind.board');
  });

  it('print mode marker present', () => {
    const { container } = renderUi(
      <RestrictedScopeBanner
        restricted={{ excludedKind: 'list', excludedCount: 5 }}
        t={t}
        mode="print"
      />,
    );
    expect(
      container.querySelector('[data-slot="restricted-scope-banner"]')?.getAttribute('data-mode'),
    ).toBe('print');
  });

  it('singular vs plural opaque (t function fakes interpolation)', () => {
    renderUi(
      <RestrictedScopeBanner
        restricted={{ excludedKind: 'workspace', excludedCount: 1 }}
        t={t}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('count=1');
  });
});
