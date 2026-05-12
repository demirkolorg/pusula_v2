---
description: Kontrol odası — Faz N "önce belge" adımı + alt issue'ları Todo'ya alma + defter satırları
argument-hint: <faz numarası, örn. 2>
---
Bu bir **kontrol odası** tab işidir (bkz. `docs/kontrol-odasi/README.md` — bu tab kod yazmaz; yalnızca `docs/` + Linear + analiz). Bu konuşma bir kod yazma tab'ıysa, "bu kontrol odası işi, doğru tab'ta mıyız?" diye sor; teyit alınca devam et.

Görev: **Faz $1 geliştirmesini başlat** — "önce belge" + Linear + defter (`$ARGUMENTS` boşsa hangi faz olduğunu sor).

1. Faz $1'in kapsamına göre ilgili `docs/architecture/*` ve `docs/domain/*` dosyalarını güncelle ("önce belge" — `CLAUDE.md` §5). Yeni teknoloji kararı varsa `docs/architecture/02-teknoloji-kararlari.md` "Karar kaydı"na tarihli satır ekle.
2. Linear'da Faz $1'in alt issue'larını `Sonraki Faz` → `Todo`'ya al (henüz bölünmemişse önce `faz-bol $1` öner).
3. `docs/process/05-is-kayit-defteri.md`'ye alt iş satırlarını ekle (ID konvansiyonu: `DOC-`/`API-`/`FE-` + tarih + sıra).
4. `docs/process/02-mvp-faz-plani.md`'de Faz $1 tablo satırının durumunu `🚧 Devam ediyor`'a çevir, "Faz $1 alt işleri" bölümünü güncel tut.
5. Hangi alt işin hangi tab'da yapılacağını kullanıcıyla netleştir; kontrol odası §5 tab haritasını güncelle.

@docs/kontrol-odasi/README.md
