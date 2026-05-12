---
title: "Pusula Belgeleri"
description: "Pusula dokümantasyon kasasının ana harita notu."
aliases:
  - "Belgeler MOC"
  - "Dokümantasyon Ana Sayfa"
tags:
  - "pusula"
  - "docs/moc"
  - "obsidian/vault"
type: "moc"
axis: "docs"
status: "active"
related:
  - "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
  - "[[docs/domain/README|İş / Domain Kuralları]]"
  - "[[docs/process/README|Süreç]]"
  - "[[docs/process/00-calisma-baslangic-rehberi|Çalışma Başlangıç Rehberi]]"
  - "[[docs/kontrol-odasi/README|Kontrol Odası]]"
updated: 2026-05-12
---
# Pusula Belgeleri

Pusula'nın "source of truth" belgeleri **üç eksende** ayrılmıştır. Tasarım kararları,
iş kuralları ve süreç **aynı dosyada karıştırılmaz** — bu ayrım belgeyi yönetilebilir
tutar ve "neyi nerede ararım?" sorusunu netleştirir.

| Eksen | "Sorduğu soru" | Klasör | İçerik |
| --- | --- | --- | --- |
| **Tasarım / teknik** | _Nasıl inşa ediyoruz?_ | [`architecture/`](architecture/) | Stack, monorepo yapısı, pattern'ler (optimistic UI, outbox, transaction), altyapı, transport, deployment, observability, test |
| **İş / domain** | _Ürün ne yapıyor, kim ne yapabilir?_ | [`domain/`](domain/) | Domain modeli, invariant'lar, yetkilendirme kuralları, bildirim/sıralama/aktivite/arama/ek kuralları |
| **Süreç** | _Nasıl çalışıyoruz?_ | [`process/`](process/) | Çalışma başlangıç rehberi, Linear iş akışı, otomatik senkron protokolü, iş kayıt defteri, MVP faz planı |

## Obsidian'da başlangıç

Bu dosya ana harita notudur (MOC). Obsidian'da incelemeye buradan başla; Graph View'da
`pusula`, `architecture/*`, `domain/*`, `process/*` ve `docs/moc` tag'leriyle filtrele.
Notların en üstündeki Properties alanları hızlı tarama için `title`, `description`, `type`,
`axis`, `status`, `parent` ve `updated` bilgilerini taşır.

Doküman yazım standardı ve yeni not kontrol listesi: [`process/06-obsidian-dokumantasyon-kurallari.md`](process/06-obsidian-dokumantasyon-kurallari.md).

## Hangi belgeyi ne zaman açarım?

- "Hangi kütüphane / nasıl mount edilir / hangi pattern?" → `architecture/`
- "Bu rolü olan kullanıcı şunu yapabilir mi? / Hangi event hangi bildirimi üretir? / Kart taşınınca ne kontrol edilir?" → `domain/`
- "Yeni işe nereden başlanır / issue nasıl açılır / iş hangi durumda / sırada hangi faz var?" → `process/`

## Diğer giriş noktaları

- Kök çalışma protokolü (Claude Code): [`../CLAUDE.md`](../CLAUDE.md)
- Yeni iş/oturum başlangıç rehberi: [`process/00-calisma-baslangic-rehberi.md`](process/00-calisma-baslangic-rehberi.md)
- İmplementasyon sözleşmesi (Claude Code skill `kontrol`): [`../.claude/skills/kontrol/SKILL.md`](../.claude/skills/kontrol/SKILL.md)
- Süreç kontrol odası tab'ının görevi: [`kontrol-odasi/README.md`](kontrol-odasi/README.md)
- Proje README: [`../README.md`](../README.md)
- Obsidian dokümantasyon kuralları: [`process/06-obsidian-dokumantasyon-kurallari.md`](process/06-obsidian-dokumantasyon-kurallari.md)

## Kural ekleme rehberi

1. **Eksen seç:** Bu bir _nasıl_ kuralı mı (tasarım), _ne / kim_ kuralı mı (domain), yoksa _çalışma şekli_ mi (süreç)? Yanlış klasöre yazma.
2. **Doğru dosyaya yaz:** İlgili klasörün `README.md` indeksinden dosyayı bul; yoksa yeni dosya aç ve indekse ekle.
3. **Obsidian standardını koru:** Frontmatter, `aliases`, `tags`, `parent`, `updated` ve ilgili MOC/README linkleri güncel olmalı.
4. **Teknoloji kararı değiştiyse:** `architecture/02-teknoloji-kararlari.md`'deki "Karar kaydı"na tarihli satır ekle.
5. **İş durumu değiştiyse:** Linear issue ile `process/05-is-kayit-defteri.md` aynı durumu taşımalı; ayrıntı protokolü `process/04-otomatik-is-akisi-protokolu.md`.
6. **Özetleri güncelle:** Kök `CLAUDE.md` ve `.claude/skills/kontrol/SKILL.md` yalnızca özet + pointer içerir; oraya ayrıntı koyma, sadece pointer'ı güncel tut.

> Geçmiş: Bu yapı, eski tekil mimari/skill notlarının tasarım / iş kuralı / süreç
> eksenlerine bölünmesiyle oluştu (karar kaydı: `architecture/02-teknoloji-kararlari.md`, 2026-05-12).
