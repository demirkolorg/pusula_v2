import { describe, expect, it } from 'vitest';

import { buildActivityChanges } from './activity-changes';
import { truncateForAudit } from './truncate';

describe('buildActivityChanges (domain)', () => {
  it('returns an empty list for non-object payloads', () => {
    expect(buildActivityChanges(null)).toEqual([]);
    expect(buildActivityChanges(undefined)).toEqual([]);
    expect(buildActivityChanges('text')).toEqual([]);
    expect(buildActivityChanges(42)).toEqual([]);
  });

  it('builds a diff row for from*/to* pairs (label defaults to the field key)', () => {
    expect(buildActivityChanges({ fromTitle: 'Eski', toTitle: 'Yeni' })).toEqual([
      { kind: 'diff', field: 'title', label: 'Title', from: 'Eski', to: 'Yeni' },
    ]);
  });

  it('builds a diff row for old*/new* pairs', () => {
    expect(buildActivityChanges({ oldColor: 'kırmızı', newColor: 'mavi' })).toEqual([
      { kind: 'diff', field: 'color', label: 'Color', from: 'kırmızı', to: 'mavi' },
    ]);
  });

  it('labels a bare from/to pair with an empty field key', () => {
    expect(buildActivityChanges({ from: 'a', to: 'b' })).toEqual([
      { kind: 'diff', field: '', label: '', from: 'a', to: 'b' },
    ]);
  });

  it('builds value rows for standalone scalars (id-like keys skipped)', () => {
    expect(buildActivityChanges({ fileName: 'rapor.png', cardId: 'c1' })).toEqual([
      { kind: 'value', field: 'filename', label: 'fileName', value: 'rapor.png' },
    ]);
  });

  it('skips identifier-only payloads', () => {
    expect(buildActivityChanges({ cardId: 'c1', attachmentId: 'at1', id: 'x' })).toEqual([]);
  });

  it('formats byte counts via the injected formatBytes', () => {
    const changes = buildActivityChanges(
      { sizeBytes: 2048 },
      { formatBytes: (n) => `${n / 1024} KB` },
    );
    expect(changes).toEqual([{ kind: 'value', field: 'sizebytes', label: 'sizeBytes', value: '2 KB' }]);
  });

  it('falls back to String(bytes) when no formatBytes is injected', () => {
    expect(buildActivityChanges({ sizeBytes: 2048 })).toEqual([
      { kind: 'value', field: 'sizebytes', label: 'sizeBytes', value: '2048' },
    ]);
  });

  it('resolves labels through injected fieldLabel / valueLabel', () => {
    const changes = buildActivityChanges(
      { fromTitle: 'a', toTitle: 'b', fileName: 'x.png' },
      {
        fieldLabel: (suffix) => (suffix === 'Title' ? 'Başlık' : suffix),
        valueLabel: (key) => (key === 'fileName' ? 'Dosya' : key),
      },
    );
    expect(changes).toEqual([
      { kind: 'diff', field: 'title', label: 'Başlık', from: 'a', to: 'b' },
      { kind: 'value', field: 'filename', label: 'Dosya', value: 'x.png' },
    ]);
  });

  it('applies a custom formatCell for boolean/role wording', () => {
    const changes = buildActivityChanges(
      { archived: true },
      {
        formatCell: (name, raw) =>
          name.toLowerCase() === 'archived' && typeof raw === 'boolean'
            ? raw
              ? 'Arşivlendi'
              : 'Geri yüklendi'
            : undefined,
      },
    );
    expect(changes).toEqual([
      { kind: 'value', field: 'archived', label: 'archived', value: 'Arşivlendi' },
    ]);
  });

  describe('2KB truncate flag', () => {
    const long = 'x'.repeat(3000);

    it('unwraps a truncated value-field and surfaces truncated:true', () => {
      const trunc = truncateForAudit(long); // { value: <2048 chars>, truncated: true }
      const changes = buildActivityChanges({ toDescription: trunc, fromDescription: { value: 'kısa' } });
      expect(changes).toEqual([
        {
          kind: 'diff',
          field: 'description',
          label: 'Description',
          from: 'kısa',
          to: trunc?.value,
          truncated: true,
        },
      ]);
    });

    it('does not mark truncated when neither side was clipped', () => {
      const changes = buildActivityChanges({
        fromBody: { value: 'a' },
        toBody: { value: 'b' },
      });
      expect(changes).toEqual([
        { kind: 'diff', field: 'body', label: 'Body', from: 'a', to: 'b' },
      ]);
    });

    it('unwraps a standalone truncated value row', () => {
      const trunc = truncateForAudit(long);
      const changes = buildActivityChanges({ deletedBody: trunc });
      expect(changes).toEqual([
        {
          kind: 'value',
          field: 'deletedbody',
          label: 'deletedBody',
          value: trunc?.value,
          truncated: true,
        },
      ]);
    });

    it('treats a non-truncated audit-text wrapper as a plain string value', () => {
      const changes = buildActivityChanges({ toBody: { value: 'sade' }, fromBody: { value: '' } });
      // fromBody value '' -> formatCell returns '', but the pair is diff so both sides kept.
      expect(changes).toEqual([
        { kind: 'diff', field: 'body', label: 'Body', from: '', to: 'sade' },
      ]);
    });
  });
});
