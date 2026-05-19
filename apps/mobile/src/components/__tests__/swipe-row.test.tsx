import { describe, expect, it, vi } from 'vitest';
import { Text } from '@/components/text';
import { fireEvent, render, screen } from './render-helper';
import { SwipeRow } from '../swipe-row';

/** DEM-221 — `SwipeRow` (kaydırarak sil) bileşen birim testleri. */

describe('SwipeRow', () => {
  it('içeriğini render eder', () => {
    render(
      <SwipeRow onDelete={() => {}} deleteLabel="Sil" deleteAccessibilityLabel="Maddeyi sil">
        <Text>satır içeriği</Text>
      </SwipeRow>,
    );
    expect(screen.getByText('satır içeriği')).toBeTruthy();
  });

  it('sil aksiyonunu erişilebilirlik etiketiyle render eder ve dokununca onDelete çağrılır', () => {
    const onDelete = vi.fn();
    render(
      <SwipeRow onDelete={onDelete} deleteLabel="Sil" deleteAccessibilityLabel="Maddeyi sil">
        <Text>satır içeriği</Text>
      </SwipeRow>,
    );
    fireEvent.click(screen.getByLabelText('Maddeyi sil'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('enabled=false iken sil aksiyonu render edilmez (kaydırma devre dışı)', () => {
    render(
      <SwipeRow
        onDelete={() => {}}
        deleteLabel="Sil"
        deleteAccessibilityLabel="Maddeyi sil"
        enabled={false}
      >
        <Text>satır içeriği</Text>
      </SwipeRow>,
    );
    expect(screen.queryByLabelText('Maddeyi sil')).toBeNull();
    expect(screen.getByText('satır içeriği')).toBeTruthy();
  });
});
