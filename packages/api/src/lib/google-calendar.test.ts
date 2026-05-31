import { describe, expect, it, vi, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  getEvent,
  listEventsFromAllCalendars,
  listPrimaryEvents,
  listVisibleCalendars,
  mapGoogleEventToPlannerEvent,
  type GoogleCalendarDeps,
} from './google-calendar';

/**
 * Faz 16C (DEM-312) — `google-calendar.ts` fetch wrapper unit testleri.
 *
 * Wrapper saf — Better Auth'a doğrudan dokunmaz; `GoogleCalendarDeps`
 * arayüzünü mock'layıp token akışı + HTTP yanıt mapping'i izole test edilir.
 */

const RAW_TIMED_EVENT = {
  id: 'evt-1',
  summary: 'Toplantı',
  description: 'Sprint planlama',
  location: 'Online',
  start: { dateTime: '2026-06-01T10:30:00+03:00', timeZone: 'Europe/Istanbul' },
  end: { dateTime: '2026-06-01T11:30:00+03:00', timeZone: 'Europe/Istanbul' },
  status: 'confirmed',
  htmlLink: 'https://calendar.google.com/event?eid=evt-1',
  attendees: [
    { email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted' },
    { email: 'bob@example.com', displayName: 'Bob', responseStatus: 'tentative' },
  ],
};

const RAW_ALL_DAY_EVENT = {
  id: 'evt-2',
  summary: 'Resmi tatil',
  start: { date: '2026-06-01' },
  end: { date: '2026-06-02' },
  status: 'confirmed',
  htmlLink: 'https://calendar.google.com/event?eid=evt-2',
};

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function depsWithToken(token: string | null = 'fake-access'): GoogleCalendarDeps {
  return {
    getAccessToken: vi.fn().mockResolvedValue(token),
  };
}

function depsThatThrowOnToken(): GoogleCalendarDeps {
  return {
    getAccessToken: vi.fn().mockRejectedValue(new Error('boom')),
  };
}

function mockFetchResponse(status: number, body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as typeof fetch;
}

describe('mapGoogleEventToPlannerEvent', () => {
  it('parses a timed event with attendees', () => {
    const event = mapGoogleEventToPlannerEvent(RAW_TIMED_EVENT);
    expect(event.id).toBe('evt-1');
    expect(event.summary).toBe('Toplantı');
    expect(event.start.dateTime).toBe('2026-06-01T10:30:00+03:00');
    expect(event.attendees).toHaveLength(2);
    expect(event.attendees?.[0]?.responseStatus).toBe('accepted');
  });

  it('parses an all-day event without time fields', () => {
    const event = mapGoogleEventToPlannerEvent(RAW_ALL_DAY_EVENT);
    expect(event.start.date).toBe('2026-06-01');
    expect(event.start.dateTime).toBeUndefined();
    expect(event.attendees).toBeUndefined();
  });

  it('rejects events without htmlLink (Zod required)', () => {
    expect(() => mapGoogleEventToPlannerEvent({ id: 'x', start: {}, end: {} })).toThrow();
  });
});

describe('listPrimaryEvents', () => {
  const input = {
    start: '2026-06-01T00:00:00.000Z',
    end: '2026-06-01T23:59:59.999Z',
    timeZone: 'Europe/Istanbul',
  };

  it('returns mapped events on a 200 OK payload', async () => {
    mockFetchResponse(200, { items: [RAW_TIMED_EVENT, RAW_ALL_DAY_EVENT] });
    const events = await listPrimaryEvents('user-1', input, depsWithToken());
    expect(events).toHaveLength(2);
    expect(events[0]?.id).toBe('evt-1');
  });

  it('drops Zod-invalid items silently (one bad event does not break the day)', async () => {
    mockFetchResponse(200, {
      items: [RAW_TIMED_EVENT, { id: 'bad', start: {}, end: {} }],
    });
    const events = await listPrimaryEvents('user-1', input, depsWithToken());
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('evt-1');
  });

  it('returns [] when items is missing or empty', async () => {
    mockFetchResponse(200, {});
    const events = await listPrimaryEvents('user-1', input, depsWithToken());
    expect(events).toEqual([]);
  });

  it('throws UNAUTHORIZED GOOGLE_NOT_CONNECTED when token is null', async () => {
    await expect(
      listPrimaryEvents('user-1', input, depsWithToken(null)),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'GOOGLE_NOT_CONNECTED',
    });
  });

  it('throws UNAUTHORIZED GOOGLE_RECONNECT_REQUIRED on a 401 response', async () => {
    mockFetchResponse(401, { error: { message: 'Invalid Credentials' } });
    await expect(
      listPrimaryEvents('user-1', input, depsWithToken()),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'GOOGLE_RECONNECT_REQUIRED',
    });
  });

  it('throws UNAUTHORIZED GOOGLE_RECONNECT_REQUIRED on a 403 response', async () => {
    mockFetchResponse(403, { error: { message: 'Forbidden' } });
    await expect(
      listPrimaryEvents('user-1', input, depsWithToken()),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'GOOGLE_RECONNECT_REQUIRED',
    });
  });

  it('throws UNAUTHORIZED GOOGLE_RECONNECT_REQUIRED when getAccessToken itself throws', async () => {
    await expect(
      listPrimaryEvents('user-1', input, depsThatThrowOnToken()),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'GOOGLE_RECONNECT_REQUIRED',
    });
  });

  it('throws INTERNAL_SERVER_ERROR on a 5xx response', async () => {
    mockFetchResponse(503, { error: { message: 'Service unavailable' } });
    const err = await listPrimaryEvents(
      'user-1',
      input,
      depsWithToken(),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe('INTERNAL_SERVER_ERROR');
    expect(err.message).toBe('GOOGLE_API_503');
  });
});

describe('getEvent', () => {
  it('returns a mapped event on 200 OK', async () => {
    mockFetchResponse(200, RAW_TIMED_EVENT);
    const event = await getEvent('user-1', 'evt-1', depsWithToken());
    expect(event.id).toBe('evt-1');
  });

  it('throws NOT_FOUND on 404', async () => {
    mockFetchResponse(404, { error: { message: 'Not Found' } });
    await expect(
      getEvent('user-1', 'missing', depsWithToken()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'EVENT_NOT_FOUND' });
  });
});

/**
 * Faz 16 hızlı revize (2026-06-01) — çok takvim akışı (`listVisibleCalendars` +
 * `listEventsFromAllCalendars`). Tek mock olarak `globalThis.fetch`'i kullandığımız
 * için iki çağrıyı (`/calendarList` + `/events`) URL'e bakarak ayırıyoruz.
 */
function mockFetchByUrl(handlers: Record<string, { status: number; body: unknown }>): void {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String(input);
    for (const [needle, response] of Object.entries(handlers)) {
      if (url.includes(needle)) {
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
}

describe('listVisibleCalendars', () => {
  it('parses calendarList rows into PlannerCalendar shape', async () => {
    mockFetchResponse(200, {
      items: [
        {
          id: 'primary',
          summary: 'Abdullah',
          backgroundColor: '#7986cb',
          primary: true,
          selected: true,
        },
        {
          id: 'family@group.calendar.google.com',
          summary: 'Aile',
          backgroundColor: '#f6bf26',
          selected: true,
        },
      ],
    });
    const calendars = await listVisibleCalendars('user-1', depsWithToken());
    expect(calendars).toHaveLength(2);
    expect(calendars[0]?.summary).toBe('Abdullah');
    expect(calendars[1]?.backgroundColor).toBe('#f6bf26');
  });

  it('drops Zod-invalid calendarList rows silently', async () => {
    mockFetchResponse(200, {
      items: [
        { id: 'primary', summary: 'Abdullah' },
        { /* no id */ summary: 'Broken' },
      ],
    });
    const calendars = await listVisibleCalendars('user-1', depsWithToken());
    expect(calendars).toHaveLength(1);
    expect(calendars[0]?.id).toBe('primary');
  });
});

describe('listEventsFromAllCalendars', () => {
  const input = {
    start: '2026-06-01T00:00:00.000Z',
    end: '2026-06-01T23:59:59.999Z',
    timeZone: 'Europe/Istanbul',
  };

  it('merges events from every visible calendar and tags them with calendar meta', async () => {
    const calendarsBody = {
      items: [
        {
          id: 'primary',
          summary: 'Abdullah',
          backgroundColor: '#7986cb',
          primary: true,
        },
        {
          id: 'family@group.calendar.google.com',
          summary: 'Aile',
          backgroundColor: '#f6bf26',
        },
      ],
    };
    const primaryEvents = {
      items: [
        {
          id: 'evt-primary',
          summary: 'Abdullah toplantı',
          start: { dateTime: '2026-06-01T10:00:00+03:00' },
          end: { dateTime: '2026-06-01T11:00:00+03:00' },
          htmlLink: 'https://calendar.google.com/event?eid=evt-primary',
        },
      ],
    };
    const familyEvents = {
      items: [
        {
          id: 'evt-family',
          summary: 'Aile yemeği',
          start: { dateTime: '2026-06-01T19:00:00+03:00' },
          end: { dateTime: '2026-06-01T20:00:00+03:00' },
          htmlLink: 'https://calendar.google.com/event?eid=evt-family',
        },
      ],
    };

    mockFetchByUrl({
      '/users/me/calendarList': { status: 200, body: calendarsBody },
      '/calendars/primary/events': { status: 200, body: primaryEvents },
      'family%40group.calendar.google.com/events': {
        status: 200,
        body: familyEvents,
      },
    });

    const events = await listEventsFromAllCalendars('user-1', input, depsWithToken());
    expect(events).toHaveLength(2);

    const primary = events.find((e) => e.id === 'evt-primary');
    expect(primary?.calendarId).toBe('primary');
    expect(primary?.calendarSummary).toBe('Abdullah');
    expect(primary?.calendarColor).toBe('#7986cb');

    const family = events.find((e) => e.id === 'evt-family');
    expect(family?.calendarSummary).toBe('Aile');
    expect(family?.calendarColor).toBe('#f6bf26');
  });

  it('returns sorted by start time (primary at 10:00 before family at 19:00)', async () => {
    mockFetchByUrl({
      '/users/me/calendarList': {
        status: 200,
        body: { items: [{ id: 'primary' }, { id: 'family@group.calendar.google.com' }] },
      },
      '/calendars/primary/events': {
        status: 200,
        body: {
          items: [
            {
              id: 'evt-late',
              summary: 'Geç',
              start: { dateTime: '2026-06-01T18:00:00+03:00' },
              end: { dateTime: '2026-06-01T19:00:00+03:00' },
              htmlLink: 'https://calendar.google.com/late',
            },
          ],
        },
      },
      'family%40group.calendar.google.com/events': {
        status: 200,
        body: {
          items: [
            {
              id: 'evt-early',
              summary: 'Erken',
              start: { dateTime: '2026-06-01T08:00:00+03:00' },
              end: { dateTime: '2026-06-01T09:00:00+03:00' },
              htmlLink: 'https://calendar.google.com/early',
            },
          ],
        },
      },
    });

    const events = await listEventsFromAllCalendars('user-1', input, depsWithToken());
    expect(events.map((e) => e.id)).toEqual(['evt-early', 'evt-late']);
  });

  it('skips a single calendar that returns 5xx but keeps the rest', async () => {
    let requestIndex = 0;
    globalThis.fetch = vi.fn(async (req: unknown) => {
      const url = typeof req === 'string' ? req : String(req);
      if (url.includes('/users/me/calendarList')) {
        return new Response(
          JSON.stringify({
            items: [{ id: 'primary' }, { id: 'broken@group.calendar.google.com' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      requestIndex += 1;
      if (url.includes('broken')) {
        return new Response('{}', { status: 503 });
      }
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'evt-primary',
              summary: 'OK',
              start: { dateTime: '2026-06-01T10:00:00+03:00' },
              end: { dateTime: '2026-06-01T11:00:00+03:00' },
              htmlLink: 'https://calendar.google.com/ok',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const events = await listEventsFromAllCalendars('user-1', input, depsWithToken());
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('evt-primary');
    expect(requestIndex).toBeGreaterThan(0);
  });

  it('re-throws GOOGLE_RECONNECT_REQUIRED if any per-calendar fetch hits 401', async () => {
    globalThis.fetch = vi.fn(async (req: unknown) => {
      const url = typeof req === 'string' ? req : String(req);
      if (url.includes('/users/me/calendarList')) {
        return new Response(
          JSON.stringify({ items: [{ id: 'primary' }, { id: 'family' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/calendars/primary/events')) {
        return new Response(
          JSON.stringify({ items: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 401 });
    }) as typeof fetch;

    const err = await listEventsFromAllCalendars('user-1', input, depsWithToken()).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('GOOGLE_RECONNECT_REQUIRED');
  });
});
