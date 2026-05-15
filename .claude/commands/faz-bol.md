---
description: Kontrol odası — Faz N epic'ini alt issue'lara böl (Linear + faz planı)
argument-hint: <faz numarası, örn. 3>
---

Bu bir **kontrol odası** tab işidir (bkz. `docs/kontrol-odasi/README.md` — bu tab kod yazmaz; yalnızca `docs/` + Linear + analiz). Bu konuşma bir kod yazma tab'ıysa, "bu kontrol odası işi, doğru tab'ta mıyız?" diye sor; teyit alınca devam et.

Görev: **Faz $1 epic'ini alt issue'lara böl** (`$ARGUMENTS` boşsa hangi fazı böleceğini sor).

1. Linear'da Faz $1 epic issue'sunu ve `Faz $1 — ...` milestone'unu bul; epic kapsamını ve ilgili `docs/architecture/*` + `docs/domain/*` dosyalarını oku.
2. Alt iş önerisi çıkar (genelde: "önce belge" adımı + backend alt işler + UI alt işi; varsa `move`/ileri-faz kapsamı dışı bırak). Kullanıcıya granülerlik (kaç issue) ve kapsam kararlarını sor.
3. Onaylanınca Linear'da alt issue'ları oluştur: `parentId` = epic, `milestone` = `Faz $1 — ...`, `blockedBy` zinciri, `assignee` = proje sahibi, `state` = `Sonraki Faz` (faz henüz başlamadıysa) ya da `Todo` (başladıysa), `priority` uygun.
4. `docs/process/02-mvp-faz-plani.md`'ye "Faz $1 alt işleri" bölümü ekle (Faz 1/Faz 2 bölümlerinin formatında); faz tablo satırını ve epic notunu güncelle. İş kayıt defteri satırları "önce belge" / `faz-baslat` işinde eklenir.

@docs/kontrol-odasi/README.md
