/**
 * Faz 13J (DEM-266) — scheduled report email render + send testleri.
 *
 * Mock-heavy unit test: Drizzle DB sorgu chain'ini fake'le, Resend mailer
 * inject. Per-recipient render + send, fail isolation, signed URL inject.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  renderScheduledReportEmail,
  resolveScheduleRecipients,
  sendScheduledReportEmail,
  type SendScheduledEmailDeps,
} from './report-scheduled-email';

// ─── renderScheduledReportEmail ────────────────────────────────────────────

describe('renderScheduledReportEmail', () => {
  const baseInput = {
    recipientName: 'Asya',
    reportTitle: 'Sprint 23 Sağlık',
    workspaceName: 'Ürün Ekibi',
    workspaceId: 'ws-1',
    scopeKind: 'board' as const,
    completedAt: new Date('2026-05-24T12:00:00Z'),
    signedUrl: 'https://minio.test/pusula-reports/workspace/ws-1/r-1.pdf?sig=abc',
    expiresAt: new Date('2026-05-25T12:00:00Z'),
    appUrl: 'https://pusulaportal.com',
  };

  it('subject "[Pusula] Raporunuz hazır: {title}" formatı', () => {
    const rendered = renderScheduledReportEmail(baseInput);
    expect(rendered.subject).toBe('[Pusula] Raporunuz hazır: Sprint 23 Sağlık');
  });

  it('HTML alıcı adıyla salutation içerir', () => {
    const rendered = renderScheduledReportEmail(baseInput);
    expect(rendered.html).toContain('Merhaba Asya,');
  });

  it('recipientName null → generic salutation', () => {
    const rendered = renderScheduledReportEmail({
      ...baseInput,
      recipientName: null,
    });
    expect(rendered.html).toContain('Merhaba,');
    expect(rendered.html).not.toContain('Merhaba null');
  });

  it('signedUrl button href ve text ikisinde de yer alır', () => {
    const rendered = renderScheduledReportEmail(baseInput);
    expect(rendered.html).toContain(baseInput.signedUrl);
    expect(rendered.text).toContain(baseInput.signedUrl);
  });

  it('scope kind TR etiketi (board → "Pano")', () => {
    const rendered = renderScheduledReportEmail(baseInput);
    expect(rendered.html).toContain('Pano');
  });

  it('manage link workspace tabsına yönlendirir', () => {
    const rendered = renderScheduledReportEmail(baseInput);
    expect(rendered.html).toContain(
      'https://pusulaportal.com/workspaces/ws-1/reports?tab=scheduled',
    );
  });

  it('HTML escape: <script> injection yok', () => {
    const rendered = renderScheduledReportEmail({
      ...baseInput,
      recipientName: '<script>alert(1)</script>',
      reportTitle: '<img src=x onerror=alert(1)>',
    });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain('&lt;img');
  });

  it('text plain ASCII versiyonu sub-strings içerir', () => {
    const rendered = renderScheduledReportEmail(baseInput);
    expect(rendered.text).toContain('Sprint 23 Sağlık');
    expect(rendered.text).toContain('Pano');
    expect(rendered.text).toContain('Merhaba Asya');
  });
});

// ─── resolveScheduleRecipients ─────────────────────────────────────────────

describe('resolveScheduleRecipients', () => {
  function fakeDb(userRows: Array<{ id: string; email: string; name: string }>) {
    return {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(userRows),
        }),
      }),
    } as unknown as Parameters<typeof resolveScheduleRecipients>[0];
  }

  it('userIds + externalEmails birleştirir', async () => {
    const db = fakeDb([
      { id: 'u-1', email: 'a@ws.test', name: 'Asya' },
      { id: 'u-2', email: 'b@ws.test', name: 'Burak' },
    ]);
    const result = await resolveScheduleRecipients(db, {
      recipientUserIds: ['u-1', 'u-2'],
      recipientEmails: ['ext@partner.com'],
    });
    expect(result).toEqual([
      { email: 'a@ws.test', name: 'Asya', userId: 'u-1' },
      { email: 'b@ws.test', name: 'Burak', userId: 'u-2' },
      { email: 'ext@partner.com' },
    ]);
  });

  it('user email + external email aynıysa duplicate gönderim engellenir', async () => {
    const db = fakeDb([{ id: 'u-1', email: 'a@ws.test', name: 'Asya' }]);
    const result = await resolveScheduleRecipients(db, {
      recipientUserIds: ['u-1'],
      recipientEmails: ['A@WS.TEST'], // case-insensitive
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ email: 'a@ws.test', userId: 'u-1' });
  });

  it('boş userIds + boş externalEmails → boş liste', async () => {
    const db = fakeDb([]);
    const result = await resolveScheduleRecipients(db, {
      recipientUserIds: [],
      recipientEmails: [],
    });
    expect(result).toEqual([]);
  });
});

// ─── sendScheduledReportEmail ──────────────────────────────────────────────

interface FakeMailerCall {
  to: string;
  subject: string;
}

function createFakeMailer(opts: { failOn?: string[] } = {}) {
  const calls: FakeMailerCall[] = [];
  const failOn = new Set(opts.failOn ?? []);
  return {
    calls,
    send: vi.fn(async (msg: { from: string; to: string; subject: string; html: string; text: string }) => {
      if (failOn.has(msg.to)) {
        throw new Error(`mock: refused ${msg.to}`);
      }
      calls.push({ to: msg.to, subject: msg.subject });
      return { messageId: `mock-${msg.to}` };
    }),
  };
}

interface FakeRenderRow {
  render: {
    id: string;
    workspaceId: string;
    scheduleId: string | null;
    scopeKind: 'card' | 'list' | 'board' | 'workspace';
    completedAt: Date | null;
  };
  saved: { id: string; title: string };
  schedule: { id: string; recipientUserIds: string[]; recipientEmails: string[] };
  workspace: { id: string; name: string };
}

interface FakeAsset {
  s3Bucket: string;
  s3Key: string;
  format: 'pdf';
}

/**
 * Faz 13S (DEM-275) — insert call collector. Outbox `values([...])` çağrıları
 * burada toplanır; testler insert'in kaç kez çağrıldığını ve hangi satırları
 * yazdığını doğrular. `fakeDbForSend` döner.
 */
interface InsertCall {
  values: unknown;
}

function fakeDbForSend(args: {
  joinRow: FakeRenderRow | null;
  asset: FakeAsset | null;
  userRows: Array<{ id: string; email: string; name: string }>;
  /** Faz 13S — insert hook'unu fırlat (best-effort kontrolü). */
  insertThrows?: boolean;
}) {
  let selectCallNo = 0;
  const insertCalls: InsertCall[] = [];
  const db = {
    select: () => {
      selectCallNo += 1;
      const currentCall = selectCallNo;
      // 1. select: joinRow query (4 inner joins + where + limit 1)
      // 2. select: asset query (from + where + limit 1)
      // 3. select: user rows (from + where, no limit — resolveScheduleRecipients)
      const resolveValue = () => {
        if (currentCall === 1) return args.joinRow ? [args.joinRow] : [];
        if (currentCall === 2) return args.asset ? [args.asset] : [];
        return args.userRows;
      };
      // where() hem thenable (await ile resolve) hem .limit() chainable
      // — Drizzle builder davranışı taklit.
      const whereResult = () => {
        const result = resolveValue();
        return Object.assign(Promise.resolve(result), {
          limit: () => Promise.resolve(result),
        });
      };
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => whereResult(),
      };
      return chain;
    },
    // Faz 13S — outbox insert path. `db.insert(notificationOutbox).values([...])`
    // pattern'i. Test'te collector + opt-out throw.
    insert: () => ({
      values: async (rows: unknown) => {
        if (args.insertThrows) {
          throw new Error('mock: insert refused');
        }
        insertCalls.push({ values: rows });
      },
    }),
  } as unknown as SendScheduledEmailDeps['db'];
  return Object.assign(db, { __insertCalls: insertCalls });
}

const BASE_JOIN_ROW: FakeRenderRow = {
  render: {
    id: 'r-1',
    workspaceId: 'ws-1',
    scheduleId: 'sch-1',
    scopeKind: 'board',
    completedAt: new Date('2026-05-24T12:00:00Z'),
  },
  saved: { id: 's-1', title: 'Sprint Sağlık' },
  schedule: {
    id: 'sch-1',
    recipientUserIds: ['u-1', 'u-2'],
    recipientEmails: ['ext@partner.com'],
  },
  workspace: { id: 'ws-1', name: 'Ürün Ekibi' },
};

const BASE_ASSET: FakeAsset = {
  s3Bucket: 'pusula-reports',
  s3Key: 'workspace/ws-1/r-1.pdf',
  format: 'pdf',
};

describe('sendScheduledReportEmail', () => {
  it('joinRow yok → skipped: missing-render', async () => {
    const mailer = createFakeMailer();
    const result = await sendScheduledReportEmail(
      {
        db: fakeDbForSend({ joinRow: null, asset: null, userRows: [] }),
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test',
      },
      { renderId: 'r-missing' },
    );
    expect(result.kind).toBe('skipped');
    expect(result.reason).toBe('missing-render');
    expect(mailer.calls).toHaveLength(0);
  });

  it('asset yok → skipped: missing-asset', async () => {
    const mailer = createFakeMailer();
    const result = await sendScheduledReportEmail(
      {
        db: fakeDbForSend({ joinRow: BASE_JOIN_ROW, asset: null, userRows: [] }),
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test',
      },
      { renderId: 'r-1' },
    );
    expect(result.kind).toBe('skipped');
    expect(result.reason).toBe('missing-asset');
  });

  it('happy path: 2 user + 1 external → 3 email gönderilir', async () => {
    const mailer = createFakeMailer();
    const result = await sendScheduledReportEmail(
      {
        db: fakeDbForSend({
          joinRow: BASE_JOIN_ROW,
          asset: BASE_ASSET,
          userRows: [
            { id: 'u-1', email: 'asya@ws.test', name: 'Asya' },
            { id: 'u-2', email: 'burak@ws.test', name: 'Burak' },
          ],
        }),
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test/r-1.pdf?sig=xyz',
      },
      { renderId: 'r-1' },
    );
    expect(result.kind).toBe('sent');
    expect(result.recipientsSent).toBe(3);
    expect(result.recipientsFailed).toBe(0);
    expect(mailer.calls.map((c) => c.to).sort()).toEqual([
      'asya@ws.test',
      'burak@ws.test',
      'ext@partner.com',
    ]);
  });

  it('bir alıcı fail → diğerleri devam (fail isolation)', async () => {
    const mailer = createFakeMailer({ failOn: ['ext@partner.com'] });
    const result = await sendScheduledReportEmail(
      {
        db: fakeDbForSend({
          joinRow: BASE_JOIN_ROW,
          asset: BASE_ASSET,
          userRows: [
            { id: 'u-1', email: 'asya@ws.test', name: 'Asya' },
            { id: 'u-2', email: 'burak@ws.test', name: 'Burak' },
          ],
        }),
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test',
      },
      { renderId: 'r-1' },
    );
    expect(result.kind).toBe('sent');
    expect(result.recipientsSent).toBe(2);
    expect(result.recipientsFailed).toBe(1);
  });

  it('subject doğru format (rapor adı)', async () => {
    const mailer = createFakeMailer();
    await sendScheduledReportEmail(
      {
        db: fakeDbForSend({
          joinRow: BASE_JOIN_ROW,
          asset: BASE_ASSET,
          userRows: [{ id: 'u-1', email: 'a@test.com', name: 'A' }],
        }),
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test',
      },
      { renderId: 'r-1' },
    );
    expect(mailer.calls[0]!.subject).toBe('[Pusula] Raporunuz hazır: Sprint Sağlık');
  });

  it('signedUrl 6sa TTL ile çağrılır (security H2 fix)', async () => {
    const mailer = createFakeMailer();
    const createSignedUrl = vi.fn(async () => 'https://signed.test');
    await sendScheduledReportEmail(
      {
        db: fakeDbForSend({
          joinRow: BASE_JOIN_ROW,
          asset: BASE_ASSET,
          userRows: [{ id: 'u-1', email: 'a@test.com', name: 'A' }],
        }),
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl,
      },
      { renderId: 'r-1' },
    );
    expect(createSignedUrl).toHaveBeenCalledWith({
      bucket: 'pusula-reports',
      key: 'workspace/ws-1/r-1.pdf',
      expiresInSeconds: 6 * 60 * 60,
    });
  });

  it('email subject CRLF sanitize (security H1): newline kaldırılır', () => {
    const rendered = renderScheduledReportEmail({
      ...({
        recipientName: 'Asya',
        reportTitle: 'Q1\r\nBcc: victim@evil.com\r\nFake-Header',
        workspaceName: 'Ürün',
        workspaceId: 'ws-1',
        scopeKind: 'board' as const,
        completedAt: new Date(),
        signedUrl: 'https://signed.test',
        expiresAt: new Date(),
        appUrl: 'https://test.com',
      }),
    });
    expect(rendered.subject).not.toContain('\r');
    expect(rendered.subject).not.toContain('\n');
    expect(rendered.subject).toContain('Bcc: victim@evil.com'); // text içerikten korunur ama header injection yok
  });

  it('recipientUserIds + recipientEmails ikisi de boşsa skipped: no-recipients', async () => {
    const mailer = createFakeMailer();
    const result = await sendScheduledReportEmail(
      {
        db: fakeDbForSend({
          joinRow: {
            ...BASE_JOIN_ROW,
            schedule: { id: 'sch-1', recipientUserIds: [], recipientEmails: [] },
          },
          asset: BASE_ASSET,
          userRows: [],
        }),
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test',
      },
      { renderId: 'r-1' },
    );
    expect(result.kind).toBe('skipped');
    expect(result.reason).toBe('no-recipients');
  });

  // ─── Faz 13S (DEM-275) — outbox insert + publish enqueue ───────────────

  it('happy path sonrası userId taşıyan alıcı başına in_app + push outbox satırı yazılır (Faz 13S)', async () => {
    const mailer = createFakeMailer();
    const db = fakeDbForSend({
      joinRow: BASE_JOIN_ROW,
      asset: BASE_ASSET,
      userRows: [
        { id: 'u-1', email: 'asya@ws.test', name: 'Asya' },
        { id: 'u-2', email: 'burak@ws.test', name: 'Burak' },
      ],
    });
    const enqueueCalls: Array<{ eventId: string }> = [];
    const result = await sendScheduledReportEmail(
      {
        db,
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test/r-1.pdf?sig=xyz',
        enqueueNotificationPublish: async ({ eventId }) => {
          enqueueCalls.push({ eventId });
        },
      },
      { renderId: 'r-1' },
    );
    expect(result.kind).toBe('sent');
    // Email: 3 alıcı (2 user + 1 external)
    expect(result.recipientsSent).toBe(3);

    // Outbox: 2 user × 2 kanal = 4 satır (external email-only → skip)
    const inserts = (db as unknown as { __insertCalls: Array<{ values: unknown }> })
      .__insertCalls;
    expect(inserts).toHaveLength(1);
    const rows = inserts[0]!.values as Array<{
      channel: string;
      recipientId: string;
      type: string;
      payload: Record<string, unknown>;
    }>;
    expect(rows).toHaveLength(4);
    const channels = rows.map((r) => `${r.channel}:${r.recipientId}`).sort();
    expect(channels).toEqual([
      'in_app:u-1',
      'in_app:u-2',
      'push:u-1',
      'push:u-2',
    ]);

    // Her satırda type 'report_scheduled_ready' + payload tam.
    rows.forEach((row) => {
      expect(row.type).toBe('report_scheduled_ready');
      expect(row.payload).toMatchObject({
        savedReportId: 's-1',
        renderId: 'r-1',
        workspaceId: 'ws-1',
        scheduleId: 'sch-1',
        reportTitle: 'Sprint Sağlık',
        workspaceName: 'Ürün Ekibi',
        scopeKind: 'board',
      });
      expect(typeof row.payload.completedAt).toBe('string');
    });

    // Publish enqueue: tek tetik, SCHEDULER_TICK_EVENT_ID sentinel'i.
    expect(enqueueCalls).toEqual([{ eventId: 'scheduler:tick' }]);
  });

  it('hiç userId yoksa (sadece external email) outbox insert atlanır', async () => {
    const mailer = createFakeMailer();
    const db = fakeDbForSend({
      joinRow: {
        ...BASE_JOIN_ROW,
        schedule: {
          id: 'sch-1',
          recipientUserIds: [],
          recipientEmails: ['ext@partner.com'],
        },
      },
      asset: BASE_ASSET,
      userRows: [],
    });
    const enqueueCalls: Array<{ eventId: string }> = [];
    const result = await sendScheduledReportEmail(
      {
        db,
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test',
        enqueueNotificationPublish: async ({ eventId }) => {
          enqueueCalls.push({ eventId });
        },
      },
      { renderId: 'r-1' },
    );
    expect(result.kind).toBe('sent');
    expect(result.recipientsSent).toBe(1);

    const inserts = (db as unknown as { __insertCalls: Array<{ values: unknown }> })
      .__insertCalls;
    expect(inserts).toHaveLength(0);
    expect(enqueueCalls).toEqual([]);
  });

  it('outbox insert hata fırlatsa email outcome bozulmaz (best-effort)', async () => {
    const mailer = createFakeMailer();
    const db = fakeDbForSend({
      joinRow: BASE_JOIN_ROW,
      asset: BASE_ASSET,
      userRows: [{ id: 'u-1', email: 'asya@ws.test', name: 'Asya' }],
      insertThrows: true,
    });
    const result = await sendScheduledReportEmail(
      {
        db,
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test',
      },
      { renderId: 'r-1' },
    );
    // Email teslim outcome'u korunur — outbox sweeper 90sn sonra alır.
    expect(result.kind).toBe('sent');
    expect(result.recipientsFailed).toBe(0);
  });

  it('enqueueNotificationPublish yoksa outbox insert yine yapılır (sweeper alır)', async () => {
    const mailer = createFakeMailer();
    const db = fakeDbForSend({
      joinRow: BASE_JOIN_ROW,
      asset: BASE_ASSET,
      userRows: [{ id: 'u-1', email: 'asya@ws.test', name: 'Asya' }],
    });
    const result = await sendScheduledReportEmail(
      {
        db,
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test',
        // enqueueNotificationPublish undefined
      },
      { renderId: 'r-1' },
    );
    expect(result.kind).toBe('sent');
    const inserts = (db as unknown as { __insertCalls: Array<{ values: unknown }> })
      .__insertCalls;
    expect(inserts).toHaveLength(1);
  });

  it('enqueueNotificationPublish hata fırlatırsa outbox insert korunur (publish sweeper alır)', async () => {
    const mailer = createFakeMailer();
    const db = fakeDbForSend({
      joinRow: BASE_JOIN_ROW,
      asset: BASE_ASSET,
      userRows: [{ id: 'u-1', email: 'asya@ws.test', name: 'Asya' }],
    });
    const result = await sendScheduledReportEmail(
      {
        db,
        mailer,
        config: { from: 'no-reply@pusula.test', appUrl: 'https://test.com' },
        createSignedUrl: async () => 'https://signed.test',
        enqueueNotificationPublish: async () => {
          throw new Error('redis-down');
        },
      },
      { renderId: 'r-1' },
    );
    expect(result.kind).toBe('sent');
    const inserts = (db as unknown as { __insertCalls: Array<{ values: unknown }> })
      .__insertCalls;
    expect(inserts).toHaveLength(1);
  });
});
