---
description: Kontrol odası — panorama raporu (faz durumu, aktif tab'lar, sıradaki işler, riskler, önerilen adımlar)
---

Bu bir **kontrol odası** tab işidir (bkz. `docs/kontrol-odasi/README.md` — bu tab kod yazmaz; yalnızca `docs/` + Linear + analiz). Bu konuşma bir kod yazma tab'ıysa, "bu kontrol odası işi, doğru tab'ta mıyız?" diye sor; teyit alınca devam et.

Görev: **panorama** raporu üret.

1. Oku: `docs/process/02-mvp-faz-plani.md`, `docs/process/05-is-kayit-defteri.md`, `docs/kontrol-odasi/README.md` §5 (paralel tab haritası).
2. Çalıştır: `git log --oneline -15` ve `git status --short`.
3. Linear MCP ile Pusula projesindeki issue'ları çek (tüm state'ler: Backlog / Sonraki Faz / Todo / In Progress / Done).
4. Şu başlıklarda **kısa, taranabilir** bir rapor ver (kod dump'ı yok):
   - Aktif faz + kabaca % tamamlanma; `Sonraki Faz`'da bekleyen işler
   - Aktif tab'lar ve gerçek durumları (kontrol odası §5 ↔ git/Linear ile karşılaştırmalı; tutarsızlık varsa belirt)
   - Açık blocker / risk / bekleyen kararlar
   - Önerilen sıradaki adımlar (sıraya göre)
5. Kontrol odası §5 tablosu güncel değilse raporun sonunda "§5 güncellensin mi?" diye sor.

@docs/kontrol-odasi/README.md
