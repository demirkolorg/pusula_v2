/**
 * Public API + Bot Erişimi (Task 10) — OpenAPI spec drift + servis testi.
 *
 * Bu test iki şeyi garanti eder:
 *  (a) `GET /openapi.json` **auth'suz** 200 döner ve `openapi` alanı "3.1" ile
 *      başlar (kontrol: aynı app'te `GET /me` key'siz 401 → auth katmanı aktif,
 *      openapi onu bilinçle atlıyor).
 *  (b) Elle bakımlı spec ile gerçek Hono route yüzeyi arasında **iki yönlü**
 *      drift yoktur: spec'te olmayan bir route ya da route'u olmayan bir spec
 *      path'i testi düşürür. Yeni bir REST ucu eklenip spec güncellenmezse (ya
 *      da tersi) burada yakalanır.
 *
 * Route introspection: Hono `app.routes` her kaydı `{ method, path }` olarak
 * tutar (mount edilen alt-app'ler `route()` ile aynı `routes` dizisine
 * birleşir). `use('*')` middleware'leri `method === 'ALL'` ile; `/openapi.json`
 * ucu spec dışı olduğundan path ile elenir. Path parametreleri `:x` (Hono) ve
 * `{x}` (OpenAPI) arasında `{param}` yer tutucusuna normalize edilerek
 * karşılaştırılır.
 */
// `../../app`'i ÖNCE değerlendir: `./index` doğrudan entry olursa
// caller → trpc → app.ts → (henüz bitmemiş) index.ts döngüsünde `publicApiRoute`
// `undefined` kalır (cors.test.ts ile aynı disiplin). app.ts entry olunca zincir
// doğru sırada çözülür.
import '../../app';
import { describe, expect, it, vi } from 'vitest';
import { createPublicApiRoute } from './index';
import { openApiDocument } from './openapi';

/** `:cardId` (Hono) ve `{cardId}` (OpenAPI) → `{param}` yer tutucusu. */
function normalizePath(path: string): string {
  return path.replace(/[:{]([A-Za-z0-9_]+)}?/g, '{param}');
}

/** Rate-limit + dedup store'suz app (Redis'e dokunmadan introspection + openapi servisi). */
function buildApp() {
  return createPublicApiRoute({ rateLimitStore: null, idempotencyStore: null, reportError: vi.fn() });
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Spec `paths` → `{ "GET /me", "POST /cards", ... }` (normalize edilmiş). */
function specOperations(): Set<string> {
  const ops = new Set<string>();
  for (const [path, item] of Object.entries(openApiDocument.paths)) {
    for (const method of HTTP_METHODS) {
      if (method in item) ops.add(`${method.toUpperCase()} ${normalizePath(path)}`);
    }
  }
  return ops;
}

/** Kayıtlı Hono route'ları → middleware (ALL) + `/openapi.json` hariç. */
function routeOperations(): Set<string> {
  const ops = new Set<string>();
  for (const route of buildApp().routes) {
    if (route.method === 'ALL') continue; // use('*') middleware
    if (route.path === '/openapi.json') continue; // spec dışı, auth'suz uç
    ops.add(`${route.method.toUpperCase()} ${normalizePath(route.path)}`);
  }
  return ops;
}

describe('/api/v1 — GET /openapi.json', () => {
  it('auth olmadan 200 döner ve openapi 3.1 spec verir', async () => {
    const res = await buildApp().request('/openapi.json');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { openapi: string; info: { title: string } };
    expect(body.openapi.startsWith('3.1')).toBe(true);
    expect(body.info.title).toBe('Pusula Public API');
  });

  it('kontrol: aynı app /me ucunu key olmadan 401 ile korur (auth aktif)', async () => {
    const res = await buildApp().request('/me');
    expect(res.status).toBe(401);
  });
});

describe('/api/v1 — OpenAPI spec ↔ route drift', () => {
  it('spec her kayıtlı route ucunu kapsar (route var, spec yok = FAIL)', () => {
    const routes = routeOperations();
    const spec = specOperations();
    const missingInSpec = [...routes].filter((op) => !spec.has(op)).sort();
    expect(missingInSpec).toEqual([]);
  });

  it('spec fazladan (route olmayan) path içermez (spec var, route yok = FAIL)', () => {
    const routes = routeOperations();
    const spec = specOperations();
    const missingRoute = [...spec].filter((op) => !routes.has(op)).sort();
    expect(missingRoute).toEqual([]);
  });

  it('spec en az 40 operasyon tanımlar (yüzey erozyonuna karşı alt sınır)', () => {
    expect(specOperations().size).toBeGreaterThanOrEqual(40);
  });
});
