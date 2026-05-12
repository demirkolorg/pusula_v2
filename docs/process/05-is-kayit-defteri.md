# 05 — İş Kayıt Defteri

> Eksen: **süreç**. Bu dosya Linear'ın repo içindeki takip aynasıdır. Her geliştirme,
> refactor, bug fix, dokümantasyon ve infra işi için tek satır tutulur.

Durumlar yalnızca `Todo`, `In Progress`, `Blocked`, `Review`, `Done`, `Canceled` değerlerinden
biri olmalıdır. Linear MCP erişilemiyorsa `Linear` alanına `MCP bekliyor` yazılır ve ilk uygun
oturumda Linear issue ile eşlenir.

| İş ID | Linear | Başlık | Faz | Durum | Sahip | Etkilenen belgeler | Etkilenen katmanlar | Son senkron | Not |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DOC-2026-05-12-001 | MCP bekliyor | Otomatik iş akışı protokolünü kur | Süreç | Done | Claude Code | `CLAUDE.md`, `.claude/skills/kontrol/SKILL.md`, `docs/README.md`, `docs/process/*` | `docs/process` | 2026-05-12 | Linear MCP bu oturumda callable olmadığı için issue sonradan eşlenecek. |
| INFRA-2026-05-12-001 | MCP bekliyor | İlk commit ve GitHub remote (`pusula_v2`) push | 0 — Temel altyapı | Done | Claude Code | `.gitignore`, `docs/process/05-is-kayit-defteri.md` | repo kökü | 2026-05-12 | Faz 0 iskelesinin tamamı tek commit ile yüklendi; `master` → `main`, remote: github.com/demirkolorg/pusula_v2. `.obsidian/` gitignore'a eklendi. Linear MCP callable olmadığı için issue sonradan eşlenecek. |

## Güncelleme kuralları

- Aynı iş için ikinci satır açma; mevcut satırı güncelle.
- `Son senkron` tarihi Linear veya docs tarafındaki son bilinçli güncelleme tarihidir.
- Faz değişirse `docs/process/02-mvp-faz-plani.md` de aynı çalışma turunda güncellenir.
- Kapanan işlerde test/verification sonucu Linear kapanış yorumunda, kısa notu bu dosyada tutulur.
