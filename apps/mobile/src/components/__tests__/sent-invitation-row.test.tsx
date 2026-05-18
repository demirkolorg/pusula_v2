import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { SentInvitationRow } from '../sent-invitation-row';
import { strings } from '../../lib/strings';

/** DEM-210 — `SentInvitationRow` (gönderilen davet satırı) bileşen birim testleri. */

describe('SentInvitationRow', () => {
  it('e-posta + rol etiketini gösterir', () => {
    render(<SentInvitationRow email="ornek@eposta.com" roleLabel="Üye" pending={false} />);
    expect(screen.getByText('ornek@eposta.com')).toBeTruthy();
    expect(screen.getByText('Üye')).toBeTruthy();
  });

  it('davet eden adı verildiğinde alt satırda gösterilir', () => {
    render(
      <SentInvitationRow
        email="ornek@eposta.com"
        roleLabel="Üye"
        invitedByName="Ahmet Yılmaz"
        pending={false}
      />,
    );
    expect(
      screen.getByText(`${strings.invitations.invitedByPrefix} Ahmet Yılmaz`),
    ).toBeTruthy();
  });

  it('onCancel verilmediğinde iptal tetikleyicisi render edilmez', () => {
    render(<SentInvitationRow email="ornek@eposta.com" roleLabel="Üye" pending={false} />);
    expect(screen.queryByLabelText(strings.invitations.actionsLabel)).toBeNull();
  });

  it('onCancel verildiğinde iptal tetikleyicisi render edilir', () => {
    const onCancel = vi.fn();
    render(
      <SentInvitationRow
        email="ornek@eposta.com"
        roleLabel="Üye"
        pending={false}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByLabelText(strings.invitations.actionsLabel)).toBeTruthy();
  });

  it('pending=true iken "İptal ediliyor…" gösterir ve tetikleyici devre dışıdır', () => {
    const onCancel = vi.fn();
    render(
      <SentInvitationRow
        email="ornek@eposta.com"
        roleLabel="Üye"
        pending
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText(strings.invitations.cancelling)).toBeTruthy();
    // Devre dışı tetikleyiciye basış geri çağrımı tetiklemez.
    fireEvent.click(screen.getByLabelText(strings.invitations.actionsLabel));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
