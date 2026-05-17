/**
 * Salt-okunur tanı betiği — sistemde kayıtlı tüm kullanıcıları listeler.
 *
 * Better Auth `users` tablosundan id / ad / e-posta / doğrulama durumu /
 * kayıt tarihini çeker, en yeni kayıttan eskiye sıralar ve konsola tablo
 * olarak basar. Hiçbir yazma yapmaz; üretim DB'sine karşı çalıştırmak
 * güvenlidir.
 *
 * Çalıştırma (DATABASE_URL hedef DB'ye bakmalı):
 *   pnpm --filter @pusula/db users:list
 *
 * Yalnız e-postaları (örn. başka bir araca pipe etmek için) almak isterseniz:
 *   pnpm --filter @pusula/db users:list -- --emails-only
 */
import { desc } from 'drizzle-orm';
import { createDb } from '../src/client';
import { users } from '../src/schema';

const emailsOnly = process.argv.includes('--emails-only');

async function main() {
  const { db, pool } = createDb();
  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    if (emailsOnly) {
      for (const r of rows) console.log(r.email);
      return;
    }

    console.log(`\nSistemde kayıtlı ${rows.length} kullanıcı:\n`);
    console.table(
      rows.map((r) => ({
        Ad: r.name,
        'E-posta': r.email,
        Doğrulanmış: r.emailVerified ? 'evet' : 'hayır',
        'Kayıt tarihi': r.createdAt.toISOString().slice(0, 10),
      })),
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Kullanıcı listesi alınamadı:', err);
  process.exit(1);
});
