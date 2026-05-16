/**
 * Unit tests for the quiet-hours helper (Faz 10F — DEM-140).
 *
 * Pure / no I/O — drives the helper with deterministic `Date` instances and
 * canned preference rows. The integration tests in
 * `apps/worker/src/jobs/notification-email.test.ts` +
 * `notification-push.test.ts` exercise the helper *through* the processors;
 * this suite covers the algorithm corners (same-day, overnight, empty,
 * malformed input, garbage timezone).
 */
import { describe, expect, it } from 'vitest';
import {
  QUIET_HOURS_BYPASS_TYPES,
  QUIET_HOURS_DEAD_REASON,
  isQuietHoursBypassType,
  isWithinQuietHours,
  minuteOfDayInZone,
  parseHHMM,
} from './quiet-hours';

describe('quiet-hours helper', () => {
  describe('parseHHMM', () => {
    it('parses "09:30" → 570', () => {
      expect(parseHHMM('09:30')).toBe(570);
    });

    it('parses "00:00" → 0', () => {
      expect(parseHHMM('00:00')).toBe(0);
    });

    it('parses "23:59" → 1439', () => {
      expect(parseHHMM('23:59')).toBe(1439);
    });

    it('rejects out-of-range and garbage strings', () => {
      expect(parseHHMM('24:00')).toBeNull();
      expect(parseHHMM('25:00')).toBeNull();
      expect(parseHHMM('12:60')).toBeNull();
      expect(parseHHMM('9:30')).toBeNull(); // we require two-digit hour
      expect(parseHHMM('abc')).toBeNull();
      expect(parseHHMM('')).toBeNull();
    });
  });

  describe('minuteOfDayInZone', () => {
    it('converts a UTC instant to the local minute-of-day in Istanbul (TRT = UTC+3)', () => {
      // 2026-05-15 12:00 UTC → 15:00 Istanbul
      const now = new Date('2026-05-15T12:00:00Z');
      expect(minuteOfDayInZone(now, 'Europe/Istanbul')).toBe(15 * 60);
    });

    it('returns null for an invalid timezone id', () => {
      const now = new Date('2026-05-15T12:00:00Z');
      expect(minuteOfDayInZone(now, 'Mars/Olympus')).toBeNull();
    });

    it('handles wrap-around: Istanbul 02:00 happens at 23:00 UTC the previous day', () => {
      const now = new Date('2026-05-15T23:00:00Z');
      expect(minuteOfDayInZone(now, 'Europe/Istanbul')).toBe(2 * 60);
    });
  });

  describe('isWithinQuietHours — null guards', () => {
    it('returns false when the preference is missing entirely', () => {
      expect(isWithinQuietHours(null, { now: new Date() })).toBe(false);
      expect(isWithinQuietHours(undefined, { now: new Date() })).toBe(false);
    });

    it('returns false when any of the three columns is null', () => {
      const now = new Date();
      expect(
        isWithinQuietHours(
          { quietFrom: null, quietTo: '07:00', quietTimezone: 'Europe/Istanbul' },
          { now },
        ),
      ).toBe(false);
      expect(
        isWithinQuietHours(
          { quietFrom: '23:00', quietTo: null, quietTimezone: 'Europe/Istanbul' },
          { now },
        ),
      ).toBe(false);
      expect(
        isWithinQuietHours(
          { quietFrom: '23:00', quietTo: '07:00', quietTimezone: null },
          { now },
        ),
      ).toBe(false);
    });

    it('returns false when the window collapses (from === to)', () => {
      const now = new Date('2026-05-15T13:00:00Z');
      expect(
        isWithinQuietHours(
          { quietFrom: '09:00', quietTo: '09:00', quietTimezone: 'Europe/Istanbul' },
          { now },
        ),
      ).toBe(false);
    });

    it('returns false when stored HH:MM strings are malformed (defensive)', () => {
      const now = new Date('2026-05-15T13:00:00Z');
      expect(
        isWithinQuietHours(
          { quietFrom: '25:00', quietTo: '07:00', quietTimezone: 'Europe/Istanbul' },
          { now },
        ),
      ).toBe(false);
    });
  });

  describe('isWithinQuietHours — same-day window (09:00 → 17:00, Istanbul)', () => {
    const pref = {
      quietFrom: '09:00',
      quietTo: '17:00',
      quietTimezone: 'Europe/Istanbul',
    };

    it('is true at 12:00 Istanbul (= 09:00 UTC)', () => {
      const now = new Date('2026-05-15T09:00:00Z');
      expect(isWithinQuietHours(pref, { now })).toBe(true);
    });

    it('is true at the lower bound (09:00 Istanbul = 06:00 UTC)', () => {
      const now = new Date('2026-05-15T06:00:00Z');
      expect(isWithinQuietHours(pref, { now })).toBe(true);
    });

    it('is false at the upper bound (17:00 Istanbul = 14:00 UTC) — exclusive', () => {
      const now = new Date('2026-05-15T14:00:00Z');
      expect(isWithinQuietHours(pref, { now })).toBe(false);
    });

    it('is false before the window (08:59 Istanbul)', () => {
      const now = new Date('2026-05-15T05:59:00Z');
      expect(isWithinQuietHours(pref, { now })).toBe(false);
    });
  });

  describe('isWithinQuietHours — overnight window (23:00 → 07:00, Istanbul)', () => {
    const pref = {
      quietFrom: '23:00',
      quietTo: '07:00',
      quietTimezone: 'Europe/Istanbul',
    };

    it('is true at 23:30 Istanbul (= 20:30 UTC)', () => {
      const now = new Date('2026-05-15T20:30:00Z');
      expect(isWithinQuietHours(pref, { now })).toBe(true);
    });

    it('is true at 02:00 Istanbul (= 23:00 UTC the previous day)', () => {
      const now = new Date('2026-05-15T23:00:00Z');
      expect(isWithinQuietHours(pref, { now })).toBe(true);
    });

    it('is false at 12:00 Istanbul (midday is outside the night window)', () => {
      const now = new Date('2026-05-15T09:00:00Z');
      expect(isWithinQuietHours(pref, { now })).toBe(false);
    });

    it('is true at the lower bound (23:00) and false at the upper bound (07:00)', () => {
      // 23:00 Istanbul → 20:00 UTC
      expect(
        isWithinQuietHours(pref, { now: new Date('2026-05-15T20:00:00Z') }),
      ).toBe(true);
      // 07:00 Istanbul → 04:00 UTC — exclusive
      expect(
        isWithinQuietHours(pref, { now: new Date('2026-05-15T04:00:00Z') }),
      ).toBe(false);
    });
  });

  describe('isWithinQuietHours — timezone differences', () => {
    it('the same UTC instant evaluates differently in two zones', () => {
      // 2026-05-15 22:00 UTC — Istanbul (UTC+3 in summer) is 01:00, London is 23:00.
      // Window 23:00–07:00 Istanbul → IN (01:00 ∈ overnight window).
      // Window 23:00–07:00 London   → IN (23:00 is the lower bound).
      const istanbulPref = {
        quietFrom: '23:00',
        quietTo: '07:00',
        quietTimezone: 'Europe/Istanbul',
      };
      const londonPref = {
        quietFrom: '23:00',
        quietTo: '07:00',
        quietTimezone: 'Europe/London',
      };
      const now = new Date('2026-05-15T22:00:00Z');
      expect(isWithinQuietHours(istanbulPref, { now })).toBe(true);
      expect(isWithinQuietHours(londonPref, { now })).toBe(true);

      // 2026-05-15 14:00 UTC — Istanbul is 17:00, London is 15:00.
      // Window 09:00–17:00 Istanbul → exclusive upper bound → OUT.
      // Window 09:00–17:00 London   → 15:00 < 17:00 → IN.
      const istanbulDay = { ...istanbulPref, quietFrom: '09:00', quietTo: '17:00' };
      const londonDay = { ...londonPref, quietFrom: '09:00', quietTo: '17:00' };
      const noon = new Date('2026-05-15T14:00:00Z');
      expect(isWithinQuietHours(istanbulDay, { now: noon })).toBe(false);
      expect(isWithinQuietHours(londonDay, { now: noon })).toBe(true);
    });
  });

  describe('bypass list', () => {
    it('exposes the canonical mute-bypass set', () => {
      expect(QUIET_HOURS_BYPASS_TYPES).toContain('mention');
      expect(QUIET_HOURS_BYPASS_TYPES).toContain('board_invitation');
      expect(QUIET_HOURS_BYPASS_TYPES).toContain('workspace_invitation');
      expect(QUIET_HOURS_BYPASS_TYPES.has('card_assigned')).toBe(false);
    });

    it('isQuietHoursBypassType is a thin predicate over the set', () => {
      expect(isQuietHoursBypassType('mention')).toBe(true);
      expect(isQuietHoursBypassType('card_assigned')).toBe(false);
      expect(isQuietHoursBypassType('comment_reply')).toBe(false);
    });

    it('exports a stable dead-reason constant', () => {
      expect(QUIET_HOURS_DEAD_REASON).toBe('quiet_hours_window');
    });
  });
});
