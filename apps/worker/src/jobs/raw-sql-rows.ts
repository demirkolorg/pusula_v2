type RawSqlRows<T> = {
  rows: T[];
};

export function extractRawSqlRows<T>(result: unknown): T[] {
  const rows = (result as Partial<RawSqlRows<T>> | null | undefined)?.rows;
  return Array.isArray(rows) ? rows : [];
}
