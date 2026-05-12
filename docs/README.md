# Pusula Belgeleri

Pusula'nın "source of truth" belgeleri **üç eksende** ayrılmıştır. Tasarım kararları,
iş kuralları ve süreç **aynı dosyada karıştırılmaz** — bu ayrım belgeyi yönetilebilir
tutar ve "neyi nerede ararım?" sorusunu netleştirir.

| Eksen | "Sorduğu soru" | Klasör | İçerik |
| --- | --- | --- | --- |
| **Tasarım / teknik** | _Nasıl inşa ediyoruz?_ | [`architecture/`](architecture/) | Stack, monorepo yapısı, pattern'ler (optimistic UI, outbox, transaction), altyapı, transport, deployment, observability, test |
| **İş / domain** | _Ürün ne yapıyor, kim ne yapabilir?_ | [`domain/`](domain/) | Domain modeli, invariant'lar, yetkilendirme kuralları, bildirim/sıralama/aktivite/arama/ek kuralları |
| **Süreç** | _Nasıl çalışıyoruz?_ | [`process/`](process/) | Linear iş akışı, otomatik senkron protokolü, iş kayıt defteri, MVP faz planı |

## Hangi belgeyi ne zaman açarım?

- "Hangi kütüphane / nasıl mount edilir / hangi pattern?" → `architecture/`
- "Bu rolü olan kullanıcı şunu yapabilir mi? / Hangi event hangi bildirimi üretir? / Kart taşınınca ne kontrol edilir?" → `domain/`
- "Issue nasıl açılır / iş hangi durumda / sırada hangi faz var?" → `process/`

## Diğer giriş noktaları

- Kök çalışma protokolü (Claude Code): [`../CLAUDE.md`](../CLAUDE.md)
- İmplementasyon sözleşmesi (Claude Code skill `kontrol`): [`../.claude/skills/kontrol/SKILL.md`](../.claude/skills/kontrol/SKILL.md)
- Proje README: [`../README.md`](../README.md)

## Kural ekleme rehberi

1. **Eksen seç:** Bu bir _nasıl_ kuralı mı (tasarım), _ne / kim_ kuralı mı (domain), yoksa _çalışma şekli_ mi (süreç)? Yanlış klasöre yazma.
2. **Doğru dosyaya yaz:** İlgili klasörün `README.md` indeksinden dosyayı bul; yoksa yeni dosya aç ve indekse ekle.
3. **Teknoloji kararı değiştiyse:** `architecture/02-teknoloji-kararlari.md`'deki "Karar kaydı"na tarihli satır ekle.
4. **İş durumu değiştiyse:** Linear issue ile `process/05-is-kayit-defteri.md` aynı durumu taşımalı; ayrıntı protokolü `process/04-otomatik-is-akisi-protokolu.md`.
5. **Özetleri güncelle:** Kök `CLAUDE.md` ve `.claude/skills/kontrol/SKILL.md` yalnızca özet + pointer içerir; oraya ayrıntı koyma, sadece pointer'ı güncel tut.

> Geçmiş: Bu yapı, eski tekil mimari/skill notlarının tasarım / iş kuralı / süreç
> eksenlerine bölünmesiyle oluştu (karar kaydı: `architecture/02-teknoloji-kararlari.md`, 2026-05-12).
