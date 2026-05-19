import { describe, expect, it } from 'vitest';
import { render, screen } from './render-helper';
import { EntityAvatar } from '../entity-avatar';

/** Faz 7N — `EntityAvatar` (baş-harf / görsel avatar) bileşen birim testleri. */

describe('EntityAvatar', () => {
  it('görsel yokken addan deterministik baş harfi gösterir', () => {
    render(<EntityAvatar name="Ahmet" />);
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('baş harf büyük harfe çevrilir', () => {
    render(<EntityAvatar name="zeynep" />);
    expect(screen.getByText('Z')).toBeTruthy();
  });

  it('boş ad için yedek "?" baş harfi gösterilir', () => {
    render(<EntityAvatar name="   " />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('image verilince görsel render edilir; baş-harf yükleme placeholder’ı olur', () => {
    render(<EntityAvatar name="Ahmet" image="https://example.com/a.png" />);
    // RNW `Image` erişilebilirlik etiketini `aria-label` olarak yansıtır.
    expect(screen.getByLabelText('Ahmet')).toBeTruthy();
    // Foto inene kadar baş-harf avatarı placeholder olarak görünür (DEM-217 —
    // boş kare beklemesi olmaz; foto `onLoad`'da yumuşakça belirir).
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('icon verilince baş harf yerine entity ikonu render edilir', () => {
    render(<EntityAvatar name="Ahmet" icon="briefcase" />);
    // İkon modunda baş harf metni basılmaz.
    expect(screen.queryByText('A')).toBeNull();
  });
});
