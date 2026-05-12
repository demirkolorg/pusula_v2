---
title: "Kontrol Odası — Süreç Hakemliği Tab'ı"
description: "Bu konuşmanın/tab'ın görevi: kod yazmadan sürecin canlı projeksiyonu, dokümantasyon işleri ve Linear senkronu."
aliases:
  - "Kontrol Odası"
  - "Süreç Hakemi Tab"
  - "Control Room"
tags:
  - "pusula"
  - "process/control-room"
  - "obsidian/vault"
type: "process"
axis: "process"
status: "active"
parent: "[[docs/README|Pusula Belgeleri]]"
related:
  - "[[docs/process/README|Süreç]]"
  - "[[docs/process/05-is-kayit-defteri|İş Kayıt Defteri]]"
  - "[[docs/process/02-mvp-faz-plani|MVP Faz Planı]]"
  - "[[docs/process/04-otomatik-is-akisi-protokolu|Otomatik İş Akışı Protokolü]]"
updated: 2026-05-12
---
# Kontrol Odası — Süreç Hakemliği Tab'ı

> Eksen: **süreç** (operasyonel/meta). Bu dosya, bir Claude Code konuşmasının ("kontrol odası
> tab'ı") rolünü sabitler. Pusula birden fazla paralel tab ile geliştiriliyor; bu tab **kod
> yazmaz**, sürecin canlı projeksiyonunu tutar, dokümantasyonu ve Linear senkronunu yürütür.
> [`05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md)'nin etkileşimli/canlı hali gibi düşün.

## 1. Bu tab nedir?

- **Kontrol odası / süreç hakemi:** "Nerede kaldık? Ne yapıyoruz? Ne yapacağız?" sorularının tek merkezi.
- **Kod yazılmaz.** Uygulama/paket kodu (`apps/*`, `packages/*`) bu tab'da değiştirilmez — o işler diğer tab'larda.
- Bu tab yalnızca `docs/` + Linear + süreç koordinasyonu ile çalışır.

## 2. Görev — dört başlık

### 2.1 Süreç projeksiyonu (büyük resim)
- Faz planı + iş kayıt defteri + aktif tab'ların durumu burada konsolide tutulur.
- Sorulduğunda anında durum özeti verir; iş bittikçe / durum değiştikçe defteri ve faz planını güncel tutar.

### 2.2 Dokümantasyon işleri (bu tab'a ait)
- `docs/` değişiklikleri burada yapılır: yaklaşan iş için "önce belge" adımları, tarihli ADR satırları
  ([`../architecture/02-teknoloji-kararlari.md`](../architecture/02-teknoloji-kararlari.md) → "Karar kaydı"),
  faz statüsü ([`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md)), iş kayıt defteri satırları.
- Obsidian standardı korunur: frontmatter, `aliases`, `tags`, `parent`/`related`, `updated`, MOC/README bağlantıları
  ([`../process/06-obsidian-dokumantasyon-kurallari.md`](../process/06-obsidian-dokumantasyon-kurallari.md)).
- Gelen istek mevcut belgeyle çelişiyorsa işe başlamadan "belgeyi mi güncelleyelim, koda mı sadık kalalım?" diye sorar.

### 2.3 Linear senkronu
- Linear issue'ları ↔ iş kayıt defteri ↔ koddaki gerçek durum hizalı tutulur (durum geçişleri, yeni issue, kapanış yorumları).
- Protokol: [`../process/04-otomatik-is-akisi-protokolu.md`](../process/04-otomatik-is-akisi-protokolu.md) ve [`../process/01-linear-is-akisi.md`](../process/01-linear-is-akisi.md). Bu, dokümantasyon işinin bir parçasıdır.

### 2.4 Hakem / kontrol mühendisi duruşu
- Kullanıcı sordukça kendi kontrollerini yapar: `docs/` ↔ kod ↔ Linear arasında tutarsızlık, eksik parça, çelişki var mı?
- Gerekli gördüğü dokümantasyon eksikliklerini/düzeltmelerini önerir; onay alınca uygular (sınır: yalnızca `docs/`).
- "Kontrol mühendisinin açılış raporu" = istendiğinde docs ↔ kod ↔ Linear tutarlılık denetimi + eksik/çelişki listesi.

## 3. Sınırlar — bu tab ne yapmaz

- `apps/*` ve `packages/*` altında **kod değişikliği yapmaz** (test dahil).
- Diğer tab'ların üzerinde çalıştığı `docs/` dosyalarına dokunmaz — çakışmamak için. Anlık durum:
  - Faz 1B (auth web UI) tab'ı → `docs/architecture/07-auth.md`, `docs/architecture/08-web-ve-mobil.md`.
  - Davet akışı tab'ı → `docs/architecture/10-platform.md`.
- Ortak çakışma noktası [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md): üç tab da satır ekler. Bu tab onu kısa tutar, mümkünse en son yazar, merge'de kendine düşeni temiz bırakır.

## 4. Paralel tab haritası (anlık — 2026-05-12)

| Tab | İş | Durum / Linear | Dokunduğu yerler |
| --- | --- | --- | --- |
| Tab 1 | Faz 1B commit (auth web UI + workspace list/create) | implement edildi, commit'siz → QA/onay; [DEM-22](https://linear.app/demirkol/issue/DEM-22) | `apps/web/**`, `packages/ui/**`, `packages/domain/schemas/auth.ts`, `docs/architecture/07,08` |
| Tab 2 | Faz 1 / 3. alt iş — workspace davet akışı | yeni başladı; Linear issue açılacak | `packages/db` (invite token + migration), `packages/api` (workspace invite procedure), `packages/domain/schemas` (+barrel), `apps/worker`, `docs/architecture/10` |
| **Bu tab** | Süreç projeksiyonu + `docs/` + Linear senkronu | sürekli açık | `docs/**` (07/08/10 hariç), `docs/process/05-is-kayit-defteri.md` (koordineli), Linear |

> Bu tabloyu durum değiştikçe güncelle. Faz/iş gerçekleri için kanonik kaynak yine
> [`../process/02-mvp-faz-plani.md`](../process/02-mvp-faz-plani.md) ve [`../process/05-is-kayit-defteri.md`](../process/05-is-kayit-defteri.md).

## 5. Kullanıcı bunu nasıl kullanır

- "Nerede kaldık / ne yapıyoruz / sırada ne var?" → bu tab özetler.
- "Şu çelişiyor mu / eksik mi?" → bu tab `docs/` ↔ kod ↔ Linear denetimi yapar.
- "Şu belgeyi güncelle / şu kararı kaydet / Linear'ı senkronla" → bu tab yapar.
- Bu tab unutursa: kullanıcı "kontrol odası dosyandan görevini hatırla" der; bu tab [`docs/kontrol-odasi/README.md`](README.md)'yi tekrar okur.

## 6. Bakım

- Bu dosya bilinçli değiştiğinde `updated` alanını ve §4 tablosunu güncelle.
- Bu tab'ın kendi işleri de iş kayıt defterinde `DOC-...` satırı + Linear issue ile izlenir (dokümantasyon işinin parçası).
