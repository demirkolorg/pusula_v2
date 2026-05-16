/**
 * Unit tests for `notificationPreferenceUpsertInput` quiet-hours validation
 * (Faz 10F — DEM-140). The Faz 10B suite already covers scope xor and
 * channel toggles; this file exercises the new `superRefine` branch.
 */
import { describe, expect, it } from 'vitest';
import {
  ianaTimezoneSchema,
  notificationPreferenceUpsertInput,
  quietHourTimeSchema,
} from './notification-preference';

describe('quietHourTimeSchema', () => {
  it('accepts HH:MM in [00:00, 23:59]', () => {
    expect(quietHourTimeSchema.parse('00:00')).toBe('00:00');
    expect(quietHourTimeSchema.parse('07:30')).toBe('07:30');
    expect(quietHourTimeSchema.parse('23:59')).toBe('23:59');
  });

  it('rejects out-of-range / missing-digit / garbage', () => {
    expect(quietHourTimeSchema.safeParse('24:00').success).toBe(false);
    expect(quietHourTimeSchema.safeParse('09:60').success).toBe(false);
    expect(quietHourTimeSchema.safeParse('9:30').success).toBe(false);
    expect(quietHourTimeSchema.safeParse('foo').success).toBe(false);
    expect(quietHourTimeSchema.safeParse('').success).toBe(false);
  });
});

describe('ianaTimezoneSchema', () => {
  it('accepts canonical IANA zone ids', () => {
    expect(ianaTimezoneSchema.parse('Europe/Istanbul')).toBe('Europe/Istanbul');
    expect(ianaTimezoneSchema.parse('America/New_York')).toBe('America/New_York');
    // `Etc/UTC` is the IANA canonical form for UTC; bare 'UTC' is a CLDR
    // alias and `Intl.supportedValuesOf('timeZone')` may not include it on
    // every runtime. We accept whichever form a UA hands us via Select.
    expect(ianaTimezoneSchema.parse('Etc/UTC')).toBe('Etc/UTC');
  });

  it('rejects obvious nonsense', () => {
    expect(ianaTimezoneSchema.safeParse('').success).toBe(false);
    expect(ianaTimezoneSchema.safeParse('Mars/Olympus').success).toBe(false);
    expect(ianaTimezoneSchema.safeParse('Foo Bar').success).toBe(false);
  });
});

describe('notificationPreferenceUpsertInput — quiet hours', () => {
  const base = {
    muteLevel: 'none' as const,
    mentionOnly: false,
    pushEnabled: true,
    emailEnabled: true,
    // `clientMutationId` is strict UUID — synthesised per test via crypto.
    clientMutationId: crypto.randomUUID(),
  };

  it('accepts the global preference with the quiet-hours window set', () => {
    const parsed = notificationPreferenceUpsertInput.parse({
      ...base,
      quietFrom: '23:00',
      quietTo: '07:00',
      quietTimezone: 'Europe/Istanbul',
    });
    expect(parsed.quietFrom).toBe('23:00');
    expect(parsed.quietTo).toBe('07:00');
    expect(parsed.quietTimezone).toBe('Europe/Istanbul');
  });

  it('accepts the global preference with the triplet cleared (null × 3)', () => {
    const parsed = notificationPreferenceUpsertInput.parse({
      ...base,
      quietFrom: null,
      quietTo: null,
      quietTimezone: null,
    });
    expect(parsed.quietFrom).toBeNull();
  });

  it('accepts the global preference with the triplet omitted entirely', () => {
    const parsed = notificationPreferenceUpsertInput.parse(base);
    expect(parsed.quietFrom).toBeUndefined();
  });

  it('rejects a partial triplet (only quietFrom set)', () => {
    const result = notificationPreferenceUpsertInput.safeParse({
      ...base,
      quietFrom: '23:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a partial triplet (only two of three set)', () => {
    const result = notificationPreferenceUpsertInput.safeParse({
      ...base,
      quietFrom: '23:00',
      quietTimezone: 'Europe/Istanbul',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid quietFrom HH:MM', () => {
    const result = notificationPreferenceUpsertInput.safeParse({
      ...base,
      quietFrom: '25:00',
      quietTo: '07:00',
      quietTimezone: 'Europe/Istanbul',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown timezone id', () => {
    const result = notificationPreferenceUpsertInput.safeParse({
      ...base,
      quietFrom: '23:00',
      quietTo: '07:00',
      quietTimezone: 'Mars/Olympus',
    });
    expect(result.success).toBe(false);
  });

  it('rejects quiet hours when scope is workspace', () => {
    const result = notificationPreferenceUpsertInput.safeParse({
      ...base,
      workspaceId: 'w-1',
      quietFrom: '23:00',
      quietTo: '07:00',
      quietTimezone: 'Europe/Istanbul',
    });
    expect(result.success).toBe(false);
  });

  it('rejects quiet hours when scope is board', () => {
    const result = notificationPreferenceUpsertInput.safeParse({
      ...base,
      boardId: 'b-1',
      quietFrom: '23:00',
      quietTo: '07:00',
      quietTimezone: 'Europe/Istanbul',
    });
    expect(result.success).toBe(false);
  });

  it('rejects quiet hours when scope is card', () => {
    const result = notificationPreferenceUpsertInput.safeParse({
      ...base,
      cardId: 'c-1',
      quietFrom: '23:00',
      quietTo: '07:00',
      quietTimezone: 'Europe/Istanbul',
    });
    expect(result.success).toBe(false);
  });

  it('allows scope=workspace with cleared (null) quiet hours', () => {
    const parsed = notificationPreferenceUpsertInput.parse({
      ...base,
      workspaceId: 'w-1',
      quietFrom: null,
      quietTo: null,
      quietTimezone: null,
    });
    expect(parsed.workspaceId).toBe('w-1');
    expect(parsed.quietFrom).toBeNull();
  });
});
