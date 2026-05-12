---
title: "04 — Otomatik İş Akışı Protokolü"
description: "Linear MCP, docs ve iş kayıt defteri senkronizasyon protokolü."
aliases:
  - "Otomatik İş Akışı Protokolü"
  - "Workflow Sync Protocol"
tags:
  - "pusula"
  - "process/protocol"
  - "linear"
type: "protocol"
axis: "process"
status: "active"
parent: "[[docs/process/README|Süreç]]"
updated: 2026-05-12
---
# 04 — Otomatik İş Akışı Protokolü

> Eksen: **süreç**. Amaç: Claude Code geliştirme yaparken Linear MCP ve `docs/` aynı iş
> durumunu taşısın; kullanıcı süreci iki taraftan da izleyebilsin.

## Kaynaklar ve roller

| Kaynak | Rol |
| --- | --- |
| `docs/process/00-calisma-baslangic-rehberi.md` | Her yeni iş/oturum için kanonik başlangıç dosyası |
| Linear issue | Operasyonel iş kaydı: durum, sahip, yorumlar, kabul kriterleri, bağlantılı işler |
| `docs/process/05-is-kayit-defteri.md` | Linear'ın repo içindeki takip aynası: iş listesi, durum, son senkron, etkilenen dosyalar |
| `docs/process/02-mvp-faz-plani.md` | Faz seviyesinde ilerleme kaydı |
| `docs/process/06-obsidian-dokumantasyon-kurallari.md` | Markdown frontmatter, tag, link ve MOC standardı |
| `docs/architecture/*` | Teknik karar ve tasarım kaynağı |
| `docs/domain/*` | Ürün, yetki, bildirim, sıralama ve domain kuralı kaynağı |

Teknik/domain kararlarında kaynak `docs/`tur. İş durumunda Linear operasyonel kaynak, iş kayıt
defteri ise repo içi aynadır. Her görevde ikisi birlikte güncellenir.

## Durum sözlüğü

`docs/process/05-is-kayit-defteri.md` içindeki durumlar aşağıdaki setten seçilir. Demirkol takımının
Linear workflow state'leri sütundaki gibidir; takımda ayrı state olmayan durumlar (`Review`, `Blocked`)
için "en yakın karşılık + notta belirt" kuralı uygulanır.

| Docs durumu | Linear state (Demirkol takımı) | Anlam |
| --- | --- | --- |
| `Backlog` | `Backlog` | Uzak; henüz sıraya alınmadı |
| `Sonraki Faz` | `Sonraki Faz` (Unstarted kategorisi, `Backlog` ↔ `Todo` arası) | Önden bölünmüş ama henüz başlamamış "bir sonraki faz"ın işi; faz başlayınca `Todo`'ya alınır |
| `Todo` | `Todo` | Mevcut fazın bekleyen işi; geliştirme başlamadı |
| `In Progress` | `In Progress` | Aktif çalışma başladı |
| `Review` | (ayrı state yok →) `In Progress` + notta "kullanıcı onayı bekliyor" | Kod/doküman hazır, kullanıcı onayı veya inceleme bekliyor |
| `Blocked` | (ayrı state yok →) `Todo`/`Backlog` + `blockedBy` ilişkisi + notta belirt | Dış karar, erişim, bağımlılık veya çelişki bekleniyor |
| `Done` | `Done` | Kabul edildi, kapanış yorumu ve docs güncellemesi tamam |
| `Canceled` | `Canceled` (gerekirse `Duplicate`) | Artık yapılmayacak |

> İhtiyaç olursa Linear takımına `Review` (completed-öncesi) state'i eklenebilir — şu an `Sonraki Faz` gibi bir UI işi olarak ertelenmiştir. Yeni Linear workflow state'leri yalnızca Linear arayüzünden eklenir (MCP'de tool yok); eklenince bu tabloyu güncelle.

## Her görevde zorunlu akış

1. **Giriş kontrolü**
   - `docs/process/00-calisma-baslangic-rehberi.md`, `CLAUDE.md`, `.claude/skills/kontrol/SKILL.md` ve ilgili `docs/` dosyalarını oku.
   - Doküman değişecekse `docs/process/06-obsidian-dokumantasyon-kurallari.md` standardını da kontrol et.
   - `docs/process/05-is-kayit-defteri.md` ve Linear içinde aynı işi temsil eden mevcut kayıt var mı kontrol et.
   - Çelişki varsa kodlamaya başlamadan kullanıcıya bildir.

2. **İş kaydı oluştur veya eşle**
   - Linear MCP erişilebilir durumdaysa mevcut issue'yu kullan veya yeni issue oluştur.
   - Issue açıklamasına hedef, teknik gereksinimler, kabul kriterleri, etkilenen katmanlar ve
     etkilenen `docs/` dosyalarını yaz.
   - Durumu `In Progress` yap ve kullanıcı aksini istemediyse kullanıcıya ata.
   - Aynı işi `docs/process/05-is-kayit-defteri.md` içinde tek satır olarak kaydet.
   - Linear MCP erişilebilir değilse kayıt defterinde `Linear` alanına `MCP bekliyor` yaz, işi
     `Blocked` yapma; ama final yanıtta Linear senkronunun beklediğini açıkça belirt.

3. **Koddan önce belge**
   - Yeni teknik karar, domain kuralı, tRPC procedure, Drizzle şema değişikliği veya süreç kuralı
     varsa önce doğru `docs/` dosyasını güncelle.
   - Yeni veya değişen Markdown dosyasında frontmatter, `aliases`, `tags`, `parent`/`related`, `updated`
     ve ilgili MOC/README bağlantılarını aynı turda güncelle.
   - Teknoloji kararı değiştiyse `docs/architecture/02-teknoloji-kararlari.md` karar kaydına tarihli
     satır ekle.
   - Faz çıktısı veya faz durumu değiştiyse `docs/process/02-mvp-faz-plani.md`yi güncelle.

4. **Geliştirme sırasında senkron**
   - Durum değişirse aynı çalışma turunda hem Linear hem iş kayıt defteri güncellenir.
   - Yeni alt iş çıkarsa küçükse mevcut issue checklist'ine, bağımsızsa yeni Linear issue + yeni
     kayıt defteri satırına taşınır.
   - Her anlamlı yorumda Linear'a şu bilgiler yazılır: özet, değişen dosyalar, test/verification
     durumu, açık risk veya blokaj.

5. **Kapanış**
   - Kod ve docs değişiklikleri tamamlanınca test/verification çalıştır.
   - Linear issue'ya kapanış yorumu ekle: yapılanlar, güncellenen docs, test sonucu, kalan riskler.
   - Kullanıcı onayı gerekiyorsa durum `Review`; onaylandıysa veya görev açıkça tamamlanabilir
     nitelikteyse durum `Done`.
   - `docs/process/05-is-kayit-defteri.md` aynı duruma çekilir ve `Son senkron` tarihi güncellenir.

## Çift yönlü senkron kuralı

Her yeni çalışma turunun başında Linear ve iş kayıt defteri karşılaştırılır.

- Linear daha güncelse iş kayıt defteri Linear'a göre güncellenir.
- İş kayıt defteri daha güncelse Linear issue açıklaması/yorumu/durumu güncellenir.
- Hangisinin güncel olduğu anlaşılamıyorsa kullanıcıdan kısa karar istenir.
- Aynı iş için iki Linear issue veya iki docs satırı oluştuysa yeni iş yapılmadan önce tek kayda
  indirgenir.

## Issue açıklama şablonu

```txt
## Hedef
<bir cümle>

## Teknik gereksinimler
- ...

## Etkilenen katmanlar
- apps/... / packages/... / docs/...

## Etkilenen belgeler
- docs/architecture/... veya docs/domain/... veya docs/process/...

## Kabul kriterleri
- [ ] ...
- [ ] Test/verification tamamlandı

## Docs senkron
- İş kayıt defteri: docs/process/05-is-kayit-defteri.md
- Obsidian standardı: frontmatter / tag / MOC güncel
- Son senkron: YYYY-MM-DD
```

## Kapanış yorumu şablonu

```txt
## Özet
- ...

## Güncellenen docs
- docs/...

## Test / verification
- ...

## Kalan risk / takip işi
- Yok / ...
```
