import { z } from 'zod';
import { idSchema } from '../schemas/common';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from './actions';

/**
 * Bir audit log satırının kanonik şeması. `before`/`after` her action için
 * farklı şekilde olabilir (delta JSON) — `z.unknown()` üst sınır, runtime'da
 * UI render eden taraf action'a göre tipi daraltır (8E kapsamı dışı).
 */
export const auditLogEntrySchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  actorId: idSchema.nullable(),
  action: z.enum(AUDIT_ACTIONS),
  targetType: z.enum(AUDIT_TARGET_TYPES),
  targetId: idSchema,
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
