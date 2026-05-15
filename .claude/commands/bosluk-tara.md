---
description: Kontrol odası — ürün boşluğu / paralel-iş taraması (eksik/beklenen özellikler + şimdi yapılabilir işler → öneri → onayla yeni issue + docs)
---

Bu bir **kontrol odası** tab işidir (bkz. `docs/kontrol-odasi/README.md` §2.5 — bu tab kod yazmaz; yalnızca `docs/` + Linear + analiz). Bu konuşma bir kod yazma tab'ıysa, "bu kontrol odası işi, doğru tab'ta mıyız?" diye sor; teyit alınca devam et.

Görev: **ürün boşluğu / fırsat taraması**.

1. Bağlam topla: `docs/process/02-mvp-faz-plani.md` (fazlar + alt işler), `docs/process/05-is-kayit-defteri.md`, Linear MCP (Pusula projesi, tüm state'ler), `docs/domain/*` (ürün modeli + kurallar), `docs/architecture/*` (özellikle `05-board-mekanigi.md`, `08-web-ve-mobil.md`), `git log --oneline -15`. Gerekirse implement edilmiş ekranları/akışları gözden geçir (bu tab kod yazmaz ama okuyabilir).
2. Karşılaştır: Pusula'nın hedefi (Trello alternatifi — web/mobil, akıcı drag-drop, optimistic UI, bildirim). Trello / Linear / Notion / Asana gibi olgun ürünlerin tipik akışlarını referans al. Şunları ara:
   - Mevcutta olmayan ama **olması beklenen** özellik / UX akışı (örn. board başına davet linki, kart detay görünümü, etiketler/checklist, due-date hatırlatması, board içi/global arama, klavye kısayolları, board favorileri/son görülenler, kullanıcı profili/ayarları, board kapağı/arka plan, board şablonları, activity feed UI…).
   - Faz planında **hiç yer almayan** ama gerekli bir parça.
   - Mevcut geliştirme sürerken **paralel yapılabilecek** (bağımsız, blocked olmayan, başka tab'larla çakışmayan) iş.
3. Çıktı: **öneri listesi** — her öğe: `[öncelik]` + ne, neden gerekli (Trello/Linear vb. referansıyla), ait/önerilen faz, paralel mi (şimdi yapılabilir mi), kaba bağımlılık. Zaten planlı/var olanları "kapsamda" diye işaretle — gürültü yapma. Boşluk yoksa "şu an net bir boşluk yok" de.
4. Kullanıcıya **`AskUserQuestion`** ile sun (hangi öneriler issue'ya, hangi faza, paralel mi). Onaylananlar için: Linear'da yeni issue(lar) oluştur (proje Pusula, uygun milestone, varsa parent epic altına, `blockedBy` zinciri, assignee proje sahibi, state `Todo`/`Sonraki Faz`); `docs/process/02-mvp-faz-plani.md`'ye ilgili faz alt işleri satırı + gerekirse `docs/domain/*`/`docs/architecture/*`'a not (önce-belge ilgili işin pre-dev'inde); `05-is-kayit-defteri.md` satırı bir sonraki `/linear-senkron`'da. **Kod yazma** — sadece öneri + issue + docs.

@docs/kontrol-odasi/README.md
