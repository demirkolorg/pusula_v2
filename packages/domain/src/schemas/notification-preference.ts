/**
 * Notification-preference input schemas (Faz 10B — DEM-136; Faz 10F — DEM-140;
 * Faz 10H — DEM-142).
 *
 * The four-tier scope hierarchy is `global > workspace > board > card`. A
 * preference row carries **at most one** of `workspaceId`/`boardId`/`cardId`;
 * a row with all three NULL is the user's global default. The xor-validation
 * lives here so both the tRPC procedure (`notifications.preferences.*`) and
 * any UI client import the same shape — single source of truth.
 *
 * Why xor (and not "use the narrowest set")? The doc model is "one row per
 * (user, scope-dimension)", not "the union of scope dimensions". Allowing
 * `{ workspaceId, boardId }` together would either be a no-op (the board id
 * is already inside the workspace) or contradictory (the board belongs to a
 * different workspace) — both ambiguities are easier to reject early than
 * disambiguate in the rule engine, which already picks scope by narrowest.
 *
 * Quiet-hours fields (Faz 10F): the three columns `quietFrom`/`quietTo`/
 * `quietTimezone` travel together (all-or-nothing) and are meaningful only
 * on the global scope row. The DB CHECK constraint
 * `notification_preferences_quiet_hours_consistency` enforces the same
 * shape; refusing partial input here gives the API a clean 400 instead of
 * a 500 from the constraint.
 *
 * See `docs/architecture/06-bildirim-altyapisi.md` "Notification preferences
 * API" + "Quiet hours" and `docs/domain/04-bildirim-kurallari.md` "Tercihler
 * ve bastırma".
 */
import { z } from 'zod';
import { EMAIL_DIGEST_MODES, MUTE_LEVELS } from '../constants';
import { idSchema, withClientMutationId } from './common';

/**
 * Bare scope-column shape, suitable for spreading into other `z.object()`
 * inputs (mutations that pair scope with the preference toggles). The
 * xor-validation is applied **after** the spread because Zod refinements
 * don't compose with `.extend()` — see the *Input schemas* below.
 */
const scopeShape = {
  workspaceId: idSchema.optional(),
  boardId: idSchema.optional(),
  cardId: idSchema.optional(),
} as const;

/**
 * Xor-validation: at most one of the three scope dimensions is set. The
 * predicate accepts the looser `unknown`-ish shape because `.refine()` is
 * applied to both `notificationPreferenceScopeSchema` and the larger upsert
 * input, and the two carry overlapping but not identical types.
 */
function exactlyOneOrZeroScope(s: {
  workspaceId?: string | undefined;
  boardId?: string | undefined;
  cardId?: string | undefined;
}): boolean {
  return [s.workspaceId, s.boardId, s.cardId].filter((v) => v !== undefined && v !== null)
    .length <= 1;
}

const xorErrorMessage =
  'Bildirim tercihi kapsamı için workspaceId, boardId veya cardId alanlarından en fazla biri verilebilir.';

/** Mute-level enum mirrored from `MUTE_LEVELS` in `@pusula/domain/constants`. */
export const muteLevelSchema = z.enum(MUTE_LEVELS);

/**
 * E-posta sıklığı / digest modu (Faz 10G — DEM-141). `'instant'` (default)
 * mevcut transactional davranıştır; `'hourly_digest'` / `'daily_digest'`
 * `notification-email-digest` worker'ını tetikler; `'off'` ise email kanalı
 * outbox'a hiç insert edilmez. Yalnız **global** scope satırında anlamlıdır
 * (workspace/board/card override'larında bu alan tutulmaz — refine aşağıda).
 */
export const emailDigestModeSchema = z.enum(EMAIL_DIGEST_MODES);

/**
 * Wall-clock time as `HH:MM` — the form an `<input type="time">` produces
 * and Postgres accepts for a `time` column without further parsing. We
 * intentionally drop seconds and any timezone offset (the zone travels in
 * `quietTimezone`).
 */
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const quietHourTimeSchema = z
  .string()
  .regex(HHMM_REGEX, { message: 'Saat HH:MM biçiminde olmalı (örn. 23:00).' });

/**
 * IANA timezone id (e.g. `Europe/Istanbul`). Runtime-validated via
 * `Intl.supportedValuesOf` when available — falls back to a minimal regex
 * shape check on older runtimes. Browser-side `<select>` lists hand us one
 * of the canonical ids; the regex catches obvious garbage from API clients.
 */
const supportedTimeZones: ReadonlySet<string> | null = (() => {
  try {
    const fn = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (typeof fn === 'function') {
      return new Set(fn('timeZone'));
    }
  } catch {
    // ignore; we fall through to the regex check
  }
  return null;
})();

const IANA_TZ_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
export const ianaTimezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (value) => {
      if (!IANA_TZ_SHAPE.test(value)) return false;
      // ICU rejects unknown ids at construction — that is the authoritative
      // check. We do *not* gate on `supportedValuesOf` because Node 22 omits
      // legacy aliases such as `Etc/UTC` / `GMT` from the list even though
      // ICU resolves them fine. The `supportedTimeZones` constant is kept
      // around for future heuristics; reading it here keeps the
      // tree-shaker from dropping it and surfaces the intent.
      void supportedTimeZones;
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Geçerli bir IANA zaman dilimi gerekli (örn. Europe/Istanbul).' },
  );

/**
 * The quiet-hours triplet validator — used by `notificationPreferenceUpsertInput`.
 * Encapsulated so a malformed combination produces a single error path on
 * a stable field rather than three independent ones; the caller can attach
 * it as a `.superRefine` and the UI displays one consolidated message.
 */
function validateQuietHoursTriplet(
  input: {
    quietFrom?: string | null;
    quietTo?: string | null;
    quietTimezone?: string | null;
    workspaceId?: string;
    boardId?: string;
    cardId?: string;
  },
  ctx: z.RefinementCtx,
): void {
  const trio: Array<['quietFrom' | 'quietTo' | 'quietTimezone', string | null | undefined]> = [
    ['quietFrom', input.quietFrom ?? null],
    ['quietTo', input.quietTo ?? null],
    ['quietTimezone', input.quietTimezone ?? null],
  ];
  const filled = trio.filter(([, v]) => v != null && v !== '');
  const allEmpty = filled.length === 0;
  const allFilled = filled.length === 3;
  if (!allEmpty && !allFilled) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Sessiz saatler için başlangıç, bitiş ve zaman dilimi alanlarının üçü birden dolu veya üçü birden boş olmalı.',
      path: ['quietFrom'],
    });
  }
  if (
    allFilled &&
    (input.workspaceId !== undefined ||
      input.boardId !== undefined ||
      input.cardId !== undefined)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Sessiz saatler yalnızca genel (global) tercihte ayarlanır.',
      path: ['quietTimezone'],
    });
  }
}

/**
 * Faz 10G (DEM-141): `emailMode` yalnız global scope satırında anlamlıdır.
 * Workspace/board/card override'ında `emailMode` set edilmişse reddet —
 * digest mantığı global tercihten okur, scope satırlarında değer tutulsa
 * bile worker görmezden gelir; istemcinin yanlış varsayım üretmemesi için
 * burada kestik. `'instant'` default değeri scope override'larda kabul
 * edilir (efektif olarak no-op).
 */
function validateEmailModeScope(
  input: {
    emailMode?: (typeof EMAIL_DIGEST_MODES)[number];
    workspaceId?: string;
    boardId?: string;
    cardId?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.emailMode == null) return;
  if (input.emailMode === 'instant') return; // varsayılan; scope override'da no-op
  if (
    input.workspaceId !== undefined ||
    input.boardId !== undefined ||
    input.cardId !== undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "E-posta sıklığı yalnızca genel (global) tercihte ayarlanır; kapsam tercihinde 'instant' kalmalı.",
      path: ['emailMode'],
    });
  }
}

/**
 * Scope-only input: at most one of `workspaceId`/`boardId`/`cardId` set.
 * Reused by `preferences.get`/`preferences.delete` and exposed for clients
 * that want to validate a scope independently.
 */
export const notificationPreferenceScopeSchema = z
  .object(scopeShape)
  .refine(exactlyOneOrZeroScope, { message: xorErrorMessage });

/**
 * Full upsert input: scope (xor) + the four preference fields + the optional
 * quiet-hours triplet (Faz 10F) + the collaborative `clientMutationId` mixin.
 *
 * Quiet-hours fields are nullable to support the "turn it off" path: the UI
 * sends `quietFrom: null, quietTo: null, quietTimezone: null` to clear the
 * window. Sending the triplet partially (only one or two non-null) is
 * rejected by the `superRefine` below — same shape the DB CHECK enforces.
 *
 * `mentionOnly` and the channel toggles are stored verbatim; `muteLevel`
 * drives the rule engine (`packages/api/src/lib/notification-rules.ts`).
 */
export const notificationPreferenceUpsertInput = z
  .object({
    ...scopeShape,
    muteLevel: muteLevelSchema,
    mentionOnly: z.boolean(),
    pushEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    // Faz 10F (DEM-140) — optional global quiet-hours window. Nulls clear
    // the window; non-null requires all three to be set and the scope to
    // be global (no workspaceId/boardId/cardId).
    quietFrom: quietHourTimeSchema.nullable().optional(),
    quietTo: quietHourTimeSchema.nullable().optional(),
    quietTimezone: ianaTimezoneSchema.nullable().optional(),
    // Faz 10G (DEM-141) — e-posta sıklığı / digest. Optional: var olan
    // çağıranlar (mevcut tab'lar) bu alanı yollamasa da çalışsın diye
    // optional bırakıyoruz; procedure katmanı eksik input için DB
    // default'u (`'instant'`) korur. Sadece global scope'ta anlamlı
    // (superRefine `validateEmailModeScope` enforce eder).
    emailMode: emailDigestModeSchema.optional(),
    ...withClientMutationId,
  })
  .refine(exactlyOneOrZeroScope, { message: xorErrorMessage })
  .superRefine(validateQuietHoursTriplet)
  .superRefine(validateEmailModeScope);

/** Get input: just the scope dimensions. */
export const notificationPreferenceGetInput = notificationPreferenceScopeSchema;

/**
 * Delete input: scope (xor) + the collaborative `clientMutationId`. Mutations
 * carry the id; we add it explicitly here rather than via `.extend()` because
 * `.refine()` blocks `.extend()` chaining on the scope schema.
 */
export const notificationPreferenceDeleteInput = z
  .object({
    ...scopeShape,
    ...withClientMutationId,
  })
  .refine(exactlyOneOrZeroScope, { message: xorErrorMessage });

export type NotificationPreferenceScope = z.infer<typeof notificationPreferenceScopeSchema>;
export type NotificationPreferenceUpsertInput = z.infer<typeof notificationPreferenceUpsertInput>;
export type NotificationPreferenceGetInput = z.infer<typeof notificationPreferenceGetInput>;
export type NotificationPreferenceDeleteInput = z.infer<typeof notificationPreferenceDeleteInput>;

// ───────────────────────────────────────────────────────────────────────────
// Faz 10H (DEM-142) — Snooze: kart bazında geçici sustur.
//
// Snooze ayrı endpoint'lerle ifade edilir (`notifications.preferences.snooze`
// / `unsnooze`) çünkü tek-aksiyonlu UX (kart detay dropdown'ı) için `upsert`
// üzerinden tüm tercih alanlarını taşımak gereksiz; ayrıca `duration` enum'ı
// server-side timestamp hesabını sağlar (client'tan geçmiş tarih gönderme
// veya hatalı süre yollama imkânı kalmaz). Süresi dolmuş `mute_until` satırı
// rule engine tarafından görmezden gelinir; satır audit için silinmez.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Snooze süre seçenekleri. `until_date` seçildiğinde `untilDate` zorunlu;
 * diğer durumlarda yok sayılır. Server-side timestamp hesabı:
 *   1h → now + 1 hour
 *   4h → now + 4 hours
 *   1d → now + 1 day
 *   1w → now + 7 days
 *   until_date → input.untilDate (gelecek tarih + max 1 yıl ileri)
 */
export const snoozeDurationSchema = z.enum(['1h', '4h', '1d', '1w', 'until_date']);

/**
 * `notifications.preferences.snooze({ cardId, duration, untilDate? })` input.
 * `cardId` zorunlu — snooze yalnız card-scope'ta tanımlı (V1). Refine:
 *   - `duration === 'until_date'` ise `untilDate` zorunlu.
 *   - Aksi halde `untilDate` verilse bile yok sayılır (extra-strict reject
 *     etmiyoruz; client gereksiz alan göndermesinde sessiz tolerans).
 *
 * Tarih sınırları (gelecek + 1 yıl üst sınır) procedure tarafında kontrol
 * edilir — Zod schema saat hesabı yapmaz, yalnız şekil doğrular.
 */
export const snoozeInput = z
  .object({
    cardId: idSchema,
    duration: snoozeDurationSchema,
    untilDate: z.coerce.date().optional(),
    ...withClientMutationId,
  })
  .refine(
    (s) => (s.duration === 'until_date' ? s.untilDate instanceof Date : true),
    {
      message: "'until_date' süresi seçildiğinde 'untilDate' zorunludur.",
      path: ['untilDate'],
    },
  );

/** `notifications.preferences.unsnooze({ cardId })` input. */
export const unsnoozeInput = z.object({
  cardId: idSchema,
  ...withClientMutationId,
});

export type SnoozeDuration = z.infer<typeof snoozeDurationSchema>;
export type SnoozeInput = z.infer<typeof snoozeInput>;
export type UnsnoozeInput = z.infer<typeof unsnoozeInput>;
