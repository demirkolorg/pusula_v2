# 01 — Linear İş Akışı (Otonom Yönetim)

> Eksen: **süreç**. Her özellik / refactor / bug fix isteği için uygulanır.
> Ayrıntılı senkron protokolü: [`04-otomatik-is-akisi-protokolu.md`](04-otomatik-is-akisi-protokolu.md).
> Repo içi takip aynası: [`05-is-kayit-defteri.md`](05-is-kayit-defteri.md).

## Pre-Dev — işi kaydet

Geliştirmeye **başlamadan önce** Linear MCP ile bir issue oluştur:

- **Başlık:** kısa, net (örn. "Board: liste reorder mutation").
- **Açıklama:** teknik gereksinimler; hangi `docs/` dosyalarının etkilendiği (örn. "`docs/architecture/05-board-mekanigi.md` server move akışı + `docs/domain/03-siralama-kurallari.md` güncellenecek"); hangi katman(lar) (`packages/api`, `packages/db`, `apps/web` ...).
- **Durum:** "In Progress".
- **Atama:** bana ata.
- **Docs kaydı:** aynı işi `docs/process/05-is-kayit-defteri.md` içinde tek satır olarak eşle.

Eğer istek mevcut belge ile **çelişiyorsa**, issue'yu açmadan önce çelişkiyi bildir ve "Belgeyi mi
güncelleyelim, koda mı sadık kalalım?" diye sor.

## Geliştirme sırasında

- **Önce belge:** İlgili `docs/` dosyasını (doğru eksen!) güncelle, sonra kodu yaz. Teknoloji kararı değiştiyse `docs/architecture/02-teknoloji-kararlari.md` "Karar kaydı"na tarihli satır ekle.
- Kök `CLAUDE.md` ve `.claude/skills/kontrol/SKILL.md` ince kalır — yalnızca özet/pointer; ayrıntı `docs/`'a.
- Durum değişimlerini aynı turda Linear issue ve iş kayıt defterine birlikte yansıt.

## Post-Dev — kapanış

Kodlama bitip **onay alınca**:

- İlgili issue'yu bul.
- Yapılan değişikliklerin özetini + güncellenen `docs/` dosyalarını **yorum** olarak ekle.
- Kullanıcı onayı bekleniyorsa durumu **"Review"**, onaylandıysa **"Done"** yap.
- `docs/process/05-is-kayit-defteri.md` satırını aynı duruma çek.
- Faz statüsü değiştiyse `docs/process/02-mvp-faz-plani.md`'yi güncelle.

## Issue açıklama şablonu (öneri)

```txt
## Hedef
<bir cümle>

## Teknik gereksinimler
- ...

## Etkilenen katmanlar
- packages/... , apps/...

## Etkilenen belgeler
- docs/architecture/... ve/veya docs/domain/...

## Kabul kriterleri
- [ ] ...
- [ ] testler (bkz. docs/architecture/10-platform.md §10.1)
```
