import { describe, expect, it } from 'vitest';
import {
  RETENTION_KEEP_VERSIONS,
  RETENTION_MAX_AGE_DAYS,
  decideAdHocRenderRetention,
  decideSavedReportRenderRetention,
} from './report-retention-policy';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-05-24T12:00:00.000Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * ONE_DAY_MS);
}

describe('RETENTION_KEEP_VERSIONS / RETENTION_MAX_AGE_DAYS sabitleri', () => {
  it('spec §9.10 ile eşleşir: son 5 versiyon, 90 gün', () => {
    expect(RETENTION_KEEP_VERSIONS).toBe(5);
    expect(RETENTION_MAX_AGE_DAYS).toBe(90);
  });
});

describe('decideSavedReportRenderRetention', () => {
  it('boş render listesi → boş karar dizisi', () => {
    const decisions = decideSavedReportRenderRetention({
      renders: [],
      now: NOW,
    });
    expect(decisions).toEqual([]);
  });

  it('6 versiyon, hepsi 180g eski → son 5 korunur, en eski silinir', () => {
    const renders = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i + 1}`,
      version: i + 1,
      createdAt: daysAgo(180),
    }));
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    const kept = decisions.filter((d) => d.action === 'keep');
    const deleted = decisions.filter((d) => d.action === 'delete');
    expect(kept).toHaveLength(5);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]!.renderId).toBe('r1');
    expect(deleted[0]!.reason).toBe('superseded_by_newer_versions');
  });

  it('5 ya da daha az versiyon → yaşa bakılmaz, hepsi tutulur', () => {
    const renders = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i + 1}`,
      version: i + 1,
      createdAt: daysAgo(500), // çok eski
    }));
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    expect(decisions.every((d) => d.action === 'keep')).toBe(true);
    expect(decisions.every((d) => d.reason === 'kept_recent_version')).toBe(true);
  });

  it('3 versiyon (5\'ten az) → hepsi `kept_recent_version`', () => {
    const renders = [
      { id: 'r1', version: 1, createdAt: daysAgo(365) },
      { id: 'r2', version: 2, createdAt: daysAgo(180) },
      { id: 'r3', version: 3, createdAt: daysAgo(10) },
    ];
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    expect(decisions).toHaveLength(3);
    expect(decisions.every((d) => d.action === 'keep')).toBe(true);
    expect(decisions.every((d) => d.reason === 'kept_recent_version')).toBe(true);
  });

  it('10 versiyon, hepsi son 90g içinde → son 5 `kept_recent_version`, geri kalan 5 `kept_under_age`', () => {
    const renders = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i + 1}`,
      version: i + 1,
      createdAt: daysAgo(30),
    }));
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    expect(decisions.every((d) => d.action === 'keep')).toBe(true);
    const recent = decisions.filter((d) => d.reason === 'kept_recent_version');
    const underAge = decisions.filter((d) => d.reason === 'kept_under_age');
    expect(recent).toHaveLength(5);
    expect(underAge).toHaveLength(5);
  });

  it('en yeni versiyon her zaman korunur (son sürüm 200g eski olsa bile)', () => {
    const renders = [
      { id: 'r1', version: 1, createdAt: daysAgo(180) },
      { id: 'r2', version: 2, createdAt: daysAgo(200) }, // en yeni versiyon ama eski timestamp
    ];
    const decisions = decideSavedReportRenderRetention({
      renders,
      now: NOW,
      keepVersions: 1,
    });
    const kept = decisions.filter((d) => d.action === 'keep');
    expect(kept).toHaveLength(1);
    expect(kept[0]!.renderId).toBe('r2');
    expect(kept[0]!.reason).toBe('kept_recent_version');
  });

  it('sürüm sırası karışık verilse de versiyona göre DESC sıralanır', () => {
    const renders = [
      { id: 'r2', version: 2, createdAt: daysAgo(100) },
      { id: 'r6', version: 6, createdAt: daysAgo(100) },
      { id: 'r4', version: 4, createdAt: daysAgo(100) },
      { id: 'r1', version: 1, createdAt: daysAgo(100) },
      { id: 'r5', version: 5, createdAt: daysAgo(100) },
      { id: 'r3', version: 3, createdAt: daysAgo(100) },
    ];
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    const deleted = decisions.filter((d) => d.action === 'delete');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]!.renderId).toBe('r1');
  });

  it('duplicate version → createdAt DESC tie-break (en yeni timestamp korunur)', () => {
    const renders = [
      { id: 'r-old', version: 5, createdAt: daysAgo(100) },
      { id: 'r-new', version: 5, createdAt: daysAgo(1) },
      { id: 'r4', version: 4, createdAt: daysAgo(200) },
      { id: 'r3', version: 3, createdAt: daysAgo(200) },
      { id: 'r2', version: 2, createdAt: daysAgo(200) },
      { id: 'r1', version: 1, createdAt: daysAgo(200) },
    ];
    const decisions = decideSavedReportRenderRetention({
      renders,
      now: NOW,
      keepVersions: 5,
    });
    // 6 satır; ilk 5'i (DESC version, DESC createdAt) korunur:
    // r-new (v5,1g), r-old (v5,100g), r4, r3, r2 → r1 silinir
    const deleted = decisions.filter((d) => d.action === 'delete');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]!.renderId).toBe('r1');
  });

  it('keepVersions=0 → hiçbir sürüm "recent" korumasına almaz, age kuralı geçerli', () => {
    const renders = [
      { id: 'r1', version: 1, createdAt: daysAgo(120) }, // eski
      { id: 'r2', version: 2, createdAt: daysAgo(10) }, // yeni
    ];
    const decisions = decideSavedReportRenderRetention({
      renders,
      now: NOW,
      keepVersions: 0,
    });
    const r1 = decisions.find((d) => d.renderId === 'r1')!;
    const r2 = decisions.find((d) => d.renderId === 'r2')!;
    expect(r1.action).toBe('delete');
    expect(r1.reason).toBe('superseded_by_newer_versions');
    expect(r2.action).toBe('keep');
    expect(r2.reason).toBe('kept_under_age');
  });

  it('keepVersions=10 (override) — 6 satır → hepsi tutulur', () => {
    const renders = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i + 1}`,
      version: i + 1,
      createdAt: daysAgo(500),
    }));
    const decisions = decideSavedReportRenderRetention({
      renders,
      now: NOW,
      keepVersions: 10,
    });
    expect(decisions.every((d) => d.action === 'keep')).toBe(true);
  });

  it('maxAgeDays=30 override — 35g eski 6. sürüm silinir, 25g eski 7. tutulur', () => {
    const renders = [
      { id: 'r7', version: 7, createdAt: daysAgo(25) }, // korumalı (son 5)
      { id: 'r6', version: 6, createdAt: daysAgo(25) }, // korumalı (son 5)
      { id: 'r5', version: 5, createdAt: daysAgo(25) }, // korumalı (son 5)
      { id: 'r4', version: 4, createdAt: daysAgo(25) }, // korumalı (son 5)
      { id: 'r3', version: 3, createdAt: daysAgo(25) }, // korumalı (son 5)
      { id: 'r2', version: 2, createdAt: daysAgo(25) }, // age 25g (< 30g) → keep
      { id: 'r1', version: 1, createdAt: daysAgo(35) }, // age 35g (> 30g) → delete
    ];
    const decisions = decideSavedReportRenderRetention({
      renders,
      now: NOW,
      maxAgeDays: 30,
    });
    const r1 = decisions.find((d) => d.renderId === 'r1')!;
    const r2 = decisions.find((d) => d.renderId === 'r2')!;
    expect(r1.action).toBe('delete');
    expect(r2.action).toBe('keep');
    expect(r2.reason).toBe('kept_under_age');
  });

  it('createdAt sınır — tam 90 gün (eşit) → tutulur (kept_under_age)', () => {
    const renders = [
      { id: 'rA', version: 1, createdAt: new Date(NOW.getTime() - 90 * ONE_DAY_MS) },
      { id: 'rB', version: 2, createdAt: daysAgo(1) },
      { id: 'rC', version: 3, createdAt: daysAgo(1) },
      { id: 'rD', version: 4, createdAt: daysAgo(1) },
      { id: 'rE', version: 5, createdAt: daysAgo(1) },
      { id: 'rF', version: 6, createdAt: daysAgo(1) },
    ];
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    const rA = decisions.find((d) => d.renderId === 'rA')!;
    expect(rA.action).toBe('keep');
    expect(rA.reason).toBe('kept_under_age');
  });

  it('createdAt sınır — tam 91 gün → silinir', () => {
    const renders = [
      { id: 'rA', version: 1, createdAt: new Date(NOW.getTime() - 91 * ONE_DAY_MS) },
      { id: 'rB', version: 2, createdAt: daysAgo(1) },
      { id: 'rC', version: 3, createdAt: daysAgo(1) },
      { id: 'rD', version: 4, createdAt: daysAgo(1) },
      { id: 'rE', version: 5, createdAt: daysAgo(1) },
      { id: 'rF', version: 6, createdAt: daysAgo(1) },
    ];
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    const rA = decisions.find((d) => d.renderId === 'rA')!;
    expect(rA.action).toBe('delete');
    expect(rA.reason).toBe('superseded_by_newer_versions');
  });

  it('clock skew (createdAt gelecek tarih) → keep (age negatif, eşik altında)', () => {
    const renders = [
      { id: 'r1', version: 1, createdAt: new Date(NOW.getTime() + 10 * ONE_DAY_MS) },
      { id: 'r2', version: 2, createdAt: daysAgo(1) },
      { id: 'r3', version: 3, createdAt: daysAgo(1) },
      { id: 'r4', version: 4, createdAt: daysAgo(1) },
      { id: 'r5', version: 5, createdAt: daysAgo(1) },
      { id: 'r6', version: 6, createdAt: daysAgo(1) },
    ];
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    const r1 = decisions.find((d) => d.renderId === 'r1')!;
    expect(r1.action).toBe('keep');
    expect(r1.reason).toBe('kept_under_age');
  });

  it('keepVersions negatif → hata', () => {
    expect(() =>
      decideSavedReportRenderRetention({
        renders: [],
        now: NOW,
        keepVersions: -1,
      }),
    ).toThrowError(/keepVersions/);
  });

  it('maxAgeDays NaN → hata', () => {
    expect(() =>
      decideSavedReportRenderRetention({
        renders: [],
        now: NOW,
        maxAgeDays: Number.NaN,
      }),
    ).toThrowError(/maxAgeDays/);
  });

  it('100 sürüm — son 5 recent + sonraki 95 age davranışına göre dağılır', () => {
    const renders = Array.from({ length: 100 }, (_, i) => ({
      id: `r${i + 1}`,
      version: i + 1,
      // Yarısı yeni (< 90g), yarısı eski (> 90g)
      createdAt: i < 50 ? daysAgo(120) : daysAgo(30),
    }));
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    expect(decisions).toHaveLength(100);
    // Son 5 (v96..v100, age 30g) recent
    const recent = decisions.filter((d) => d.reason === 'kept_recent_version');
    expect(recent).toHaveLength(5);
    // v51..v95 age 30g → kept_under_age (45 satır)
    const underAge = decisions.filter((d) => d.reason === 'kept_under_age');
    expect(underAge).toHaveLength(45);
    // v1..v50 age 120g → delete (50 satır)
    const deleted = decisions.filter((d) => d.action === 'delete');
    expect(deleted).toHaveLength(50);
  });

  it('sıra deterministik — sortlu DESC version', () => {
    const renders = Array.from({ length: 7 }, (_, i) => ({
      id: `r${i + 1}`,
      version: i + 1,
      createdAt: daysAgo(150),
    }));
    const decisions = decideSavedReportRenderRetention({ renders, now: NOW });
    // İlk 5 karar en yeni sürümler (v7, v6, v5, v4, v3) — keep
    expect(decisions.slice(0, 5).map((d) => d.renderId)).toEqual([
      'r7',
      'r6',
      'r5',
      'r4',
      'r3',
    ]);
    expect(decisions.slice(0, 5).every((d) => d.action === 'keep')).toBe(true);
    // Son 2 karar en eski sürümler (v2, v1) — delete
    expect(decisions.slice(5).map((d) => d.renderId)).toEqual(['r2', 'r1']);
    expect(decisions.slice(5).every((d) => d.action === 'delete')).toBe(true);
  });
});

describe('decideAdHocRenderRetention', () => {
  it('1 gün eski ad-hoc → keep (kept_under_age)', () => {
    const decision = decideAdHocRenderRetention({
      render: { id: 'r1', createdAt: daysAgo(1) },
      now: NOW,
    });
    expect(decision.action).toBe('keep');
    expect(decision.reason).toBe('kept_under_age');
    expect(decision.renderId).toBe('r1');
  });

  it('89 gün eski ad-hoc → keep', () => {
    const decision = decideAdHocRenderRetention({
      render: { id: 'r2', createdAt: daysAgo(89) },
      now: NOW,
    });
    expect(decision.action).toBe('keep');
  });

  it('tam 90 gün eski (eşit) → keep', () => {
    const decision = decideAdHocRenderRetention({
      render: { id: 'r3', createdAt: new Date(NOW.getTime() - 90 * ONE_DAY_MS) },
      now: NOW,
    });
    expect(decision.action).toBe('keep');
  });

  it('91 gün eski → delete (ad_hoc_expired)', () => {
    const decision = decideAdHocRenderRetention({
      render: { id: 'r4', createdAt: daysAgo(91) },
      now: NOW,
    });
    expect(decision.action).toBe('delete');
    expect(decision.reason).toBe('ad_hoc_expired');
  });

  it('365 gün eski → delete', () => {
    const decision = decideAdHocRenderRetention({
      render: { id: 'r5', createdAt: daysAgo(365) },
      now: NOW,
    });
    expect(decision.action).toBe('delete');
    expect(decision.reason).toBe('ad_hoc_expired');
  });

  it('maxAgeDays=7 override — 8g eski → delete', () => {
    const decision = decideAdHocRenderRetention({
      render: { id: 'r6', createdAt: daysAgo(8) },
      now: NOW,
      maxAgeDays: 7,
    });
    expect(decision.action).toBe('delete');
  });

  it('clock skew (gelecek tarih) → keep', () => {
    const decision = decideAdHocRenderRetention({
      render: { id: 'r7', createdAt: new Date(NOW.getTime() + 5 * ONE_DAY_MS) },
      now: NOW,
    });
    expect(decision.action).toBe('keep');
  });

  it('maxAgeDays negatif → hata', () => {
    expect(() =>
      decideAdHocRenderRetention({
        render: { id: 'r8', createdAt: daysAgo(1) },
        now: NOW,
        maxAgeDays: -1,
      }),
    ).toThrowError(/maxAgeDays/);
  });
});
