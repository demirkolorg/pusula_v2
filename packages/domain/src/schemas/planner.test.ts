import { describe, expect, it } from 'vitest';
import {
  plannerEventAttendeeSchema,
  plannerEventGetInputSchema,
  plannerEventListInputSchema,
  plannerEventSchema,
  plannerEventTimeSchema,
} from './planner';

/**
 * Faz 16D (DEM-313) — Planlayıcı Zod şemalarının input doğrulama testleri.
 * Sözleşme şekli sabit kalmalı: 16C `google-calendar.ts` mapper ve panel
 * UI bu şemalara bağlı, kırılırsa hem backend hem frontend domino.
 */

describe('plannerEventTimeSchema', () => {
  it('accepts a timed start (dateTime + timeZone)', () => {
    const parsed = plannerEventTimeSchema.parse({
      dateTime: '2026-06-01T10:30:00+03:00',
      timeZone: 'Europe/Istanbul',
    });
    expect(parsed.dateTime).toBe('2026-06-01T10:30:00+03:00');
    expect(parsed.date).toBeUndefined();
  });

  it('accepts an all-day start (date only)', () => {
    const parsed = plannerEventTimeSchema.parse({ date: '2026-06-01' });
    expect(parsed.date).toBe('2026-06-01');
    expect(parsed.dateTime).toBeUndefined();
  });

  it('accepts an empty object (Google rarely omits both)', () => {
    expect(() => plannerEventTimeSchema.parse({})).not.toThrow();
  });
});

describe('plannerEventAttendeeSchema', () => {
  it('parses a minimal attendee (email only)', () => {
    const parsed = plannerEventAttendeeSchema.parse({ email: 'a@example.com' });
    expect(parsed.email).toBe('a@example.com');
  });

  it('parses every RSVP enum value', () => {
    const values = ['needsAction', 'declined', 'tentative', 'accepted'] as const;
    for (const responseStatus of values) {
      expect(
        plannerEventAttendeeSchema.parse({ email: 'x@y', responseStatus }),
      ).toMatchObject({ responseStatus });
    }
  });

  it('rejects an unknown RSVP value', () => {
    expect(() =>
      plannerEventAttendeeSchema.parse({ email: 'x@y', responseStatus: 'maybe' }),
    ).toThrow();
  });
});

describe('plannerEventSchema', () => {
  const minimal = {
    id: 'evt-1',
    start: { dateTime: '2026-06-01T10:00:00Z' },
    end: { dateTime: '2026-06-01T11:00:00Z' },
    htmlLink: 'https://calendar.google.com/event?eid=evt-1',
  };

  it('parses the minimum required shape (id + start + end + htmlLink)', () => {
    const parsed = plannerEventSchema.parse(minimal);
    expect(parsed.id).toBe('evt-1');
    expect(parsed.htmlLink).toContain('calendar.google.com');
  });

  it('rejects when htmlLink is missing (required for "Google\'da aç")', () => {
    const { htmlLink: _omit, ...without } = minimal;
    void _omit;
    expect(() => plannerEventSchema.parse(without)).toThrow();
  });

  it('accepts null summary/description/location (Google often returns these)', () => {
    const parsed = plannerEventSchema.parse({
      ...minimal,
      summary: null,
      description: null,
      location: null,
    });
    expect(parsed.summary).toBeNull();
  });

  it('parses status enum values', () => {
    for (const status of ['confirmed', 'tentative', 'cancelled'] as const) {
      const parsed = plannerEventSchema.parse({ ...minimal, status });
      expect(parsed.status).toBe(status);
    }
  });
});

describe('plannerEventListInputSchema', () => {
  it('parses a valid ISO + IANA TZ triple', () => {
    const parsed = plannerEventListInputSchema.parse({
      start: '2026-06-01T00:00:00.000Z',
      end: '2026-06-01T23:59:59.999Z',
      timeZone: 'Europe/Istanbul',
    });
    expect(parsed.timeZone).toBe('Europe/Istanbul');
  });

  it('rejects when fields are missing', () => {
    expect(() =>
      plannerEventListInputSchema.parse({ start: '2026-06-01', end: '2026-06-02' }),
    ).toThrow();
  });
});

describe('plannerEventGetInputSchema', () => {
  it('parses a valid eventId', () => {
    expect(plannerEventGetInputSchema.parse({ eventId: 'evt-1' }).eventId).toBe(
      'evt-1',
    );
  });

  it('rejects an empty eventId (.min(1))', () => {
    expect(() => plannerEventGetInputSchema.parse({ eventId: '' })).toThrow();
  });
});
