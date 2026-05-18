import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from './render-helper';
import { NotificationRow, type NotificationItem } from '../notifications/notification-row';

/** Faz 7N — `NotificationRow` (bildirim merkezi satırı) bileşen birim testleri. */

/** Router sözleşmesine uygun minimal bildirim fixture'ı. */
function makeNotification(over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'n1',
    type: 'card_assigned',
    payload: { actorName: 'Ayşe Demir', cardTitle: 'Tasarım revizyonu' },
    readAt: null,
    createdAt: new Date('2026-05-18T10:00:00.000Z'),
    ...over,
  } as NotificationItem;
}

describe('NotificationRow', () => {
  it('aktör adı ve özet metnini birlikte gösterir', () => {
    render(<NotificationRow notification={makeNotification()} onPress={() => {}} />);
    expect(screen.getByText('Ayşe Demir')).toBeTruthy();
    expect(screen.getByText(/Tasarım revizyonu/)).toBeTruthy();
  });

  it('aktörsüz (sistem) bildirimde aktör yerine Sistem rozeti gösterilir', () => {
    const notification = makeNotification({
      type: 'due_overdue',
      payload: { cardTitle: 'Rapor teslimi' },
    });
    render(<NotificationRow notification={notification} onPress={() => {}} />);
    expect(screen.getByText('Sistem')).toBeTruthy();
  });

  it('okunmamış bildirim için okunmamış göstergesi render edilir', () => {
    render(<NotificationRow notification={makeNotification({ readAt: null })} onPress={() => {}} />);
    expect(screen.getByLabelText('Okunmamış')).toBeTruthy();
  });

  it('okunmuş bildirimde okunmamış göstergesi gösterilmez', () => {
    const read = makeNotification({ readAt: new Date('2026-05-18T11:00:00.000Z') });
    render(<NotificationRow notification={read} onPress={() => {}} />);
    expect(screen.queryByLabelText('Okunmamış')).toBeNull();
  });

  it('satıra dokunulduğunda onPress çağrılır', () => {
    const onPress = vi.fn();
    render(<NotificationRow notification={makeNotification()} onPress={onPress} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
