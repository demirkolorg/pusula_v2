import { describe, expect, it, vi } from 'vitest';
import type { RouterOutputs } from '@pusula/api';
import { fireEvent, render, screen } from './render-helper';

/**
 * Faz 7N — `CardFace` (board kolonundaki kart yüzü) bileşen birim testleri.
 *
 * `CardFace` `CardCoverImage`'i import eder; o da `@/trpc/provider` üzerinden
 * birçok native Expo modülü (`expo-linking` vb.) çeker. Kapaksız kartta
 * (`coverImage: null`) görsel render edilmediği için `CardCoverImage` test
 * kapsamı dışı — modül burada hafif mock'lanır.
 */
vi.mock('../card-cover-image', () => ({
  CardCoverImage: () => null,
}));

const { CardFace } = await import('../card-face');

type BoardCard = RouterOutputs['board']['get']['cards'][number];

const now = new Date('2026-05-18T00:00:00.000Z');

/** `board.get` sözleşmesine uygun minimal kart fixture'ı. */
function makeCard(over: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'c1',
    boardId: 'board-1',
    listId: 'list-1',
    title: 'Örnek kart',
    description: null,
    position: 'a0',
    dueAt: null,
    completed: false,
    completedAt: null,
    completedBy: null,
    coverColor: null,
    coverImageAttachmentId: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    commentCount: 0,
    attachmentCount: 0,
    members: [],
    coverImage: null,
    coverImageUrl: null,
    ...over,
  } as BoardCard;
}

describe('CardFace', () => {
  it('kart başlığını gösterir', () => {
    render(<CardFace card={makeCard({ title: 'Tasarım revizyonu' })} />);
    expect(screen.getByText('Tasarım revizyonu')).toBeTruthy();
  });

  it('meta verisi yokken yalnızca başlık render edilir (checklist sayacı yok)', () => {
    render(<CardFace card={makeCard()} />);
    expect(screen.queryByText('0/0')).toBeNull();
  });

  it('checklist toplamı varsa tamamlanan/toplam sayacı gösterilir', () => {
    render(<CardFace card={makeCard({ checklistTotal: 4, checklistDone: 2 })} />);
    expect(screen.getByText('2/4')).toBeTruthy();
  });

  it('yorum sayısı varsa meta satırında ayrı bir öğe olarak gösterilir', () => {
    // Fixture'da çakışan başka "3" yok: başlık "Örnek kart", checklist/ek
    // sayaçları 0. Dolayısıyla görünen "3" yalnızca yorum sayacı olabilir.
    render(<CardFace card={makeCard({ commentCount: 3 })} />);
    const commentLabel = screen.getByText('3');
    expect(commentLabel).toBeTruthy();
    // Meta etiketi başlıktan farklı bir öğe; başlık metni tıklama yüzeyinde kalır.
    expect(commentLabel).not.toBe(screen.getByText('Örnek kart'));
  });

  it('onPress verilince karta dokunmak callback tetikler', () => {
    const onPress = vi.fn();
    render(<CardFace card={makeCard({ title: 'Tıklanabilir' })} onPress={onPress} />);
    fireEvent.click(screen.getByText('Tıklanabilir'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ne onPress ne onLongPress verilince karta tıklamak callback tetiklemez', () => {
    // onPress mock'u oluşturulur ama bileşene VERİLMEZ; bu durumda Pressable
    // `disabled` olur. Karta gerçekten tıklanır ve hiçbir callback çağrılmaz.
    const onPress = vi.fn();
    render(<CardFace card={makeCard({ title: 'Pasif kart' })} />);
    fireEvent.click(screen.getByText('Pasif kart'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
