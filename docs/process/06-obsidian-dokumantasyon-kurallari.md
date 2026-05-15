---
title: '06 — Obsidian Dokümantasyon Kuralları'
description: 'Pusula dokümanlarının Obsidian kasasında okunabilir, linklenebilir ve sürdürülebilir kalması için yazım kuralları.'
aliases:
  - 'Obsidian Dokümantasyon Kuralları'
  - 'Dokümantasyon Yazım Standardı'
tags:
  - 'pusula'
  - 'process/documentation'
  - 'obsidian/vault'
type: 'process'
axis: 'process'
status: 'active'
parent: '[[docs/process/README|Süreç]]'
updated: 2026-05-12
---

# 06 — Obsidian Dokümantasyon Kuralları

> Eksen: **süreç**. Bu repo klasörü Obsidian kasası olarak kullanılır. Markdown
> belgeleri Obsidian'da rahat gezilebilir olmalı, aynı zamanda Git/GitHub uyumlu kalmalıdır.

## Amaç

- Her Markdown dosyası Obsidian Properties, Graph View, Backlinks ve Tags üzerinden bulunabilir olmalı.
- `docs/` içindeki bilgi mimarisi bozulmamalı: teknik karar, domain kuralı ve süreç kuralı doğru eksende kalmalı.
- Yeni belge eklendiğinde yetim not oluşmamalı; ilgili harita notuna (MOC/README) eklenmeli.

## Kasa modeli

- Kök [`../../README.md`](../../README.md) proje başlangıç notudur.
- [`../README.md`](../README.md) ana dokümantasyon haritasıdır.
- [`../architecture/README.md`](../architecture/README.md), [`../domain/README.md`](../domain/README.md) ve [`README.md`](README.md) alt harita notlarıdır.
- `docs/architecture/*` teknik tasarım ve mimari kararları, `docs/domain/*` ürün/domain kurallarını, `docs/process/*` çalışma süreci kurallarını taşır.

## Frontmatter standardı

Her yeni `.md` dosyası en üstte YAML frontmatter ile başlamalıdır:

```yaml
---
title: 'Okunabilir başlık'
description: 'Belgenin bir cümlelik amacı.'
aliases:
  - 'Obsidian hızlı açma için alternatif ad'
tags:
  - 'pusula'
  - 'architecture/example'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/README|Tasarım / Teknik Mimari]]'
updated: YYYY-MM-DD
---
```

Alan kuralları:

- `title`: Dosyadaki H1 ile tutarlı olmalı.
- `description`: Arama sonuçlarında belgenin amacını tek cümlede anlatmalı.
- `aliases`: Obsidian Quick Switcher için kısa ve doğal adlar içermeli.
- `tags`: Her notta `pusula` ve eksene uygun ikinci tag bulunmalı.
- `type`: `moc`, `architecture`, `domain`, `process`, `protocol`, `plan`, `register`, `reference`, `handoff` gibi belge türünü belirtmeli.
- `axis`: `root`, `docs`, `architecture`, `domain` veya `process` değerlerinden biri olmalı.
- `parent`: Notun bağlı olduğu harita notunu göstermeli.
- `updated`: Belge bilinçli değiştirildiğinde güncellenmeli.

## Link standardı

- Metin içinde varsayılan link biçimi göreli Markdown linkidir: `[Başlık](../domain/01-urun-modeli.md)`. Obsidian bu linkleri de graph/backlink olarak izler ve GitHub uyumluluğu korunur.
- Frontmatter içinde `parent` ve `related` alanlarında Obsidian wikilink kullanılabilir: `"[[docs/README|Pusula Belgeleri]]"`.
- Bir kavramın ilk geçtiği yerde kanonik belgeye link ver; aynı kuralı farklı dosyalara kopyalama.
- Yeni dosya açıldığında ilgili `README.md` harita notuna eklenmeli ve gerekirse komşu belgelerin `related` alanı veya metin linkleri güncellenmeli.

## Etiket standardı

- Genel tag: `pusula`.
- Harita notları: `docs/moc`, `architecture/moc`, `domain/moc`, `process/moc`.
- Teknik notlar: `architecture/<konu>`.
- Domain notları: `domain/<konu>`.
- Süreç notları: `process/<konu>`.
- Obsidian'a özel düzen veya kasa kuralları: `obsidian/vault`.

## Yeni belge kontrol listesi

1. Doğru ekseni seç: teknik → `architecture`, ürün kuralı → `domain`, çalışma şekli → `process`.
2. Dosyayı kebab-case ve gerekirse sıra numarasıyla adlandır.
3. Frontmatter'ı ekle; `title`, `description`, `aliases`, `tags`, `type`, `axis`, `status`, `parent`, `updated` alanlarını doldur.
4. Tek bir H1 kullan; başlık frontmatter `title` alanıyla uyumlu olsun.
5. İlgili MOC/README tablosuna dosyayı ekle.
6. İlgili mevcut notlara link ver; yetim belge bırakma.
7. Kod bloğu varsa dil etiketi kullan (`ts`, `bash`, `txt`, `yaml`).
8. Karar, domain kuralı veya süreç değiştiyse [`04-otomatik-is-akisi-protokolu.md`](04-otomatik-is-akisi-protokolu.md) ve [`05-is-kayit-defteri.md`](05-is-kayit-defteri.md) kurallarına göre senkronu tamamla.
