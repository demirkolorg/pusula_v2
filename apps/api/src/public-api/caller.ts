/**
 * Public API + Bot Erişimi (Task 3) — bot kimliğiyle tRPC server-side caller.
 *
 * REST handler'ları iş mantığını yeniden yazmaz; mevcut tRPC procedure'lerini
 * bir server-side caller üzerinden çağırır (plan "Mimari karar özeti": tek
 * source of truth — permission, invariant, activity + outbox + realtime
 * üçlüsü, idempotency hepsi procedure gövdelerinden gelir; caller düz JS
 * objesi döndürür, superjson wire-format sorunu yoktur).
 *
 * Caller context'i, host'un enjekte ettiği best-effort bağımlılık setini
 * (`buildHostContextDeps`) Better Auth yoluyla **aynen** paylaşır; tek fark
 * `session`: bot kullanıcısı + sentetik `api-key:<keyId>` session id'si. Bot,
 * hedef panonun üyesi olduğundan (`board_members` + `guest workspace_members`)
 * `boardProcedure`/`cardProcedure` erişim çözümü normal üye gibi geçer.
 *
 * `clientMutationId` (idempotency köprüsü): `protectedProcedure` üzerindeki
 * `enforceClientMutationId` middleware'i değeri **raw input**'tan okur
 * (`getRawInput`). Bu yüzden caller çağrılarında input'a `clientMutationId`
 * merge edilir — `withClientMutationId` helper'ı (route wiring Task 4).
 */
import type { Context as HonoContext } from 'hono';
import {
  appRouter,
  createCallerFactory,
  createContext,
  type SessionInfo,
  type SessionUser,
} from '@pusula/api';
import { buildHostContextDeps } from '../trpc';

const callerFactory = createCallerFactory(appRouter);

/** Bot caller için sentetik session id — `api-key:<apiKeyId>`. Log/audit'te
 *  Better Auth session id'lerinden anında ayırt edilir. */
export function botSessionId(apiKeyId: string): string {
  return `api-key:${apiKeyId}`;
}

/** Bot kullanıcısını `SessionInfo`'ya map'le (createContext girişi). */
export function buildPublicApiSession(botUser: SessionUser, apiKeyId: string): SessionInfo {
  return {
    user: {
      id: botUser.id,
      email: botUser.email,
      name: botUser.name,
      image: botUser.image ?? null,
    },
    sessionId: botSessionId(apiKeyId),
  };
}

/**
 * Idempotency-Key'ten türeyen `clientMutationId`'yi caller input'una merge et.
 * `enforceClientMutationId` middleware'i raw input'tan okuduğundan zorunlu.
 */
export function withClientMutationId<T extends Record<string, unknown>>(
  input: T,
  clientMutationId: string,
): T & { clientMutationId: string } {
  return { ...input, clientMutationId };
}

export interface PublicApiCallerOptions {
  /** Doğrulanmış bot kullanıcısı (`apiKeyAuth` middleware'inden). */
  botUser: SessionUser;
  /** Doğrulanmış API key id'si — session id + rate-limit anahtarı. */
  apiKeyId: string;
  /** Hono request context — host bağımlılık seti bundan türer. */
  c: HonoContext;
}

/** Bot kimliğiyle bir tRPC server-side caller üret. */
export function createPublicApiCaller({ botUser, apiKeyId, c }: PublicApiCallerOptions) {
  const ctx = createContext({
    session: buildPublicApiSession(botUser, apiKeyId),
    ...buildHostContextDeps(c),
  });
  return callerFactory(ctx);
}

export type PublicApiCaller = ReturnType<typeof createPublicApiCaller>;
