---
title: '00 — Çalışma Başlangıç Rehberi'
description: 'Her yeni Pusula işi veya oturumunda baz alınacak genel başlangıç dosyası.'
aliases:
  - 'Çalışma Başlangıç Rehberi'
  - 'Yeni İş Başlangıcı'
  - 'Session Start Guide'
tags:
  - 'pusula'
  - 'process/start'
  - 'linear'
type: 'process'
axis: 'process'
status: 'active'
parent: '[[docs/process/README|Süreç]]'
related:
  - '[[docs/process/02-mvp-faz-plani|MVP Faz Planı]]'
  - '[[docs/process/04-otomatik-is-akisi-protokolu|Otomatik İş Akışı Protokolü]]'
  - '[[docs/process/05-is-kayit-defteri|İş Kayıt Defteri]]'
  - '[[docs/process/06-obsidian-dokumantasyon-kurallari|Obsidian Dokümantasyon Kuralları]]'
updated: 2026-05-12
---

# 00 — Çalışma Başlangıç Rehberi

> Eksen: **süreç**. Bu dosya, bundan sonraki her yeni işte veya yeni oturumda
> baz alınacak genel başlangıç dosyasıdır. Faz 0 devir notu tarihsel bağlamdır;
> varsayılan başlangıç kaynağı bu dosyadır.

## Amaç

- Yeni işe başlarken hangi durum kaynağına bakılacağını netleştirmek.
- Linear MCP, iş kayıt defteri ve `docs/` senkronunu işe başlamadan kurmak.
- Fazlara bağlı geçici devir notları yerine kalıcı bir başlangıç protokolü sağlamak.

## Kanonik kaynak sırası

| Sıra | Kaynak                                                                                                      | Ne için kullanılır                                    |
| ---- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1    | [`CLAUDE.md`](../../CLAUDE.md) + [`.claude/skills/kontrol/SKILL.md`](../../.claude/skills/kontrol/SKILL.md) | Genel çalışma sözleşmesi ve teknik kurallar           |
| 2    | Bu dosya                                                                                                    | Yeni işin başlangıç akışı                             |
| 3    | [`05-is-kayit-defteri.md`](05-is-kayit-defteri.md) + Linear                                                 | Aktif/Todo/Review iş durumları                        |
| 4    | [`02-mvp-faz-plani.md`](02-mvp-faz-plani.md)                                                                | Faz seviyesi mevcut durum ve sıradaki ürün işi        |
| 5    | [`04-otomatik-is-akisi-protokolu.md`](04-otomatik-is-akisi-protokolu.md)                                    | Linear ↔ docs senkron kuralları                       |
| 6    | İlgili `docs/architecture/*` ve `docs/domain/*`                                                             | Koddan önce güncellenecek teknik/domain kararları     |
| 7    | [`03-faz-0-devir-notu.md`](03-faz-0-devir-notu.md)                                                          | Yalnızca Faz 0 kurulum/handoff ayrıntısı gerektiğinde |

## Yeni işe başlama akışı

1. Kullanıcının istediği işi netleştir.
   - Açık bir iş verildiyse onu baz al.
   - Açık iş yoksa önce `05-is-kayit-defteri.md` içindeki `In Progress` / `Review` kayıtlarına bak.
   - Aktif iş yoksa `02-mvp-faz-plani.md` içindeki sıradaki faz işini seç.

2. Linear ve iş kayıt defterini eşle.
   - Linear MCP erişilebiliyorsa mevcut issue'yu bul veya yeni issue oluştur.
   - `05-is-kayit-defteri.md` içinde aynı iş için tek satır olduğundan emin ol.
   - Linear MCP erişilemiyorsa `Linear` alanını `MCP bekliyor` yap ve final yanıtta belirt.

3. Etkilenen belgeleri belirle.
   - Teknik karar/pattern değişiyorsa `docs/architecture/*`.
   - Ürün, yetki, bildirim, sıralama veya domain davranışı değişiyorsa `docs/domain/*`.
   - İş akışı/faz/dokümantasyon düzeni değişiyorsa `docs/process/*`.

4. Koddan önce docs güncelle.
   - Yeni veya değişen Markdown dosyalarında [`06-obsidian-dokumantasyon-kurallari.md`](06-obsidian-dokumantasyon-kurallari.md) standardını uygula.
   - Faz durumu değişiyorsa `02-mvp-faz-plani.md` güncellenir.
   - İş durumu değişiyorsa Linear ve `05-is-kayit-defteri.md` aynı turda güncellenir.

5. Kapanışta senkronu tamamla.
   - Test/verification sonucunu kaydet.
   - Linear issue'ya özet, güncellenen docs ve kalan risk yorumunu ekle.
   - `05-is-kayit-defteri.md` durumunu `Review` veya `Done` yap.

## Durum seçme kuralı

Öncelik sırası:

1. Kullanıcının açıkça istediği iş.
2. Linear veya iş kayıt defterinde `In Progress` olan iş.
3. `Review` durumundaki ve kullanıcı geri bildirimi bekleyen iş.
4. `02-mvp-faz-plani.md` içindeki sıradaki `Todo` / sıradaki faz işi.
5. Faz veya kurulum bağlamı gerekiyorsa ilgili devir/handoff notu.

Çelişki varsa kodlamaya başlamadan kullanıcıya kısa karar sorulur.

## Kullanıcı talimatı şablonu

Kısa kullanım:

```txt
/kontrol
docs/process/00-calisma-baslangic-rehberi.md dosyasını baz alarak yeni işe başla.
Linear ve docs/process/05-is-kayit-defteri.md senkronunu kur, koddan önce ilgili docs dosyalarını güncelle.
```

Sıradaki faz işine başlatmak için:

```txt
/kontrol
docs/process/00-calisma-baslangic-rehberi.md dosyasını baz al.
Aktif iş yoksa docs/process/02-mvp-faz-plani.md içindeki sıradaki faz işine başla.
Linear issue ile docs/process/05-is-kayit-defteri.md kaydını eşle ve iş boyunca senkron tut.
```

Belirli bir iş için:

```txt
/kontrol
docs/process/00-calisma-baslangic-rehberi.md protokolünü kullanarak <iş tanımı> işine başla.
Başlamadan Linear issue oluştur/eşle, docs/process/05-is-kayit-defteri.md kaydını aç/güncelle,
etkilenen docs dosyalarını koddan önce güncelle.
```
