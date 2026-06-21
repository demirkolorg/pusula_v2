/**
 * search_documents yeniden indexleme — tüm board'lar için `search_documents`
 * satırlarını mevcut domain durumundan yeniden üretir. Kart açıklaması / yorum
 * gövdesi Tiptap JSON → düz metin dönüşümü (`tiptapToPlainText`) eklendikten
 * sonra eski ham-JSON body'leri düzeltmek için bir kez çalıştırılır.
 *
 * Çalıştırma (DATABASE_URL hedef DB'ye bakmalı):
 *   pnpm --filter @pusula/db exec tsx scripts/reindex-search.ts
 *   pnpm --filter @pusula/db exec tsx scripts/reindex-search.ts --workspace=<id>
 */
import { createDb } from '../src/client';
import { syncSearchDocumentsForScope } from '../src/search-indexer';

const workspaceId = process.argv
  .find((a) => a.startsWith('--workspace='))
  ?.split('=')[1];

async function main(): Promise<void> {
  const { db, pool } = createDb();
  try {
    const result = await syncSearchDocumentsForScope(db, workspaceId ? { workspaceId } : {});
    console.log('Reindex tamam:', result);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Reindex hatası:', e);
  process.exitCode = 1;
});
