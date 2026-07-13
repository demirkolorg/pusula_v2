/**
 * Public API + Bot Erişimi (Task 4) — `/api/v1` Hono alt-uygulaması.
 *
 * Zincir (plan "İstek akışı"):
 *   request id (app.ts global) → body limit (1MB) → apiKeyAuth (+ per-key Redis
 *   rate limit) → REST handler → bot caller → mevcut tRPC procedure.
 *
 * `GET /me` burada (key/bot meta); board / lists / cards alt route'ları mount
 * edilir. `apiKeyAuth` `use('*')` ile mount'lardan ÖNCE eklenir → tüm alt
 * uçlar için çalışır ve `Cache-Control: no-store` her yanıta düşer.
 *
 * CORS bilinçli olarak burada AÇILMAZ: `/api/v1` server-to-server'dır; tarayıcı
 * origin izni verilmez (app.ts global `cors` yalnız `env.APP_URL`'i yansıtır,
 * asla `*`). Bkz. plan "Güvenlik kontrol listesi".
 */
import { Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  apiKeyAuth,
  type ApiKeyAuthEnv,
  type ApiKeyRateLimitStore,
} from '../../middleware/api-key-auth';
import { rateLimit } from '../../middleware/rate-limit';
import { idempotencyDedup, type IdempotencyStore } from '../../public-api/idempotency-store';
import { apiKeyIdempotencyStore, apiKeyRateLimitStore } from '../../public-api/rate-limit-redis';
import { attachmentsPublicRoute } from './attachments';
import { boardPublicRoute } from './board';
import { cardMembersPublicRoute } from './card-members';
import { cardsPublicRoute } from './cards';
import { checklistsPublicRoute } from './checklists';
import { commentsPublicRoute } from './comments';
import { labelsPublicRoute } from './labels';
import { listsPublicRoute } from './lists';
import { openApiDocument } from './openapi';

/** 1 MB — AI ajanı payload'ları küçük; büyük gövde ucuzca reddedilir. */
const MAX_BODY_BYTES = 1_048_576;

/** Kimlik-öncesi IP rate limit — dakikada per-IP azami istek (kaba DoS eşiği). */
const IP_RATE_LIMIT_MAX = 240;
/** Kimlik-öncesi IP rate limit penceresi (ms) — 1 dakika. */
const IP_RATE_LIMIT_WINDOW_MS = 60_000;
/** Kimlik-öncesi IP rate limit 429 mesajı (public API zarfına sarılır). */
const IP_RATE_LIMIT_MESSAGE = 'İstek limiti aşıldı. Lütfen sonra tekrar deneyin.';

/**
 * IP limiter'ın 429 gövdesini public API zarfına çevir.
 *
 * `middleware/rate-limit.ts` helper'ı `/share` uçlarına aittir ve 429'da
 * `{ error: "mesaj" }` (düz string) döner; `/api/v1` zarfı ise
 * `{ error: { code, message } }` ister (apiKeyAuth per-key 429'uyla tutarlı).
 * Helper'a dokunmadan (o `/share`'ın sözleşmesi) yalnız bu route'ta 429 gövdesini
 * yeniden yazan ince bir sarmalayıcı. `Retry-After` korunur; limiter'ın paylaşılan
 * bucket'ı (ve `clearRateLimitBuckets` test resetini) aynen kullanılır. Limit
 * altındaki (next'e geçen) istekler dokunulmadan akar.
 */
function envelopeRateLimit429(inner: MiddlewareHandler): MiddlewareHandler {
  return async (c, next) => {
    let passed = false;
    const res = await inner(c, async () => {
      passed = true;
      await next();
    });
    if (!passed && res instanceof Response && res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      return c.json(
        { error: { code: 'TOO_MANY_REQUESTS', message: IP_RATE_LIMIT_MESSAGE } },
        429,
        retryAfter ? { 'Retry-After': retryAfter } : undefined,
      );
    }
    return res;
  };
}

export interface PublicApiRouteOptions {
  /**
   * Enjekte edilebilir rate limit store. Verilmezse production ioredis store'u
   * kullanılır; testler in-memory fake (veya `null` = rate limit kapalı) geçer.
   * `maxRetriesPerRequest: null` olan production connection Redis yokken
   * komutları asla reddetmez (sonsuz kuyruk) — testlerde bu yüzden asla
   * çağrılmaz.
   */
  rateLimitStore?: ApiKeyRateLimitStore | null;
  /**
   * Enjekte edilebilir `Idempotency-Key` dedup store'u. Verilmezse production
   * ioredis store'u kullanılır; testler in-memory fake (veya `null` = dedup
   * kapalı) geçer. rateLimitStore ile aynı disiplin — prod connection testte
   * asla çağrılmaz.
   */
  idempotencyStore?: IdempotencyStore | null;
  /** apiKeyAuth + dedup Redis-hata raporlayıcısı (fail-open); testler vi.fn() geçer. */
  reportError?: (err: unknown, context: string) => void;
}

/** `/api/v1` Hono alt-uygulamasını kur (production + test için tek yol). */
export function createPublicApiRoute(options: PublicApiRouteOptions = {}): Hono<ApiKeyAuthEnv> {
  const store =
    'rateLimitStore' in options ? (options.rateLimitStore ?? null) : apiKeyRateLimitStore;
  const idempotencyStore =
    'idempotencyStore' in options ? (options.idempotencyStore ?? null) : apiKeyIdempotencyStore;

  const app = new Hono<ApiKeyAuthEnv>();

  // GET /openapi.json — makine-okur spec, AUTH'SUZ. Body limit + apiKeyAuth
  // middleware'lerinden ÖNCE tanımlanır: handler yanıtı `next()` çağırmadan
  // sonlandırdığı için compose zinciri auth katmanına hiç girmez (bot yüzeyi
  // key olmadan keşfeder). Statik spec olduğundan public cache'lenebilir.
  app.get('/openapi.json', (c) => {
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(openApiDocument);
  });

  // Kimlik-ÖNCESİ IP rate limit (kaba DoS eşiği): apiKeyAuth DB lookup'ından
  // önce, kimliği doğrulanmamış istemcileri per-IP sınırlar. `/share` uçlarıyla
  // aynı in-memory helper (single-process; production reverse proxy
  // `x-forwarded-for`'u güvenilir set etmeli). `/openapi.json` bu `use`'dan ÖNCE
  // tanımlandığı için bu limitin dışındadır (auth'suz keşif ucu).
  app.use(
    '*',
    envelopeRateLimit429(
      rateLimit({
        key: 'public-api-ip',
        windowMs: IP_RATE_LIMIT_WINDOW_MS,
        max: IP_RATE_LIMIT_MAX,
        message: IP_RATE_LIMIT_MESSAGE,
      }),
    ),
  );

  // Body limit (auth'tan önce — büyük gövde kimlik doğrulamadan reddedilir).
  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json(
          { error: { code: 'PAYLOAD_TOO_LARGE', message: 'İstek gövdesi çok büyük (maks. 1MB).' } },
          413,
        ),
    }),
  );

  // API key kimliği + per-key Redis rate limit. `Cache-Control: no-store` dahil.
  app.use(
    '*',
    apiKeyAuth({
      rateLimitStore: store,
      ...(options.reportError ? { reportError: options.reportError } : {}),
    }),
  );

  // `Idempotency-Key` dedup (best-effort, 24h). apiKeyAuth'tan SONRA — cache
  // anahtarı kimliği doğrulanmış `apiKey.id`'ye scope'lanır. Mutasyon dışı
  // metotlar ve anahtarsız istekler dokunulmadan geçer; store hatası fail-open.
  app.use(
    '*',
    idempotencyDedup({
      store: idempotencyStore,
      ...(options.reportError ? { reportError: options.reportError } : {}),
    }),
  );

  // GET /me — key/bot meta.
  app.get('/me', (c) => {
    const { apiKey, botUser } = c.get('apiKeyAuth');
    return c.json({
      bot: { id: botUser.id, name: botUser.name },
      boardId: apiKey.boardId,
      role: apiKey.role,
      expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
      createdAt: apiKey.createdAt.toISOString(),
    });
  });

  app.route('/board', boardPublicRoute);
  app.route('/lists', listsPublicRoute);
  // Birden çok alt-uygulama aynı `/cards` önekine mount edilir (Hono route'ları
  // birleştirir); path segmentleri ayrıştığı için çakışma yok
  // (`/:cardId/checklists`, `/:cardId/comments`, `/:cardId/members`,
  // `/:cardId/labels`, `/:cardId/attachments/*`).
  app.route('/cards', cardsPublicRoute);
  app.route('/cards', checklistsPublicRoute);
  app.route('/cards', commentsPublicRoute);
  app.route('/cards', cardMembersPublicRoute);
  app.route('/cards', attachmentsPublicRoute);
  app.route('/labels', labelsPublicRoute);

  return app;
}

/** app.ts'e mount edilen production instance (ioredis rate limit store). */
export const publicApiRoute = createPublicApiRoute();
