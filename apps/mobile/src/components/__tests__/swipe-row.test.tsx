import { describe, expect, it, vi } from 'vitest';
import { Text } from '@/components/text';
import { fireEvent, render, screen } from './render-helper';
import { SwipeRow, type SwipeAction } from '../swipe-row';

/** DEM-221 / DEM-231 — `SwipeRow` (kaydırarak çok-aksiyon) birim testleri. */

/** Tek bir sil aksiyonu fixture'ı. */
function deleteAction(onPress: () => void = vi.fn()): SwipeAction {
  return {
    key: 'delete',
    label: 'Sil',
    accessibilityLabel: 'Maddeyi sil',
    icon: 'trash-2',
    variant: 'destructive',
    onPress,
  };
}

describe('SwipeRow', () => {
  it('içeriğini render eder', () => {
    render(
      <SwipeRow actions={[deleteAction()]}>
        <Text>satır içeriği</Text>
      </SwipeRow>,
    );
    expect(screen.getByText('satır içeriği')).toBeTruthy();
  });

  it('aksiyonu erişilebilirlik etiketiyle render eder ve dokununca onPress çağrılır', () => {
    const onPress = vi.fn();
    render(
      <SwipeRow actions={[deleteAction(onPress)]}>
        <Text>satır içeriği</Text>
      </SwipeRow>,
    );
    fireEvent.click(screen.getByLabelText('Maddeyi sil'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('enabled=false iken aksiyon render edilmez (kaydırma devre dışı)', () => {
    render(
      <SwipeRow actions={[deleteAction()]} enabled={false}>
        <Text>satır içeriği</Text>
      </SwipeRow>,
    );
    expect(screen.queryByLabelText('Maddeyi sil')).toBeNull();
    expect(screen.getByText('satır içeriği')).toBeTruthy();
  });

  it('birden çok aksiyonu erişilebilirlik etiketleriyle render eder', () => {
    render(
      <SwipeRow
        actions={[
          {
            key: 'edit',
            label: 'Düzenle',
            accessibilityLabel: 'Notu düzenle',
            icon: 'edit-3',
            variant: 'primary',
            onPress: vi.fn(),
          },
          deleteAction(),
        ]}
      >
        <Text>satır içeriği</Text>
      </SwipeRow>,
    );
    expect(screen.getByLabelText('Notu düzenle')).toBeTruthy();
    expect(screen.getByLabelText('Maddeyi sil')).toBeTruthy();
  });
});
