import { describe, expect, it } from 'vitest';
import {
  SCROLL_TOP_INSET,
  resolveHighlightScroll,
} from '@/components/card-detail/scroll-highlight-logic';

describe('resolveHighlightScroll', () => {
  const base = {
    id: 'comment-1',
    targetId: 'comment-1',
    alreadyScrolled: false,
    y: 800,
    reduceMotion: false,
  };

  it('hedef id eşleşince inset uygulanmış y ile animasyonlu kaydırır', () => {
    expect(resolveHighlightScroll(base)).toEqual({
      scrollY: 800 - SCROLL_TOP_INSET,
      animated: true,
    });
  });

  it('id aktif hedefle eşleşmiyorsa kaydırmaz', () => {
    expect(resolveHighlightScroll({ ...base, id: 'comment-2' })).toBeNull();
  });

  it('aktif hedef yoksa (null) kaydırmaz', () => {
    expect(resolveHighlightScroll({ ...base, targetId: null })).toBeNull();
  });

  it('zaten kaydırıldıysa tekrar kaydırmaz (tek seferlik guard)', () => {
    expect(resolveHighlightScroll({ ...base, alreadyScrolled: true })).toBeNull();
  });

  it('reduced-motion açıkken animasyonsuz konumlanır', () => {
    expect(resolveHighlightScroll({ ...base, reduceMotion: true })).toEqual({
      scrollY: 800 - SCROLL_TOP_INSET,
      animated: false,
    });
  });

  it('inset üstündeki yakın hedefte scrollY 0 altına inmez (clamp)', () => {
    // Hedef en üstteyse (y < inset) negatif scrollY yerine 0.
    expect(resolveHighlightScroll({ ...base, y: 40 })).toEqual({
      scrollY: 0,
      animated: true,
    });
  });

  it('özel topInset değerini kullanır', () => {
    expect(resolveHighlightScroll({ ...base, y: 500, topInset: 100 })).toEqual({
      scrollY: 400,
      animated: true,
    });
  });
});
