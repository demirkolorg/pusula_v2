import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardCard, BoardList } from '@/lib/board-cache';
import { fireEvent, render, screen } from './render-helper';

/**
 * Faz 15C (DEM-303) — `BoardSidebar` (tablet master-detail sol pane) birim
 * testleri. Sidebar liste başlığı + kart başlık özetini render eder; kart
 * tap'i ya `onSelectCard` callback'ine (master-detail sağ pane'i set'lemek
 * için) ya da `/cards/[cardId]` route'una düşer.
 *
 * Sidebar phone'da render edilmez (board ekranı `isTablet` branch'inde
 * mount eder) — burada salt presentational davranış izole edilir.
 */

const pushMock = vi.fn();
const useRouterMock = vi.fn(() => ({
  push: pushMock,
  back: vi.fn(),
  replace: vi.fn(),
  navigate: vi.fn(),
  dismiss: vi.fn(),
  dismissAll: vi.fn(),
  setParams: vi.fn(),
  canGoBack: () => true,
  canDismiss: () => false,
}));

vi.mock('expo-router', () => ({
  useRouter: () => useRouterMock(),
}));

const { BoardSidebar } = await import('../board-sidebar');

const makeList = (id: string, title: string): BoardList =>
  ({ id, title, archivedAt: null, position: 'a' }) as unknown as BoardList;

const makeCard = (
  id: string,
  title: string,
  listId: string,
  completed = false,
): BoardCard =>
  ({
    id,
    title,
    listId,
    completed,
    position: 'a',
    archivedAt: null,
  }) as unknown as BoardCard;

beforeEach(() => {
  pushMock.mockReset();
  useRouterMock.mockClear();
});

describe('BoardSidebar', () => {
  it('liste başlıklarını ve kart sayılarını gösterir', () => {
    const lists = [makeList('l1', 'Yapılacaklar'), makeList('l2', 'Bitmiş')];
    const cardsByList = new Map<string, readonly BoardCard[]>([
      ['l1', [makeCard('c1', 'A', 'l1'), makeCard('c2', 'B', 'l1')]],
      ['l2', [makeCard('c3', 'C', 'l2')]],
    ]);
    render(<BoardSidebar lists={lists} cardsByList={cardsByList} />);

    expect(screen.getByText('Yapılacaklar')).toBeTruthy();
    expect(screen.getByText('Bitmiş')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('her kartın başlığı sidebar içinde render edilir', () => {
    const lists = [makeList('l1', 'L1')];
    const cardsByList = new Map<string, readonly BoardCard[]>([
      ['l1', [makeCard('c1', 'KartA', 'l1'), makeCard('c2', 'KartB', 'l1')]],
    ]);
    render(<BoardSidebar lists={lists} cardsByList={cardsByList} />);
    expect(screen.getByText('KartA')).toBeTruthy();
    expect(screen.getByText('KartB')).toBeTruthy();
  });

  it('boş liste için "Kart yok" mesajı gösterir', () => {
    const lists = [makeList('l1', 'Boş')];
    const cardsByList = new Map<string, readonly BoardCard[]>([['l1', []]]);
    render(<BoardSidebar lists={lists} cardsByList={cardsByList} />);
    expect(screen.getByText('Kart yok')).toBeTruthy();
  });

  it('kart tap edilince onSelectCard cardId ile çağrılır (router.push yerine)', () => {
    const lists = [makeList('l1', 'L1')];
    const cardsByList = new Map<string, readonly BoardCard[]>([
      ['l1', [makeCard('c1', 'KartA', 'l1')]],
    ]);
    const onSelectCard = vi.fn();
    render(
      <BoardSidebar
        lists={lists}
        cardsByList={cardsByList}
        onSelectCard={onSelectCard}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'KartA' }));
    expect(onSelectCard).toHaveBeenCalledWith('c1');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("onSelectCard verilmezse router.push ile /cards/[cardId]'a basar (fallback)", () => {
    const lists = [makeList('l1', 'L1')];
    const cardsByList = new Map<string, readonly BoardCard[]>([
      ['l1', [makeCard('c1', 'KartA', 'l1')]],
    ]);
    render(<BoardSidebar lists={lists} cardsByList={cardsByList} />);
    fireEvent.click(screen.getByRole('button', { name: 'KartA' }));
    expect(pushMock).toHaveBeenCalledWith({
      pathname: '/cards/[cardId]',
      params: { cardId: 'c1', title: 'KartA' },
    });
  });

  it('optimistic (tmp-) kart disabled — onSelectCard tetiklenmez', () => {
    const lists = [makeList('l1', 'L1')];
    const cardsByList = new Map<string, readonly BoardCard[]>([
      ['l1', [makeCard('tmp-pending-1', 'Henüz yazılmamış', 'l1')]],
    ]);
    const onSelectCard = vi.fn();
    render(
      <BoardSidebar
        lists={lists}
        cardsByList={cardsByList}
        onSelectCard={onSelectCard}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Henüz yazılmamış' }));
    expect(onSelectCard).not.toHaveBeenCalled();
  });

  it('selectedCardId verilince eşleşen kart tıklanabilir kalır (highlight stil testi smoke kapsamında)', () => {
    // Vurgu stilinin DOM yansıması `react-native-web` tarafında implementation
    // detayı (selected vs current vs aria-pressed); 15C.8 manuel smoke'da
    // doğrulanır. Burada selectedCardId prop'u verildiğinde davranışın
    // bozulmadığını (kart yine tıklanır, callback yine çalışır) doğrularız.
    const lists = [makeList('l1', 'L1')];
    const cardsByList = new Map<string, readonly BoardCard[]>([
      ['l1', [makeCard('c1', 'A', 'l1'), makeCard('c2', 'B', 'l1')]],
    ]);
    const onSelectCard = vi.fn();
    render(
      <BoardSidebar
        lists={lists}
        cardsByList={cardsByList}
        selectedCardId="c1"
        onSelectCard={onSelectCard}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onSelectCard).toHaveBeenCalledWith('c2');
  });

  it("optimistik kart aria-disabled='true' bildirir (a11y için)", () => {
    const lists = [makeList('l1', 'L1')];
    const cardsByList = new Map<string, readonly BoardCard[]>([
      ['l1', [makeCard('tmp-x', 'Bekleyen', 'l1')]],
    ]);
    render(<BoardSidebar lists={lists} cardsByList={cardsByList} />);
    const pending = screen.getByRole('button', { name: 'Bekleyen' });
    expect(pending.getAttribute('aria-disabled')).toBe('true');
  });
});
