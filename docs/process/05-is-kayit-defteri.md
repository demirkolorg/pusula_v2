---
title: "05 — İş Kayıt Defteri"
description: "Linear işlerinin repo içindeki takip aynası."
aliases:
  - "İş Kayıt Defteri"
  - "Work Register"
tags:
  - "pusula"
  - "process/work-register"
  - "linear"
type: "register"
axis: "process"
status: "active"
parent: "[[docs/process/README|Süreç]]"
updated: 2026-05-12
---
# 05 — İş Kayıt Defteri

> Eksen: **süreç**. Bu dosya Linear'ın repo içindeki takip aynasıdır. Her geliştirme,
> refactor, bug fix, dokümantasyon ve infra işi için tek satır tutulur.

Durumlar yalnızca `Todo`, `In Progress`, `Blocked`, `Review`, `Done`, `Canceled` değerlerinden
biri olmalıdır. Linear MCP erişilemiyorsa `Linear` alanına `MCP bekliyor` yazılır ve ilk uygun
oturumda Linear issue ile eşlenir.

| İş ID | Linear | Başlık | Faz | Durum | Sahip | Etkilenen belgeler | Etkilenen katmanlar | Son senkron | Not |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DOC-2026-05-12-001 | DEM-16 | Otomatik iş akışı protokolünü kur | Süreç | Done | Claude Code | `CLAUDE.md`, `.claude/skills/kontrol/SKILL.md`, `docs/README.md`, `docs/process/*` | `docs/process` | 2026-05-12 | Linear issue [DEM-16](https://linear.app/demirkol/issue/DEM-16) ile eşlendi (proje: Pusula). |
| DOC-2026-05-12-002 | DEM-17 | Obsidian kasası dokümantasyon düzeni | Süreç | Done | Codex | `README.md`, `CLAUDE.md`, `.claude/skills/kontrol/SKILL.md`, `docs/**/*.md` | `docs` | 2026-05-12 | 31 Markdown dosyasında frontmatter/link kontrolü geçti; Linear issue [DEM-17](https://linear.app/demirkol/issue/DEM-17) ile eşlendi (proje: Pusula). |
| INFRA-2026-05-12-001 | DEM-18 | İlk commit ve GitHub remote (`pusula_v2`) push | 0 — Temel altyapı | Done | Claude Code | `.gitignore`, `docs/process/05-is-kayit-defteri.md` | repo kökü | 2026-05-12 | Faz 0 iskelesinin tamamı tek commit ile yüklendi; `master` → `main`, remote: github.com/demirkolorg/pusula_v2. `.obsidian/` gitignore'a eklendi. Linear issue [DEM-18](https://linear.app/demirkol/issue/DEM-18) ile eşlendi (proje: Pusula). |
| DOC-2026-05-12-003 | DEM-19 | Genel çalışma başlangıç rehberi oluştur | Süreç | Done | Codex | `CLAUDE.md`, `.claude/skills/kontrol/SKILL.md`, `docs/README.md`, `docs/process/00-calisma-baslangic-rehberi.md`, `docs/process/03-faz-0-devir-notu.md`, `docs/process/04-otomatik-is-akisi-protokolu.md`, `docs/process/README.md` | `docs/process` | 2026-05-12 | Yeni işlerde Faz 0 devir notu yerine genel başlangıç rehberi baz alınacak. Linear issue [DEM-19](https://linear.app/demirkol/issue/DEM-19) ile eşlendi (proje: Pusula). |
| API-2026-05-12-001 | DEM-20 | Faz 1A — Workspace alanı (backend): `workspaceProcedure` + CRUD + üyelik + permission enforcement | 1 — Auth & Workspace | Done | Claude Code | `docs/architecture/03-backend.md`, `docs/domain/02-yetkilendirme-kurallari.md`, `docs/architecture/07-auth.md`, `docs/process/02-mvp-faz-plani.md` | `packages/api`, `packages/domain`, `packages/db` | 2026-05-12 | İmplement edildi: `workspaceProcedure` (membership middleware), `workspace.{list,create,get,update,archive}` + `workspace.members.{list,updateRole,remove}`, activity yazımı (`workspace.created/updated/archived/member_role_changed/member_removed`) ilgili transaction'da. `ACTIVITY_EVENT_TYPES`'a 3 yeni değer + Drizzle migration `drizzle/0001_loud_kinsey_walden.sql`. Vitest kuruldu: 15 domain birim + 8 tRPC integration testi PASS. QA (code-reviewer + security-reviewer + database-reviewer) = PASS; review M1 bulgusu düzeltildi (slug çakışmasında PG `23505` → `CONFLICT` map'lenir, check-then-write yarışına karşı). verifier = PASS (`typecheck`/`lint`/`test` yeşil, secret taraması temiz). Commit: `97cd9b8` (main, push edildi → origin). Linear issue [DEM-20](https://linear.app/demirkol/issue/DEM-20) ile eşlendi (proje: Pusula). Kullanıcı onayladı → durum `Done`; DEM-20'nin Linear durumu da `Done`'a çekilecek — Linear MCP yeniden yetkilendirme bekliyor (token süresi doldu), takımda ayrı "In Review" durumu yok. Kalan: davet-token akışı + `workspace.delete` ayrı kayıt (bkz. `docs/process/02-mvp-faz-plani.md` → Faz 1 alt işleri). |
| PROC-2026-05-12-001 | DEM-21 | Linear senkronu: bekleyen iş kayıtlarını Linear'a eşle + Pusula projesi | Süreç | Done | Claude Code | `docs/process/05-is-kayit-defteri.md` | `docs/process` | 2026-05-12 | Linear MCP callable hâle geldi; `Pusula` projesi açıldı (state: In Progress), DOC/INFRA/API satırları DEM-16…DEM-20 ile eşlendi, bu iş [DEM-21](https://linear.app/demirkol/issue/DEM-21). `MCP bekliyor` kalmadı. |
| FE-2026-05-12-001 | MCP bekliyor | Faz 1B — Auth web UI & session: sign-up/in/out, korumalı kabuk, workspace listesi/oluşturma | 1 — Auth & Workspace | In Progress | Claude Code | `docs/architecture/08-web-ve-mobil.md`, `docs/architecture/07-auth.md`, `docs/process/02-mvp-faz-plani.md` | `apps/web`, `packages/ui` | 2026-05-12 | Pre-dev: ilgili docs koddan önce güncellendi (`08-web-ve-mobil.md` §8.1.1 — auth ekranları & oturum, client-side session, korumalı route group, shadcn bileşen ekleme; `07-auth.md` web client notu). Linear MCP token süresi doldu → re-auth URL'i kullanıcıya verildi; yetkilendirilince Linear issue ile eşlenecek. |

## Güncelleme kuralları

- Aynı iş için ikinci satır açma; mevcut satırı güncelle.
- `Son senkron` tarihi Linear veya docs tarafındaki son bilinçli güncelleme tarihidir.
- Faz değişirse `docs/process/02-mvp-faz-plani.md` de aynı çalışma turunda güncellenir.
- Kapanan işlerde test/verification sonucu Linear kapanış yorumunda, kısa notu bu dosyada tutulur.
