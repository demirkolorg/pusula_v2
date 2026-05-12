---
description: Kontrol odası — gelen istek/karar mevcut docs ile çelişiyor mu kontrol et, netleştir
argument-hint: <kontrol edilecek istek/karar>
---
Bu bir **kontrol odası** tab işidir (bkz. `docs/kontrol-odasi/README.md` — bu tab kod yazmaz; yalnızca `docs/` + Linear + analiz). Bu konuşma bir kod yazma tab'ıysa, yine bu kontrolü yapabilirsin (bu kural her tab için geçerli — `CLAUDE.md` §5).

Görev: **çelişki kontrolü** — şu istek/karar: "$ARGUMENTS" (`$ARGUMENTS` boşsa neyi kontrol edeceğini sor).

1. İlgili belgeleri tara: `docs/architecture/*` (özellikle `02-teknoloji-kararlari.md`), `docs/domain/*`, `docs/process/*`, kök `CLAUDE.md`, `.claude/skills/kontrol/SKILL.md`.
2. İstek bu belgelerdeki bir karar/invariant/kuralla çakışıyor mu belirle. Çakışma varsa: hangi belge, hangi madde, nasıl çelişiyor.
3. Çakışma varsa **işe başlamadan** kullanıcıya sor: "Belgeyi mi güncelleyelim, koda/karara mı sadık kalalım?" Karar alınınca:
   - Belge güncellenecekse: `docs/`'taki ilgili dosyayı (doğru eksen!) ve gerekirse `02-teknoloji-kararlari.md` "Karar kaydı"nı güncelle.
   - Karara sadık kalınacaksa: isteği reddet/uyarla, gerekçeyi belirt.
4. Çakışma yoksa "çelişki yok" de ve varsa ilgili belge referansını ver.

@docs/kontrol-odasi/README.md
