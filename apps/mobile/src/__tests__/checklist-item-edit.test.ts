import { describe, expect, it } from 'vitest';
import { resolveChecklistItemRename } from '../lib/checklist-item-edit';

/** DEM-221 — kontrol listesi maddesi satır-içi yeniden adlandırma kararı. */

describe('resolveChecklistItemRename', () => {
  it('boş taslak için null döner (mutation atılmaz)', () => {
    expect(resolveChecklistItemRename('Kira sözleşmesi', '')).toBeNull();
  });

  it('yalnızca boşluktan oluşan taslak için null döner', () => {
    expect(resolveChecklistItemRename('Kira sözleşmesi', '   ')).toBeNull();
  });

  it('değişmemiş metin için null döner (gereksiz mutation elenir)', () => {
    expect(resolveChecklistItemRename('Kira sözleşmesi', 'Kira sözleşmesi')).toBeNull();
  });

  it('yalnız baş/son boşluk farkı varsa null döner', () => {
    expect(resolveChecklistItemRename('Kira sözleşmesi', '  Kira sözleşmesi  ')).toBeNull();
  });

  it('değişen içerik için kırpılmış yeni değeri döner', () => {
    expect(resolveChecklistItemRename('Kira sözleşmesi', '  Kira sözleşmesi kopyası  ')).toBe(
      'Kira sözleşmesi kopyası',
    );
  });
});
