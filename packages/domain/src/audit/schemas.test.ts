import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, auditLogEntrySchema } from './index';

describe('@pusula/domain/audit', () => {
  it('AUDIT_ACTIONS — 14 forensic action (board.delete / card.delete forward-compat + api_key dahil)', () => {
    expect(AUDIT_ACTIONS).toHaveLength(14);
    expect(AUDIT_ACTIONS).toContain('workspace.delete');
    expect(AUDIT_ACTIONS).toContain('workspace.member.role_change');
    expect(AUDIT_ACTIONS).toContain('workspace.member.remove');
    expect(AUDIT_ACTIONS).toContain('workspace.invitation.revoke');
    expect(AUDIT_ACTIONS).toContain('board.delete');
    expect(AUDIT_ACTIONS).toContain('board.member.role_change');
    expect(AUDIT_ACTIONS).toContain('board.member.remove');
    expect(AUDIT_ACTIONS).toContain('board.invitation.revoke');
    expect(AUDIT_ACTIONS).toContain('card.delete');
    expect(AUDIT_ACTIONS).toContain('attachment.delete');
    expect(AUDIT_ACTIONS).toContain('share.create');
    expect(AUDIT_ACTIONS).toContain('share.revoke');
    expect(AUDIT_ACTIONS).toContain('api_key.created');
    expect(AUDIT_ACTIONS).toContain('api_key.revoked');
  });

  it('AUDIT_TARGET_TYPES — 8 hedef türü (api_key dahil)', () => {
    expect(AUDIT_TARGET_TYPES).toEqual([
      'workspace',
      'board',
      'list',
      'card',
      'user',
      'attachment',
      'share_link',
      'api_key',
    ]);
  });

  it('auditLogEntrySchema: geçerli kaydı doğrular', () => {
    const parsed = auditLogEntrySchema.safeParse({
      id: 'aud_abc',
      workspaceId: 'ws_abc',
      actorId: 'usr_abc',
      action: 'workspace.member.role_change',
      targetType: 'user',
      targetId: 'usr_xyz',
      before: { role: 'member' },
      after: { role: 'admin' },
      ip: '203.0.113.1',
      userAgent: 'curl/8.0',
      createdAt: new Date(),
    });
    expect(parsed.success).toBe(true);
  });

  it('auditLogEntrySchema: actorId null kabul eder (sistem / silinmiş kullanıcı)', () => {
    const parsed = auditLogEntrySchema.safeParse({
      id: 'aud_abc',
      workspaceId: 'ws_abc',
      actorId: null,
      action: 'workspace.delete',
      targetType: 'workspace',
      targetId: 'ws_abc',
      before: null,
      after: null,
      ip: null,
      userAgent: null,
      createdAt: new Date(),
    });
    expect(parsed.success).toBe(true);
  });

  it('auditLogEntrySchema: action enum dışı reddeder', () => {
    const parsed = auditLogEntrySchema.safeParse({
      id: 'aud_abc',
      workspaceId: 'ws_abc',
      actorId: null,
      action: 'card.move',
      targetType: 'card',
      targetId: 'crd_abc',
      before: null,
      after: null,
      ip: null,
      userAgent: null,
      createdAt: new Date(),
    });
    expect(parsed.success).toBe(false);
  });
});
