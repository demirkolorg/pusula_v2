/**
 * Yerel geliştirme yardımcı betiği — bir kullanıcının e-posta+parola
 * (`credential`) parolasını bilinen bir değere set eder.
 *
 * Parolalar Better Auth tarafından scrypt ile hash'lenir; düz metin
 * saklanmaz ve geri çevrilemez. Bu betik yeni parolayı Better Auth'un
 * KENDİ hash fonksiyonuyla (`auth.$context` → `password.hash`) hash'ler,
 * böylece sonuç login doğrulamasıyla birebir uyumludur. Yalnız `accounts`
 * tablosundaki `credential` satırının `password`'unu günceller; mevcut
 * oturumları sonlandırmaz (Better Auth `revokeSessionsOnPasswordReset`
 * yalnız resmi sıfırlama akışında devrededir).
 *
 * Yalnız geliştirme/test içindir — üretim DB'sine karşı çalıştırmayın.
 *
 * Çalıştırma (kök `.env` `DATABASE_URL` hedef DB'ye bakmalı):
 *   pnpm --filter @pusula/api-server users:set-password <email> [parola]
 *
 * `parola` verilmezse e-postanın kendisi parola olur.
 */
import { randomUUID } from 'node:crypto';
import { accounts, and, eq, getDb, getPool, users } from '@pusula/db';
import { auth } from '../src/auth';

const CREDENTIAL_PROVIDER = 'credential';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3] ?? email;

  if (!email) {
    console.error(
      'Kullanım: pnpm --filter @pusula/api-server users:set-password <email> [parola]',
    );
    process.exit(1);
  }

  const db = getDb();

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(`Kullanıcı bulunamadı: ${email}`);
    process.exit(1);
  }

  // Better Auth'un kendi parola hash'leyicisi — login doğrulamasıyla bire bir.
  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(password);

  const [credential] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, CREDENTIAL_PROVIDER)))
    .limit(1);

  if (credential) {
    await db
      .update(accounts)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(accounts.id, credential.id));
    console.warn(`Parola güncellendi — ${user.email} (credential hesabı).`);
  } else {
    // Kullanıcının credential hesabı yoksa (örn. yalnız sosyal giriş) oluştur.
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: user.id,
      providerId: CREDENTIAL_PROVIDER,
      userId: user.id,
      password: hashed,
    });
    console.warn(`Credential hesabı oluşturuldu ve parola set edildi — ${user.email}.`);
  }

  console.warn(`Yeni parola: ${password}`);
}

main()
  .catch((err) => {
    console.error('Parola güncellenemedi:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPool().end();
    } catch {
      /* havuz zaten kapalı olabilir — yoksay */
    }
    process.exit(process.exitCode ?? 0);
  });
