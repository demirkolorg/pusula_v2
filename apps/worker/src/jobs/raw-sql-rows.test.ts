import { describe, expect, it } from 'vitest';
import { extractRawSqlRows } from './raw-sql-rows';

type EventIdRow = {
  event_id: string | null;
};

describe('extractRawSqlRows', () => {
  it('returns typed rows from a node-postgres execute result', () => {
    const rows: EventIdRow[] = [{ event_id: 'evt_1' }, { event_id: null }];

    expect(extractRawSqlRows<EventIdRow>({ rows })).toBe(rows);
  });

  it('treats malformed execute results as empty', () => {
    expect(extractRawSqlRows<EventIdRow>(undefined)).toEqual([]);
    expect(extractRawSqlRows<EventIdRow>({ rows: 'not-an-array' })).toEqual([]);
  });
});
