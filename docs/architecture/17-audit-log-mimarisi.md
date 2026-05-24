---
title: '17 — Audit Log Mimarisi'
description: 'Kritik mutationların kalıcı/immutable izi: audit_log tablosu, action enum, helper, tRPC procedure, permission ve retention.'
aliases:
  - 'Audit Log Mimarisi'
  - 'Audit Trail Architecture'
  - 'Forensic Log'
tags:
  - 'pusula'
  - 'architecture/audit-log'
  - 'security'
  - 'compliance'
type: 'architecture'
axis: 'architecture'
status: 'draft'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
related:
  - '[[docs/architecture/03-backend|03 — Backend]]'
  - '[[docs/architecture/04-veri-katmani|04 — Veri Katmanı]]'
  - '[[docs/domain/02-yetkilendirme-kurallari|02 — Yetkilendirme Kuralları]]'
  - '[[docs/architecture/06-bildirim-altyapisi|06 — Bildirim Altyapısı]]'
updated: 2026-05-24
---

# 17 — Audit Log Mimarisi

> Eksen: **tasarım / teknik** — kritik mutationların kalıcı ve değiştirilemez izini tutan `audit_log` tablosu, helper, tRPC procedure ve permission modeli. İş kuralları (kim ne görür, hangi mutation kritik kabul edilir) → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md).

Faz 8 (Sertleştirme) kapsamı — DEM-277 (8.0) önce-belgesinde alınan kararların teknik somutlaması. İlgili implementasyon issue: [DEM-282](https://linear.app/demirkol/issue/DEM-282) (8E). Karar kaydı: [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) "Karar kaydı" 2026-05-24 satırı.

## 1. Niçin ayrı?

`activity_events` (Faz 6 ile geldi) **aktivite akışı** içindir: kullanıcıya görünür, geniş kapsamlı (her kart hareketi, yorum, atama), board scope'unda; silinebilir bağlamlarda silinir (kart silinince activity de silinir).

`audit_log` **forensic / compliance** içindir:

| Boyut | `activity_events` | `audit_log` |
|---|---|---|
| Kapsam | Tüm collaborative mutation | Yalnız kritik (delete + role/permission change + share) |
| Görünürlük | Kart detayında herkese | Yalnız workspace owner |
| Mutability | Cascade silme olabilir | **Append-only** (UPDATE/DELETE trigger reddi) |
| Retention | Karta bağlı (kart silinince gider) | **Süresiz** |
| Kayıt seviyesi | Türkçe insan-okur özet | Aktör + IP + UA + before/after delta |
| Amaç | UX (kim ne yaptı?) | Compliance (gerekirse yetkili tarafa kanıt) |

İki tablo birbirini **tamamlar**, **dublike etmez**: aynı mutation hem activity hem audit yazabilir (kritikse), ama audit'in tetikleyici listesi sıkı şekilde sınırlıdır.

## 2. Şema (`packages/db`)

### 2.1 Migration

Yeni migration: `packages/db/src/migrations/0028_dem282_faz8E_audit_log.sql` (numara sıradaki müsait — 0027 Faz 11 sonrası).

```sql
CREATE TABLE audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    uuid NOT NULL,
  before       jsonb,
  after        jsonb,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_workspace_idx
  ON audit_log (workspace_id, created_at DESC);

CREATE INDEX audit_log_target_idx
  ON audit_log (target_type, target_id);

-- Immutable: UPDATE ve DELETE reddedilir (workspaces DELETE'i hariç — ON DELETE RESTRICT)
CREATE OR REPLACE FUNCTION audit_log_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % operation rejected', TG_OP;
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();
```

`workspace_id` üzerinde `ON DELETE RESTRICT` — workspace silinemez (audit kayıtları varsa). Workspace silme zaten `workspace.delete` audit kaydı üretir; ardışık silme isteği önce audit log'u export etmeyi gerektirir (manuel — UI bu issue dışı).

`actor_id` `ON DELETE SET NULL` — kullanıcı silinince audit kaydı kalır (`actor_id = NULL` = "silinmiş kullanıcı"); tarihsel kayıt korunur.

### 2.2 Drizzle schema

`packages/db/src/schema/audit-log.ts` (yeni):

```typescript
import { pgTable, text, uuid, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces'
import { users } from './users'

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: uuid().notNull(),
    before: jsonb(),
    after: jsonb(),
    ip: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdx: index('audit_log_workspace_idx').on(t.workspaceId, t.createdAt.desc()),
    targetIdx: index('audit_log_target_idx').on(t.targetType, t.targetId),
  })
)
```

Drizzle instance `casing: 'snake_case'` aktif olduğu için TS'te camelCase, DB'de snake_case ([`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md)).

## 3. Domain (`packages/domain`)

### 3.1 Action enum

`packages/domain/src/audit/actions.ts` (yeni):

```typescript
/**
 * Audit log action enum — yalnız kritik mutation kapsamı.
 * Append-only: yeni action eklenir, mevcutlar değiştirilmez/silinmez.
 * activity_events ile dublike değil; audit log forensic odaklı.
 */
export const AUDIT_ACTIONS = [
  // Workspace lifecycle
  'workspace.delete',
  'workspace.member.role_change',
  'workspace.member.remove',
  'workspace.invitation.revoke',
  // Board lifecycle
  'board.delete',
  'board.member.role_change',
  'board.member.remove',
  'board.invitation.revoke',
  // Card destructive
  'card.delete',
  'attachment.delete',
  // Share (forensic kritik)
  'share.create',
  'share.revoke',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_TARGET_TYPES = ['workspace', 'board', 'list', 'card', 'user', 'attachment', 'share_link'] as const
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number]
```

**Yeni action eklerken kural:** activity_events'ten farklı olarak audit'e girmek için iki kriter:
1. **Geri alınamaz veya zor geri alınır** (delete, role değişikliği, share token üretimi).
2. **Forensic ihtiyaç olabilir** ("kim ne zaman bu kaydı sildi/yetkisini değiştirdi?").

Sıradan create/update (board adı değiştirme, kart taşıma, yorum yazma) audit'e girmez — activity_events yeterli.

### 3.2 Zod şema

`packages/domain/src/audit/schemas.ts`:

```typescript
import { z } from 'zod'
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from './actions'

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  action: z.enum(AUDIT_ACTIONS),
  targetType: z.enum(AUDIT_TARGET_TYPES),
  targetId: z.string().uuid(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
})

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>
```

`before`/`after` `unknown` — her action kendi delta şemasını taşıyabilir; runtime'da audit görüntüleyici tipe göre render eder (UI Faz 8 sonrası).

## 4. Backend (`packages/api`)

### 4.1 Helper

`packages/api/src/lib/audit-log.ts`:

```typescript
import type { Context } from '../context'
import type { AuditAction, AuditTargetType } from '@pusula/domain/audit'
import { auditLog } from '@pusula/db/schema/audit-log'

interface AppendAuditInput {
  action: AuditAction
  targetType: AuditTargetType
  targetId: string
  workspaceId: string
  before?: unknown
  after?: unknown
}

/**
 * Audit log'a satır ekle — mutation transaction'ı içinde çağrılır.
 * Worker outbox YOK: audit log fire-and-forget değil; kritik mutation tx'inde
 * insert yapılır ki tutarlılık garanti olsun (mutation başarılı → audit yazılı).
 *
 * IP ve User-Agent ctx.request'ten okunur (Hono request header'ları).
 */
export async function appendAudit(ctx: Context, input: AppendAuditInput): Promise<void> {
  await ctx.tx.insert(auditLog).values({
    workspaceId: input.workspaceId,
    actorId: ctx.session?.userId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: ctx.request?.headers.get('x-forwarded-for') ?? ctx.request?.headers.get('x-real-ip') ?? null,
    userAgent: ctx.request?.headers.get('user-agent') ?? null,
  })
}
```

`ctx.tx` — mutation procedure'ün açtığı transaction. `tx` yoksa (procedure transaction kullanmıyorsa) compile-time error.

### 4.2 Mutation entegrasyonu

Helper kullanım örneği (`packages/api/src/routers/workspace.ts` `delete` mutation'ında):

```typescript
.mutation(async ({ ctx, input }) => {
  return await ctx.db.transaction(async (tx) => {
    const txCtx = { ...ctx, tx }
    const before = await tx.query.workspaces.findFirst({
      where: eq(workspaces.id, input.workspaceId),
    })
    if (!before) throw new TRPCError({ code: 'NOT_FOUND' })

    // ... permission check, cascade delete ...

    await tx.delete(workspaces).where(eq(workspaces.id, input.workspaceId))

    await appendAudit(txCtx, {
      action: 'workspace.delete',
      targetType: 'workspace',
      targetId: input.workspaceId,
      workspaceId: input.workspaceId,
      before,
      after: null,
    })

    return { ok: true }
  })
})
```

12 action × ortalama 1-2 mutation = ~15 mutation noktasında `appendAudit` çağrısı. Tek noktada (helper) IP/UA toplama → DRY.

### 4.3 tRPC procedure

`packages/api/src/routers/audit.ts` (yeni):

```typescript
export const auditRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        action: z.enum(AUDIT_ACTIONS).optional(),
        targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Permission: yalnız workspace owner (admin değil)
      await assertWorkspaceOwner(ctx, input.workspaceId)

      // ... pagination + filter + JOIN actor user ...
    }),
})
```

`workspaceProcedure` mevcut workspace member kapısı; ek olarak `assertWorkspaceOwner` (yeni helper) owner check'i ekler.

## 5. Permission (yalnız workspace owner)

### 5.1 Karar gerekçesi

Audit log = compliance + forensic. **Yalnız workspace owner** görür:
- **Admin değil:** Admin yönetimsel işler için yeterli yetkiye sahip; owner ekonomik/yasal sorumlu.
- **Trello/Linear paritesi:** Olgun ürünlerde audit log = workspace owner only.
- **Information leak:** Admin'in "kim kimi ne zaman çıkardı" görmesi gizlilik gerektirebilir; owner level'da tutmak güvenli default.

İleride (V2+) workspace settings'te owner "spesifik admin'lere audit görme yetkisi ver" toggle ekleyebilir; V1 kapsamı dışı.

### 5.2 Helper

`packages/api/src/lib/permission-guards.ts`'e ekleme:

```typescript
export async function assertWorkspaceOwner(ctx: Context, workspaceId: string): Promise<void> {
  const member = await ctx.db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, ctx.session.userId),
      eq(workspaceMembers.role, 'owner')
    ),
  })
  if (!member) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Audit log yalnız workspace owner tarafından görüntülenebilir.' })
  }
}
```

`audit.list` dışındaki mutation'lar (write) audit'e yazar ama okumaz — sıradan member/admin'in mutation kaydını yazması normal akışın parçası.

## 6. Retention (süresiz)

### 6.1 Karar

**Süresiz** — silinmez. Gerekçe:
- **Compliance:** GDPR "right to erasure" kullanıcı verisini siler ama audit log forensic istisnası (`actor_id` SET NULL → kullanıcı silinince actor anonimleşir, kayıt kalır).
- **Storage maliyeti düşük:** Satır başına ~500 byte. 10K mutation/yıl/workspace ≈ 5 MB/yıl. 1000 workspace × 10 yıl ≈ 50 GB — PostgreSQL için trivial.
- **Immutable garantisini güçlendirir:** Retention politikası = "bazı kayıtlar bir gün silinecek" pratiği audit'in immutability iddiasını zayıflatır.

### 6.2 V2 esnekliği

İleride (compliance gereksinimi değişirse) workspace ayarında "audit retention" seçeneği (30g/90g/1y/süresiz) açılabilir. V1 kapsamı dışı.

## 7. Worker outbox simetri (yok)

Faz 5B (`realtime_events`) ve Faz 6 (`notification_outbox`) **worker outbox** kullanır: mutation tx'inde sıraya alır, worker async işler.

Audit log **kullanmaz**:
- Audit log = fire-and-forget DEĞİL. Mutation başarılı olduysa audit kaydı yazılı olmalı; tx içinde insert tutarlılık garantisi.
- Async outbox'ta worker fail olursa audit kaybolur — compliance ihlali.
- Audit insert ~1 ms latency ekler; mutation latency'sine etkisi ihmal edilebilir.

## 8. UI (bu issue dışı — ayrı follow-up)

`audit.list` procedure 8E ([DEM-282](https://linear.app/demirkol/issue/DEM-282)) kapsamında. UI ekranı (`apps/web/src/app/(app)/workspaces/[id]/audit/page.tsx`) **Faz 8 sonrası ayrı issue** olarak açılır — owner için audit log görüntülemesi:
- Tablo: created_at + actor + action + target + before/after delta diff viewer.
- Filtre: action enum + targetType + tarih aralığı.
- Export: CSV (V1) / PDF (V2).
- Pagination (cursor-based, `limit=50`).

8E kapsamı yalnız: tablo + helper + tRPC procedure + 15 mutation noktasına `appendAudit` çağrısı + test. UI yer tutucu.

## 9. Test stratejisi (8E kapsamı)

### Vitest backend
- **Helper:** `appendAudit` IP/UA okuma, actor null fallback.
- **Append:** her 12 action × bir mutation senaryosu — tx içinde insert.
- **Immutability:** UPDATE/DELETE trigger reddi (RAISE EXCEPTION).
- **Permission:** `audit.list` member/admin reject (owner only).
- **Filter:** action + targetType + cursor pagination.
- **Cascade:** user delete → `actor_id` SET NULL; workspace delete RESTRICT (audit varsa).

### Migration test
- `audit_log` tablo + 2 index + 2 trigger + 2 FK constraint.
- Trigger fire on UPDATE/DELETE.

### Integration
- Tam stack: workspace owner gerçek mutation yapar → audit row görünür; member `audit.list` çağırır → FORBIDDEN.

## 10. Kaçınılması gerekenler

- `audit_log`'a `activity_events` ile **aynı** mutation'ları yazma — kapsam farklı (kritik vs hepsi).
- Audit log'u worker outbox'a koyma — fire-and-forget tutarlılığı bozar.
- Owner dışına okuma izni verme (admin de dahil) — V1'de sıkı tut.
- UPDATE/DELETE trigger'ı atlama — append-only iddiasını kıran kod.
- Retention politikası ekleme — V1'de süresiz tut.
- `before`/`after` field'larını insan-okur formatta yazma — audit log makine-okur; UI formatta gösterir.
- IP/UA toplama eksik bırakma — forensic kanıt zayıflar.
- `workspace.delete` audit yazmadan workspace silme — silme öncesi audit yaz, sonra cascade.

## 11. Bağımlılıklar

- Faz 0 `users` + `workspaces` tablosu ✅
- Faz 1 `workspace_members.role` enum (`owner` dahil) ✅
- Faz 0 Drizzle migration sistemi ✅
- `crypto.randomUUID` (PostgreSQL `gen_random_uuid()`) — Postgres extension `pgcrypto` etkin (Faz 0).

## 12. İlgili belgeler

- Domain edge case envanteri + permission kuralları: [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md)
- Veri katmanı tablosu: [`04-veri-katmani.md`](04-veri-katmani.md) `audit_log` satırı (8E'de eklenir)
- Backend procedure listesi: [`03-backend.md`](03-backend.md) Faz 8 `audit.*` satırı (8E'de eklenir)
- Karar kaydı: [`02-teknoloji-kararlari.md`](02-teknoloji-kararlari.md) 2026-05-24 satırı
- Faz planı: [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) Faz 8 alt iş listesi
- Defter: [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md) DOC-2026-05-24-001 (8.0) + API-2026-05-24-002 (8E)
