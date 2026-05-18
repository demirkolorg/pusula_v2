import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { MemberRow } from '../member-row';
import { strings } from '../../lib/strings';

/** Faz 7N — `MemberRow` (üye listesi satırı) bileşen birim testleri (DEM-210 güncel). */

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

  it('isSelf=true iken "Sen" rozeti gösterilir', () => {
    render(<MemberRow name="Deniz Su" roleLabel="Üye" isSelf />);
    expect(screen.getByText(strings.members.youBadge)).toBeTruthy();
  });

  it('onActions verilmediğinde aksiyon tetikleyicisi render edilmez', () => {
    render(<MemberRow name="Ela Yıldız" roleLabel="Üye" />);
    expect(screen.queryByLabelText(strings.members.actionsLabel)).toBeNull();
  });

  it('onActions verildiğinde tetikleyici basışı geri çağırır', () => {
    const onActions = vi.fn();
    render(<MemberRow name="Ela Yıldız" roleLabel="Üye" onActions={onActions} />);
    fireEvent.click(screen.getByLabelText(strings.members.actionsLabel));
    expect(onActions).toHaveBeenCalledTimes(1);
  });
});
