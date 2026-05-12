---
description: Kontrol odası — docs ↔ kod ↔ Linear tutarlılık + Obsidian standardı taraması, bulgu listesi, onayla docs-only düzeltme
---
Bu bir **kontrol odası** tab işidir (bkz. `docs/kontrol-odasi/README.md` — bu tab kod yazmaz; yalnızca `docs/` + Linear + analiz). Bu konuşma bir kod yazma tab'ıysa, "bu kontrol odası işi, doğru tab'ta mıyız?" diye sor; teyit alınca devam et.

Görev: **dokümantasyon eksiklik + senkron kayması denetimi**.

1. Tara ve şunları kontrol et:
   - **3-yönlü tutarlılık:** Linear issue durumları ↔ `docs/process/05-is-kayit-defteri.md` satırları ↔ `docs/process/02-mvp-faz-plani.md` faz/alt-iş statüleri. Linear'da olup defterde olmayan / defterde olup Linear'da olmayan.
   - **"Önce belge" ihlali:** kodda var olan ama `docs/`'ta yer almayan procedure / şema / teknoloji kararı.
   - **Karar kaydı:** yeni teknoloji kararı `docs/architecture/02-teknoloji-kararlari.md` "Karar kaydı"na işlenmiş mi?
   - **Obsidian standardı:** yeni/değişen `.md`'lerde frontmatter / `aliases` / `tags` / `parent`-`related` / `updated` / MOC bağlantısı eksik mi? Yetim not var mı? (kural: `docs/process/06-obsidian-dokumantasyon-kurallari.md`)
   - **Pointer güncelliği:** kök `CLAUDE.md` ve `.claude/skills/kontrol/SKILL.md` ↔ `docs/` yapısı tutarlı mı?
   - **Eksen ihlali:** tasarım/domain/süreç içeriği yanlış klasörde mi?
2. Çıktı: **bulgu listesi** — her bulgu için `[severity: kritik/orta/düşük]` + ne, nerede (dosya:satır), fix önerisi. Bulgu yoksa "temiz" de.
3. Kullanıcı onayıyla **yalnızca `docs/`** düzeltmelerini ve Linear senkronunu uygula. Kod gerektiren bulguları flagle ve ilgili tab / Linear issue'ya not düşülmesini öner — bu tab kod yazmaz.

@docs/kontrol-odasi/README.md
