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

  it('image verilince baş-harf yerine görsel render edilir', () => {
    render(<EntityAvatar name="Ahmet" image="https://example.com/a.png" />);
    // Görsel modunda baş harf metni basılmaz.
    expect(screen.queryByText('A')).toBeNull();
    // RNW `Image` erişilebilirlik etiketini `aria-label` olarak yansıtır.
    expect(screen.getByLabelText('Ahmet')).toBeTruthy();
  });
});
