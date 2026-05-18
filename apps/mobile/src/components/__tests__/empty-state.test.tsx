import { describe, expect, it } from 'vitest';
import { render, screen } from './render-helper';
import { Button } from '../button';
import { EmptyState } from '../empty-state';

/** Faz 7N — `EmptyState` (ortak boş/bilgi durumu) bileşen birim testleri. */

describe('EmptyState', () => {
  it('başlık ve açıklama metnini gösterir', () => {
    render(
      <EmptyState icon="inbox" title="Henüz bildirim yok" description="Aktiviteler burada görünür" />,
    );
    expect(screen.getByText('Henüz bildirim yok')).toBeTruthy();
    expect(screen.getByText('Aktiviteler burada görünür')).toBeTruthy();
  });

  it('children verilmezse aksiyon render edilmez', () => {
    render(<EmptyState icon="alert-circle" title="Hata" description="Tekrar dene" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('children verilince aksiyon (buton) render edilir', () => {
    render(
      <EmptyState icon="alert-circle" title="Hata" description="Bağlantını kontrol et">
        <Button label="Tekrar dene" onPress={() => {}} />
      </EmptyState>,
    );
    expect(screen.getByRole('button')).toBeTruthy();
    expect(screen.getByText('Tekrar dene')).toBeTruthy();
  });
});
