---
title: 'Pusula — İş / Domain Kuralları'
description: 'Ürün ve domain kuralları için harita notu.'
aliases:
  - 'Domain MOC'
  - 'İş Kuralları'
tags:
  - 'pusula'
  - 'domain/moc'
  - 'docs/moc'
type: 'moc'
axis: 'domain'
status: 'active'
parent: '[[docs/README|Pusula Belgeleri]]'
updated: 2026-05-25
---

# Pusula — İş / Domain Kuralları (`docs/domain/`)

Bu klasör **"ürün ne yapıyor, kim ne yapabilir, hangi olay ne tetikler?"** sorularını
yanıtlar — teknolojiden bağımsız iş kuralları. Stack/altyapı/pattern için
[`../architecture/`](../architecture/), süreç için [`../process/`](../process/).

Bu kurallar `@pusula/domain` paketinde kodlanır (Zod şema, rol/permission helper, position
helper, domain/event tipleri). Domain paketi **framework-bağımsızdır** — DB/tRPC/React bilmez.

> [!note] Obsidian
> Bu klasördeki notlar `axis: domain` ve `domain/*` tag'leriyle işaretlenir. Yeni domain
> notu açarken [`../process/06-obsidian-dokumantasyon-kurallari.md`](../process/06-obsidian-dokumantasyon-kurallari.md)
> standardını uygula, bu tabloya ekle ve ilgili teknik notlara link ver.

## İçindekiler

| #   | Dosya                                                              | Konu                                                                                     |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 01  | [`01-urun-modeli.md`](01-urun-modeli.md)                           | Entity'ler, ilişkiler, çekirdek invariant'lar                                            |
| 02  | [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md)   | Workspace/board/card rolleri ve yetki matrisi                                            |
| 03  | [`03-siralama-kurallari.md`](03-siralama-kurallari.md)             | Pozisyonun iş anlamı, before/after semantiği, compaction tetiği, concurrent move         |
| 04  | [`04-bildirim-kurallari.md`](04-bildirim-kurallari.md)             | Hangi event hangi bildirimi üretir, mute seviyeleri, tercih kapsamı, dedup               |
| 05  | [`05-aktivite-kurallari.md`](05-aktivite-kurallari.md)             | Aktivite event taksonomisi                                                               |
| 06  | [`06-arama-kapsami.md`](06-arama-kapsami.md)                       | Neler aranabilir, permission filtreleme, archived davranışı                              |
| 07  | [`07-ek-kurallari.md`](07-ek-kurallari.md)                         | Attachment: MIME/boyut limiti, kim yükleyebilir                                          |
| 08  | [`08-paylasim-linki-kurallari.md`](08-paylasim-linki-kurallari.md) | Kart paylaşım linki: misafir görme/yorum, "Misafir" etiketi, mention yok, expiry, revoke |
| 09  | [`09-raporlama-kurallari.md`](09-raporlama-kurallari.md)           | Raporlama domain kuralları: **Faz 13** (universal micro-report sözleşmesi + scope adapter semantiği + 30 micro-report kataloğu + 19 preset + yetki matrisi + restricted scope + comparison delta + filtre seti + persistence/cadence/stale davranışı + rich text içerik) ve **Faz 14 — Klasik Pano PDF** (§9.15; "tamamlanan kart" = `cards.completed = true`, "acil" göstergesi yok, yorum clamp son 5 + footer, checklist kart altında indented, arşivli kart/liste PDF dışı, permission Faz 13F reuse, boş pano "Veri yok" sayfası). Teknik mimari → [`../architecture/16-raporlama-mimarisi.md`](../architecture/16-raporlama-mimarisi.md); Faz 14 plan → [`../process/08-faz-14-klasik-pdf-plani.md`](../process/08-faz-14-klasik-pdf-plani.md). |

## Kaçınılması gerekenler (domain)

- Permission kontrolünü yalnızca frontend'e bırakmak (her zaman server-side, her procedure'de).
- Domain kuralını `apps/*` veya `packages/api`/`packages/db` içine kopyalamak — kaynak `@pusula/domain`.
- Auth provider concern'lerini permission mantığına karıştırmak.
- Bir kartı birden fazla listeye / bir listeyi birden fazla board'a ait kılan model.
- Arşivli listeye aktif kart taşımak (açık restore akışı yoksa).
- Aynı domain event'inden duplicate bildirim/activity üretmek.
