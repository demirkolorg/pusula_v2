---
description: Kontrol odası — bu tab'ın devir/handoff notu (değişen docs, açık kararlar, bekleyen catch-up, tab durumu)
---
Bu bir **kontrol odası** tab işidir (bkz. `docs/kontrol-odasi/README.md`). Bu konuşma bir kod yazma tab'ıysa, devir notunu o tab'ın işine göre uyarla; kontrol odası tab'ıysa aşağıyı uygula.

Görev: **devir notu** üret.

1. Çalıştır: `git status --short` ve `git log --oneline -10`.
2. Şunları içeren kısa bir devir notu yaz:
   - **Aktif iş & durum:** ne yapılıyordu, nerede kalındı.
   - **Değişen `docs/` dosyaları:** hangileri, ne değişti, commit edildi mi?
   - **Alınan kararlar / bekleyen kararlar.**
   - **Bekleyen catch-up / açık işler** (ör. iş kayıt defteri senkronu).
   - **Aktif tab haritası** (kontrol odası §5'ten, gerçekle güncellenmiş).
   - **Sıradaki adım(lar).**
3. Format: `docs/process/03-faz-0-devir-notu.md`'ye yakın. Kullanıcı isterse `~/.claude/projects/<proje>/wip-state.md`'ye de yaz.

@docs/kontrol-odasi/README.md
