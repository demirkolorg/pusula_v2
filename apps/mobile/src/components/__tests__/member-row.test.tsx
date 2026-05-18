import { describe, expect, it } from 'vitest';
import { render, screen } from './render-helper';
import { MemberRow } from '../member-row';

/** Faz 7N — `MemberRow` (üye listesi satırı) bileşen birim testleri. */

describe('MemberRow', () => {
  it('üye adını ve rol etiketini gösterir', () => {
    render(<MemberRow name="Ahmet Yılmaz" roleLabel="Yönetici" />);
    expect(screen.getByText('Ahmet Yılmaz')).toBeTruthy();
    expect(screen.getByText('Yönetici')).toBeTruthy();
  });

  it('görsel yokken addan baş-harf avatarı render eder', () => {
    render(<MemberRow name="Bora Kaya" roleLabel="Üye" />);
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('inherited=false iken devralındı rozeti gösterilmez', () => {
    render(<MemberRow name="Cem Demir" roleLabel="Üye" inheritedLabel="Devralındı" />);
    expect(screen.queryByText('Devralındı')).toBeNull();
  });

  it('inherited=true iken devralındı rozeti gösterilir', () => {
    render(
      <MemberRow name="Cem Demir" roleLabel="Yönetici" inherited inheritedLabel="Devralındı" />,
    );
    expect(screen.getByText('Devralındı')).toBeTruthy();
    expect(screen.getByText('Yönetici')).toBeTruthy();
  });
});
