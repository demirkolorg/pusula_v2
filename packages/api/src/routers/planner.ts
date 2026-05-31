import {
  plannerEventGetInputSchema,
  plannerEventListInputSchema,
} from '@pusula/domain';
import { protectedProcedure, router } from '../trpc';
import { getEvent, listPrimaryEvents } from '../lib/google-calendar';

/**
 * Faz 16C (DEM-312) — Planlayıcı paneli için Google Calendar API proxy.
 *
 * **User-scoped** — workspace/board permission'a tabi değil; takvim verisi
 * kişiseldir. `protectedProcedure` yalnız oturum gerektirir.
 *
 * **Token akışı:** `ctx.googleCalendar.getAccessToken` host (`apps/api`)
 * tarafından enjekte edilir; Better Auth `auth.api.getAccessToken({
 * providerId: 'google-calendar', userId })`'i sarmalı. Host injection yoksa
 * (test/route handler) `UNAUTHORIZED GOOGLE_NOT_CONNECTED` döner.
 *
 * Bkz. `docs/architecture/19-takvim-entegrasyonu.md` §5.1 + §8.
 */
export const plannerRouter = router({
  events: router({
    /**
     * Verilen aralıkta primary calendar etkinlik listesi. `staleTime` 5dk +
     * `refetchOnWindowFocus` panel tarafında uygulanır; cooldown yok.
     */
    list: protectedProcedure
      .input(plannerEventListInputSchema)
      .query(async ({ ctx, input }) => {
        if (!ctx.googleCalendar) {
          throw new (await import('@trpc/server')).TRPCError({
            code: 'UNAUTHORIZED',
            message: 'GOOGLE_NOT_CONNECTED',
          });
        }
        return listPrimaryEvents(ctx.session.user.id, input, ctx.googleCalendar);
      }),

    /**
     * Tek etkinlik detayı — modal için. ID Google'ın event ID'si (URL-safe).
     */
    get: protectedProcedure
      .input(plannerEventGetInputSchema)
      .query(async ({ ctx, input }) => {
        if (!ctx.googleCalendar) {
          throw new (await import('@trpc/server')).TRPCError({
            code: 'UNAUTHORIZED',
            message: 'GOOGLE_NOT_CONNECTED',
          });
        }
        return getEvent(ctx.session.user.id, input.eventId, ctx.googleCalendar);
      }),
  }),
});
