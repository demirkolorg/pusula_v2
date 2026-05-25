---
title: 'Pusula — Süreç'
description: 'Çalışma süreci, Linear senkronu ve faz planı için harita notu.'
aliases:
  - 'Süreç MOC'
  - 'Process MOC'
tags:
  - 'pusula'
  - 'process/moc'
  - 'docs/moc'
type: 'moc'
axis: 'process'
status: 'active'
parent: '[[docs/README|Pusula Belgeleri]]'
updated: 2026-05-25
---

# Pusula — Süreç (`docs/process/`)

Bu klasör **"nasıl çalışıyoruz?"** sorusunu yanıtlar: çalışma başlangıç rehberi,
Linear iş akışı, otomatik senkronizasyon protokolü, iş kayıt defteri ve faz planı. Teknik kararlar
→ [`../architecture/`](../architecture/), iş kuralları → [`../domain/`](../domain/).

> [!note] Obsidian
> Doküman yazım standardı, frontmatter alanları, tag yapısı ve yeni not kontrol listesi
> [`06-obsidian-dokumantasyon-kurallari.md`](06-obsidian-dokumantasyon-kurallari.md) içindedir.

## İçindekiler

| #   | Dosya                                                                              | Konu                                                                         |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 00  | [`00-calisma-baslangic-rehberi.md`](00-calisma-baslangic-rehberi.md)               | Her yeni iş/oturum için genel başlangıç dosyası ve kaynak önceliği           |
| 01  | [`01-linear-is-akisi.md`](01-linear-is-akisi.md)                                   | Linear issue lifecycle: pre-dev / post-dev, belge senkronizasyonu            |
| 02  | [`02-mvp-faz-plani.md`](02-mvp-faz-plani.md)                                       | MVP faz planı (Faz 0–8), her fazın çıktısı, mevcut durum                     |
| 03  | [`03-faz-0-devir-notu.md`](03-faz-0-devir-notu.md)                                 | Faz 0 kapanış/handoff notu                                                   |
| 04  | [`04-otomatik-is-akisi-protokolu.md`](04-otomatik-is-akisi-protokolu.md)           | Linear MCP ↔ docs otomatik iş akışı ve durum senkronizasyon protokolü        |
| 05  | [`05-is-kayit-defteri.md`](05-is-kayit-defteri.md)                                 | Linear'ın repo içindeki takip aynası: Todo / In Progress / Review / Done     |
| 06  | [`06-obsidian-dokumantasyon-kurallari.md`](06-obsidian-dokumantasyon-kurallari.md) | Obsidian kasası için Markdown frontmatter, tag, link ve yeni belge kuralları |
| 07  | [`07-faz-13-raporlama-plani.md`](07-faz-13-raporlama-plani.md)                     | Faz 13 raporlama epic'in alt iş zinciri (13A-13T, 20 issue: DEM-257..276), bağımlılıklar, paralelleşme, tahmin (38g/1 dev), quality gate, Linear senkron disiplini |
| 08  | [`08-faz-14-klasik-pdf-plani.md`](08-faz-14-klasik-pdf-plani.md)                   | Faz 14 klasik pano PDF epic'inin alt iş zinciri (14A-14G, 7 issue: DEM-291..297), 12 karar kaydı (tamamlandı tanımı / acil kaldırma / 2. sayfa kaldırma / Roboto CDN / GET endpoint / Faz 13 permission reuse / yorum clamp / checklist indented / filename pattern / mobil parite / locale-aware i18n / boş pano davranışı), 4 sayfa kanonik içerik (Kapak/Üyeler/Liste sayfaları/Yorumlar özeti), eski Pusula v2.2 → v2 domain mapping, bağımlılıklar (Faz 2.7 + 13F + 13S), tahmin 3-4g, quality gate. Teknik mimari → [`../architecture/16-raporlama-mimarisi.md`](../architecture/16-raporlama-mimarisi.md) §16.18; domain → [`../domain/09-raporlama-kurallari.md`](../domain/09-raporlama-kurallari.md) §9.15. |
