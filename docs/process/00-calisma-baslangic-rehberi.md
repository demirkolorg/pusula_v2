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
type: 'process'
axis: 'process'
status: 'active'
parent: '[[docs/process/README|Süreç]]'
related:
  - '[[docs/process/06-obsidian-dokumantasyon-kurallari|Obsidian Dokümantasyon Kuralları]]'
updated: 2026-06-01
---

# 00 — Çalışma Başlangıç Rehberi

> Eksen: **süreç**. Bu dosya, bundan sonraki her yeni işte veya yeni oturumda
> baz alınacak genel başlangıç dosyasıdır.

## Amaç

- Yeni işe başlarken hangi dokümantasyon kaynaklarına bakılacağını netleştirmek.
- Koddan önce `docs/` güncellemesi disiplinini hatırlatmak.

## Kanonik kaynak sırası

| Sıra | Kaynak                                                                                                      | Ne için kullanılır                                |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | [`CLAUDE.md`](../../CLAUDE.md) + [`.claude/skills/kontrol/SKILL.md`](../../.claude/skills/kontrol/SKILL.md) | Genel çalışma sözleşmesi ve teknik kurallar       |
| 2    | Bu dosya                                                                                                    | Yeni işin başlangıç akışı                         |
| 3    | İlgili `docs/architecture/*` ve `docs/domain/*`                                                             | Koddan önce güncellenecek teknik/domain kararları |
| 4    | [`06-obsidian-dokumantasyon-kurallari.md`](06-obsidian-dokumantasyon-kurallari.md)                          | Yeni veya değişen Markdown dosyaları için standart |

## Yeni işe başlama akışı

1. **İşi netleştir.** Kullanıcının istediği işi anla; belirsizse soru sor.
2. **Etkilenen belgeleri belirle.**
   - Teknik karar/pattern değişiyorsa `docs/architecture/*`.
   - Ürün, yetki, bildirim, sıralama veya domain davranışı değişiyorsa `docs/domain/*`.
   - Dokümantasyon düzeni değişiyorsa `docs/process/*`.
3. **Koddan önce docs güncelle.** Yeni veya değişen Markdown dosyalarında
   [`06-obsidian-dokumantasyon-kurallari.md`](06-obsidian-dokumantasyon-kurallari.md) standardını uygula.
4. **Kodu yaz, doğrula.** Test/lint/type-check çalıştır; sonucu kullanıcıya bildir.
5. **Commit + git log.** Anlamlı commit mesajı yaz; iş takibinin tek operasyonel kaynağı `git log`.

## Çelişki

Gelen istek mevcut belgeyle (`docs/`, `.claude/skills/kontrol/SKILL.md`, kök `CLAUDE.md`)
çelişiyorsa, işe başlamadan kullanıcıya bildir ve
"Belgeyi mi güncelleyelim, koda mı sadık kalalım?" diye netleştir.

## İş takibi yok

Linear, issue tracker ve repo içi iş kayıt defteri **tutulmuyor** (2026-06-01 kararı).
İş öncelikleri kullanıcı ile doğrudan konuşulur; commit mesajı + `git log` operasyonel
takibin kaynağıdır.
