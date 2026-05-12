# Pusula — İş / Domain Kuralları (`docs/domain/`)

Bu klasör **"ürün ne yapıyor, kim ne yapabilir, hangi olay ne tetikler?"** sorularını
yanıtlar — teknolojiden bağımsız iş kuralları. Stack/altyapı/pattern için
[`../architecture/`](../architecture/), süreç için [`../process/`](../process/).

Bu kurallar `@pusula/domain` paketinde kodlanır (Zod şema, rol/permission helper, position
helper, domain/event tipleri). Domain paketi **framework-bağımsızdır** — DB/tRPC/React bilmez.

## İçindekiler

| # | Dosya | Konu |
| --- | --- | --- |
| 01 | [`01-urun-modeli.md`](01-urun-modeli.md) | Entity'ler, ilişkiler, çekirdek invariant'lar |
| 02 | [`02-yetkilendirme-kurallari.md`](02-yetkilendirme-kurallari.md) | Workspace/board/card rolleri ve yetki matrisi |
| 03 | [`03-siralama-kurallari.md`](03-siralama-kurallari.md) | Pozisyonun iş anlamı, before/after semantiği, compaction tetiği, concurrent move |
| 04 | [`04-bildirim-kurallari.md`](04-bildirim-kurallari.md) | Hangi event hangi bildirimi üretir, mute seviyeleri, tercih kapsamı, dedup |
| 05 | [`05-aktivite-kurallari.md`](05-aktivite-kurallari.md) | Aktivite event taksonomisi |
| 06 | [`06-arama-kapsami.md`](06-arama-kapsami.md) | Neler aranabilir, permission filtreleme, archived davranışı |
| 07 | [`07-ek-kurallari.md`](07-ek-kurallari.md) | Attachment: MIME/boyut limiti, kim yükleyebilir |

## Kaçınılması gerekenler (domain)

- Permission kontrolünü yalnızca frontend'e bırakmak (her zaman server-side, her procedure'de).
- Domain kuralını `apps/*` veya `packages/api`/`packages/db` içine kopyalamak — kaynak `@pusula/domain`.
- Auth provider concern'lerini permission mantığına karıştırmak.
- Bir kartı birden fazla listeye / bir listeyi birden fazla board'a ait kılan model.
- Arşivli listeye aktif kart taşımak (açık restore akışı yoksa).
- Aynı domain event'inden duplicate bildirim/activity üretmek.
