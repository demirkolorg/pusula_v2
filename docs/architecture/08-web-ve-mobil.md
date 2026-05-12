---
title: "08 — Web ve Mobil"
description: "Next.js web ve ileri faz Expo mobile teknik kuralları."
aliases:
  - "Web ve Mobil"
  - "Frontend"
tags:
  - "pusula"
  - "architecture/frontend"
  - "mobile"
type: "architecture"
axis: "architecture"
status: "active"
parent: "[[docs/architecture/README|Tasarım / Teknik Mimari]]"
updated: 2026-05-12
---
# 08 — Web ve Mobil

> Eksen: **tasarım / teknik**. Board mekaniği (drag-drop/optimistic/realtime) ayrı: [`05-board-mekanigi.md`](05-board-mekanigi.md).

---

## 8.1 Web (`apps/web` → `@pusula/web`)

Next.js App Router. App `apps/web/src/app`; `@/*` → `apps/web/src/*`.

Sorumluluklar: board ekranı, drag-drop deneyimi, workspace & board yönetimi, notification center,
activity feed, search, settings, auth ekranları.

Kullanım ilkeleri:

- Ana API Next içinde **değil**, `apps/api` içinde. Route Handler'lar yalnızca web-BFF veya özel web endpoint'leri için.
- Server Component'ler initial shell/data için kullanılabilir; board ekranı interaktif olduğundan client component ağırlıklıdır.

Board ekranı teknik ihtiyaçları: stable layout · horizontal scroll · kart virtualization ihtimali ·
keyboard accessibility · drag overlay · multi-list reorder · optimistic cache update · realtime reconciliation.

### UI: yalnızca shadcn/ui

- **Yalnızca shadcn/ui** + Tailwind CSS (v4) + lucide-react. MUI, Chakra UI, Ant Design, Mantine, Headless UI veya başka component library **yok**. Radix primitive'ler yalnızca shadcn/ui bileşenlerinin parçası olarak.
- Ürüne özel bileşenler shadcn/ui üzerine inşa edilir. Paylaşılan web bileşenleri `@pusula/ui`; design token'lar `@pusula/ui/theme.css`; shadcn ekleme: `components.json` `packages/ui`'da konfigüre.
- **i18n & hardcode:** UI bileşenleri hardcode metin **içermez**; entity-bağımsız ve yerelleştirme (i18n) standartlarına uygun. Metinler çeviri katmanından gelir, etiketler/format locale-aware olur.
- Accessibility: keyboard navigation, focus yönetimi, ARIA — özellikle board ekranı ve modal akışları.

### 8.1.1 Auth ekranları & oturum yönetimi (Faz 1)

Better Auth HTTP route'ları `apps/api` (`${API_URL}/api/auth/*`); web tarafı `apps/web/src/lib/auth-client.ts` (`better-auth/react`) ile bunları çağırır. Web ve API farklı origin'de (dev: `:3000` / `:3001`) — session cookie API origin'inde set edilir, tRPC ve auth istekleri `credentials: 'include'` ile gider; bu yüzden **oturum yönetimi client-side**'dır (Next.js RSC, API origin'inin cookie'sine erişemez — server-side session kontrolü bu fazda yok).

- **Public route'lar:** `app/(auth)/sign-in`, `app/(auth)/sign-up`. `(auth)/layout.tsx` zaten oturum açıksa `/`'a yönlendirir. Formlar native `<form>` + `@pusula/domain` zod şemalarıyla client-side validasyon; `authClient.signUp.email(...)` / `signIn.email(...)`; hata mesajı inline; başarıda `?redirect=` (varsa) ya da `/`'a gider.
- **Korumalı kabuk:** `app/(app)/layout.tsx` (client component) `authClient.useSession()` kullanır — `pending` → iskelet/spinner; oturum yok → `router.replace('/sign-in?redirect=…')`; oturum var → app shell (header: kullanıcı adı + çıkış). `app/(app)/page.tsx` = `(app)/` varış noktası — workspace sayısına göre dallanır (onboarding / tek workspace'e yönlendir / workspace listesi), bkz. §8.1.3. Çıkış: `authClient.signOut()` → `/sign-in`.
- **Workspace oluşturma:** shadcn `Dialog` + ad input → `trpc.workspace.create` mutation (`clientMutationId` istemcide üretilir, ör. `crypto.randomUUID()`); başarıda `workspace.list` invalidate. Tam optimistic UI Faz 4'te.
- **Workspace daveti (Faz 1.3 web):** workspace kartında — kullanıcı `admin+` ise — "Davet et" → shadcn `Dialog`, e-posta input (rol varsayılan `member`; rol seçimi sonraki iterasyon) → `trpc.workspace.members.invite`; hata inline (`CONFLICT` → "zaten üye/davetli"). Workspace listesinde ayrıca "Bekleyen davetler" bölümü → `trpc.workspace.invitations.mine` (kullanıcının kendi e-postasına gelen `pending` davetler: workspace adı, rol, davet eden, son tarih) + "Kabul et" / "Reddet" → `invitations.accept` / `invitations.decline` (`clientMutationId` ile); kabul başarılı → `workspace.list` (+ `invitations.mine`) invalidate. Gönderilmiş davetleri yönetme (`invitations.list`/`revoke`) workspace üyeler ekranıyla birlikte (sonraki iterasyon). Backend sözleşmesi → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Workspace davet akışı).
- **Form kütüphanesi:** Faz 1 auth formları basit (email/parola) — native form + zod yeterli; ayrı form kütüphanesi (react-hook-form vb.) eklenmez. Karmaşık form ihtiyacı doğarsa ayrı karar.
- **shadcn bileşenleri** (`@pusula/ui`): `Button` mevcut; bu işle eklenenler (`Input`, `Label`, `Card`, `Dialog`, …) — `pnpm dlx shadcn@latest add …` `packages/ui` içinden, sonra `src/index.ts`'den export, `apps/web` zaten `@source` ile `packages/ui/src`'i Tailwind taramasına dâhil ediyor.
- **Test:** Auth formları için React Testing Library (render + validasyon + `authClient` mock'lu submit). Playwright e2e (sign-up → workspace listesi → workspace oluştur → çıkış) ileri faz / Faz 8 sertleştirmeyle birlikte.

### 8.1.2 Workspace yönetim ekranı (Faz 1)

Backend'de hazır olan workspace yönetim procedure'lerinin (`workspace.update`/`archive`, `workspace.members.{list,updateRole,remove}`, `workspace.invitations.{list,revoke}`) UI'ı. Backend sözleşmesi → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Workspace yetkilendirme + davet akışı), [`03-backend.md`](03-backend.md).

- **Route:** `app/(app)/workspaces/[id]/page.tsx` (client component) — workspace detay/ayarlar görünümü. `workspaceId` = path param; `trpc.workspace.get` ile shell verisi (ad, slug, rol, üye sayısı). `app/(app)/page.tsx` workspace listesinde kart başlığı bu route'a `Link`'tir. Faz 2'de board listesi/board ekranı bu route'un altına gelir (`workspaces/[id]/boards/[id]`).
- **Rol-bazlı görünürlük (UI seviyesi; sunucu zaten enforce eder):** ayarlar (rename/slug) ve davet/rol/üye-çıkar aksiyonları yalnızca `owner`/`admin`'e gösterilir; arşivleme yalnızca `owner`'a; gönderilmiş davet listesi `member+`'e görünür ama "iptal et" yalnızca `admin+`'e. Herkes (owner hariç) "workspace'ten ayrıl" görür. `owner` rolü UI'da değiştirilemez/çıkarılamaz olarak işaretlenir.
- **Ayarlar:** ad + slug düzenleme formu (`@pusula/domain` `workspaceNameSchema`/`workspaceSlugSchema` ile client-side validasyon) → `trpc.workspace.update`; `CONFLICT` (slug çakışması) inline.
- **Tehlikeli bölge** (yalnızca `owner`): (1) **Arşivle** → `trpc.workspace.archive` (onaylı `Dialog`) → başarıda `router.replace('/')` + `workspace.list` invalidate. (2) **Kalıcı sil** (`workspace.delete` — geri dönüşsüz; backend DEM-24, UI DEM-40) → onaylı `Dialog` içinde workspace adını birebir yazma input'u (`confirmName`; eşleşmeden onay butonu disabled); `trpc.workspace.delete({ workspaceId, confirmName, clientMutationId })` → başarıda `router.replace('/')` + `workspace.list` invalidate; `BAD_REQUEST` (ad eşleşmiyor) / `FORBIDDEN` inline `Alert`. "Sil" "Arşivle"den ayrı ve daha vurgulu (destructive) gösterilir.
- **Üyeler:** `trpc.workspace.members.list` → satır başına ad/e-posta/rol; `admin+` ise non-owner satırlarda rol değiştir (shadcn `Select` — `assignableWorkspaceRoleSchema`: `admin`/`member`/`guest`) → `trpc.workspace.members.updateRole`, ve "çıkar" → `trpc.workspace.members.remove`. Kendi satırında (owner değilse) "workspace'ten ayrıl" → `members.remove` (kendi `userId`) → başarıda `router.replace('/')` + `workspace.list` invalidate. Mutation sonrası `members.list` invalidate.
- **Gönderilmiş davetler:** `trpc.workspace.invitations.list` → bekleyen davetler (e-posta, rol, davet eden, son tarih); `admin+` ise "iptal et" → `trpc.workspace.invitations.revoke` → `invitations.list` invalidate. "Üye davet et" dialog'u (§8.1.1'deki `InviteMemberDialog`, davet sonrası `invitations.list` invalidate eder) bu ekrana taşınır; workspace listesi kartından kaldırılır.
- **shadcn:** bu işle eklenenler: `Select` (`@radix-ui/react-select`) — `packages/ui`'a eklenip `src/index.ts`'den export edilir.
- **`clientMutationId`:** her mutation istemcide üretilir (`crypto.randomUUID()`). Tam optimistic UI Faz 4 (DEM-27); bu fazda mutation sonrası ilgili query'ler invalidate edilir.
- **Test:** sunum (presentational) bileşenleri için React Testing Library (render + rol-bazlı görünürlük + validasyon + callback).

### 8.1.3 Yeni kullanıcı onboarding'i & signup bootstrap (Faz 1)

Yeni kayıt olan kullanıcı boş bir ekrana düşmesin diye signup'ta otomatik bir default workspace + boş "İlk Pano" oluşturulur; login sonrası `(app)/` varış noktası kullanıcının workspace sayısına göre dallanır. Domain kuralı (best-effort default workspace, `workspace.list` boş olabilir) → [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md) (invariant 11).

- **Signup bootstrap (`apps/api`):** Better Auth instance'ı (`apps/api/src/auth.ts`) `databaseHooks.user.create.after` ile yeni kullanıcı için **tek transaction'da**: `workspaces` (sabit ad `"Çalışma Alanım"` — `@pusula/domain` `ONBOARDING_WORKSPACE_NAME`; benzersiz slug, suffix'li) + `workspace_members` (rol `owner`) + `activity_events`(`workspace.created`) + `boards` (`"İlk Pano"` — `ONBOARDING_BOARD_TITLE`) + `board_members` (creator `admin`) + `activity_events`(`board.created`) **+ pano şablonu**: varsayılan listeler (`Yapılacak` / `Devam Eden` / `Bitti` — `ONBOARDING_LIST_TITLES`; `position` fractional, `@pusula/domain/position`) + `Yapılacak` listesinde birkaç welcome/örnek kart (`ONBOARDING_WELCOME_CARDS`) + ilgili `list.created` / `card.created` activity'leri (actor = yeni kullanıcı). Şablon içeriği `@pusula/domain` sabitleri (i18n placeholder; kullanıcı-yüzlü → Türkçe). Bootstrap **best-effort**: hata loglanır, exception **yeniden fırlatılmaz** — signup başarılı sayılır, kullanıcı yine `(app)/`'a düşer (orada 0-workspace onboarding'ini görür). Mantık `apps/api/src/bootstrap.ts`'te; Better Auth tarafı → [`07-auth.md`](07-auth.md). Domain kuralı (best-effort default workspace + pano şablonu) → [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md) (invariant 11).
- **`(app)/page.tsx` yönlendirme:** `trpc.workspace.list` yüklenir; sonuca göre:
  - **`pending`** → kısa "yükleniyor" placeholder.
  - **`error`** → hata `Alert`'i + tekrar dene.
  - **0 workspace** → onboarding boş-durumu (`_components/onboarding-empty-state.tsx`: Pusula/workspace kavramını anlatan kart + "Workspace oluştur" CTA → `CreateWorkspaceDialog`). Bootstrap çalıştıysa bu nadirdir, ama kullanıcı son workspace'inden ayrılınca da bu duruma düşer. `PendingInvitations` bu durumda da gösterilir.
  - **1 workspace** → `useEffect` içinde `router.replace('/workspaces/[id]')` (o workspace'e doğrudan götür); geçişte kısa placeholder. (İleride workspace'in tek panosu varsa doğrudan o panoya götürmek opsiyonel iyileştirme — Faz 2D board ekranıyla.)
  - **2+ workspace** → mevcut workspace listesi (başlık + `CreateWorkspaceDialog` + `PendingInvitations` + kart grid'i).
- **Metinler:** onboarding metinleri `strings.onboarding` (+ gerekirse `strings.workspace.redirecting`); hardcode metin yok.
- **`clientMutationId`:** onboarding'deki workspace oluşturma `CreateWorkspaceDialog` üzerinden (istemcide üretilir); yeni mutation yok.
- **Test:** `onboarding-empty-state` için React Testing Library (render + CTA); `(app)/page.tsx` yönlendirme mantığı için RTL (0 / 1 / 2+ / pending / error senaryoları; `useTRPC` / `useQuery` / `useRouter` mock'lu). Backend bootstrap için ileride tRPC/integration testi opsiyonel (best-effort yol).

### 8.1.4 Board ekranı (Faz 2D)

Backend Faz 2A/2B/2C tamam (`board.{list,create,get,update,archive}`, `list.{create,update,archive}`, `card.{create,get,update,archive}`). Bu faz web tarafında **salt CRUD** board ekranını kurar — drag-drop **yok** (Faz 3 — [DEM-26](https://linear.app/demirkol/issue/DEM-26)), optimistic UI **zorunlu değil** (Faz 4 — [DEM-27](https://linear.app/demirkol/issue/DEM-27); bu fazda mutation → `await` → ilgili query invalidate → refetch). Backend sözleşmesi → [`03-backend.md`](03-backend.md) (Faz 2 — board / list / card procedure'leri), [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Board / List / Card procedure haritası); board ekranı veri akışı → [`05-board-mekanigi.md`](05-board-mekanigi.md) §5.0.

- **Board listesi:** `app/(app)/workspaces/[id]/page.tsx` üst bölümüne (ayarlar/üyeler kartlarından **önce**) "Panolar" bölümü — `trpc.board.list` ({ workspaceId }); kart başına board adı → `Link` `/workspaces/[id]/boards/[boardId]`; "Pano oluştur" → shadcn `Dialog` + ad input (`@pusula/domain` `boardTitleSchema` ile client-side validasyon) → `trpc.board.create` (`clientMutationId` istemcide) → `board.list` invalidate. Arşivli board'lar listede soluk/ayrı işaretli ve salt-okunur; board satırındaki `role` alanına göre aksiyonlar gizlenir/gösterilir (gerçek kapı server-side).
- **Board detay:** `app/(app)/workspaces/[id]/boards/[boardId]/page.tsx` (client component) — `trpc.board.get` ({ boardId }) tek seferde `{ board: {…, role}, lists: [...] (arşivli dahil, `position` sıralı), cards: [...] (yalnızca aktif, `position` sıralı) }` döndürür. Yatay kaydırılan kolon (liste) düzeni; her kolonda listenin kartları (`cards` `listId`'ye göre gruplanır). Kolon/kart ölçüleri stabil — hover/edit'te layout shift yok. Üstte board başlığı (admin ise inline yeniden adlandırma) + "geri" linki (`/workspaces/[id]`). Board yoksa/erişim yoksa `NOT_FOUND`/`FORBIDDEN` → `Alert` + geri linki.
- **List CRUD** (board `member+` ise göster — `board.role`): "Liste ekle" (kolon listesi sonuna inline form → `trpc.list.create` { boardId, title }) · "yeniden adlandır" (kolon başlığı inline edit → `trpc.list.update` { listId, title }) · "arşivle" (kolon menüsü → `trpc.list.archive` { listId, archived: true }) — her biri sonrası `trpc.board.get` invalidate.
- **Card CRUD** (board `member+`): "Kart ekle" (kolon altına inline form → `trpc.card.create` { listId, title }) · "düzenle" (kart tıkla → dialog: başlık/açıklama/`due_at` → `trpc.card.update`) · "arşivle" (kart menüsü/dialog → `trpc.card.archive` { cardId, archived: true }) — her biri sonrası `trpc.board.get` invalidate.
- **Yetki:** UI board rolüne göre aksiyonları gizler/gösterir (`viewer` salt-okunur); arşivli board/liste salt-okunur (server zaten reddeder, UI da aksiyonları kapatır). Mutation hatası inline `Alert`.
- **shadcn:** mevcut bileşenler büyük ölçüde yeterli (`Button`/`Card`/`Dialog`/`Input`/`Label`/`Alert`/`Badge`); gerekirse `DropdownMenu` (`@radix-ui/react-dropdown-menu`) ve/veya `Textarea` eklenir (`packages/ui` → `pnpm dlx shadcn add …`, `src/index.ts` export). Türkçe metinler `apps/web/src/lib/strings.ts` (`strings.board`); UI bileşenleri hardcode metin içermez.
- **`clientMutationId`:** her mutation istemcide üretilir (`crypto.randomUUID()`). Tam optimistic UI Faz 4 (DEM-27).
- **Test:** React Testing Library — board listesi (render + "Pano oluştur" akışı + boş durum), board detay (kolon/kart render + boş board), liste/kart oluşturma akışları (presentational form bileşenleri izole, callback + validasyon). Playwright e2e (board oluştur → liste/kart ekle) ileri faz (Faz 8 — [DEM-31](https://linear.app/demirkol/issue/DEM-31)).

### 8.1.5 Kart detay görünümü (Faz 2.5D)

Board ekranında (§8.1.4 Board ekranı) bir karta tıklanınca açılan kart detay görünümü — Trello kart modali. Backend Faz 2.5A/2.5B (`comment.*`, `checklist.*`/`checklist.item.*`, `card.members.*`, `card.labels.*`, `label.*`) tamam olmalı. Backend sözleşmesi → [`03-backend.md`](03-backend.md) (Faz 2.5 procedure'leri), [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Board / Card içerik procedure haritası — Faz 2.5).

- **Sunum: modal + URL query param.** Kart detayı shadcn `Dialog` ile board ekranının **üstünde** açılır (board arkada kalır — Trello hissi). Açık kart `?card=<cardId>` query param'ıyla URL'e yansır (paylaşılabilir/derin link; sayfa yenilenince modal açık gelir). Next.js intercepting/parallel route kullanılmaz — `useSearchParams` + `router.push`/`replace` (shallow) ile yönetilir; modal kapanınca param kaldırılır. Param geçersiz kart id'siyse modal açılmaz (sessiz) ya da kısa "kart bulunamadı" gösterir.
- **Veri:** `trpc.card.get` ({ cardId }) — kart + kullanıcının kart ilişkileri (`card_members`); ayrıca `trpc.comment.list` ({ cardId }), checklist'ler (kart payload'ında veya ayrı query — `card.get` zaten kartı döndürüyor; checklist/etiket/üye için ek alanlar eklenir ya da ayrı query'lerle çekilir; implementasyonda netleşir), board etiketleri (`board.get`'e `labels` eklenir ya da `label.list`), kart activity feed (ayrı `activity.list` ({ cardId }) — board/kart query'sini şişirme; **G2** boşluk-tara notu burada). Permission `card.get` ile (board `viewer+`) — `viewer` salt-okunur.
- **İçerik (modal):** başlık (board `member+` ise inline edit → `card.update`) · açıklama (inline edit, boş→`null`/`''` normalize → `card.update`) · due-date picker (`<input type=date>` veya küçük takvim → `card.update` `dueAt` set/clear) · üyeler — `assignee`/`watcher` listesi + ekle (board üyeleri arasından seç → `card.members.add`) / çıkar (`card.members.remove`); `viewer` yalnızca "kendini watcher yap / bırak" görür · etiketler — kartın etiketleri + board etiket listesinden ata/kaldır (`card.labels.add`/`remove`) · checklist'ler — checklist ekle/yeniden adlandır/sil (`checklist.*`), item ekle/işaretle/düzenle/sil/sırala (`checklist.item.*`), her checklist için ilerleme (X/Y) · yorumlar — listele (`comment.list`, eskiden yeniye) + ekle (`comment.create`, düz metin) + düzenle/sil (yazan veya board `admin` — `comment.update`/`delete`; silinmiş yorum "silindi" placeholder'ı) · kart activity feed (kronolojik geçmiş — okunabilir özet satırları) · "arşivle" (zaten board ekranında var; modalda da olabilir → `card.archive`).
- **Yetki & arşiv:** UI board rolüne göre aksiyonları gizler (`viewer` salt-okunur; "kendini watcher yap" hariç); arşivli board/liste/kart salt-okunur (server zaten reddeder, UI da kapatır). Mutation hatası inline `Alert`.
- **Reconcile:** Optimistic UI **bu fazda zorunlu değil** (Faz 4 — [DEM-27](https://linear.app/demirkol/issue/DEM-27)) — her mutation → `await` → ilgili query'leri (`card.get`/`comment.list`/`board.get`/checklist/activity) invalidate → refetch. `clientMutationId` her mutation'da istemcide üretilir (`crypto.randomUUID()`).
- **shadcn:** mevcutlar büyük ölçüde yeterli (`Dialog`/`Button`/`Input`/`Textarea`/`Label`/`Card`/`Alert`/`Badge`/`Select`); gerekirse `Checkbox` (checklist item), `Popover` (etiket/üye seçici), `Tabs` (yorum/activity sekmeleri) eklenir (`packages/ui` → `pnpm dlx shadcn add …`, `src/index.ts` export — yalnızca shadcn/ui + Tailwind + lucide-react). Türkçe metinler `apps/web/src/lib/strings.ts` (`strings.card`); UI bileşenleri hardcode metin içermez.
- **Test:** React Testing Library — modal aç/kapa (+ `?card` param senkronu), açıklama/due inline edit, üye/etiket ekle-kaldır, checklist item toggle, yorum ekle/sil, activity feed render; presentational form/list bileşenleri izole (callback + validasyon, tRPC mock'lu). Playwright e2e ileri faz (Faz 8).

### 8.1.6 Board üye + etiket yönetimi UI (Faz 2.5E — [DEM-54](https://linear.app/demirkol/issue/DEM-54))

Board ayarları/detay ekranına üye/rol yönetimi + etiket yönetimi + board ekranında etiket filtresi. Backend Faz 2.5B (`label.*`) + Faz 2.5C (`board.members.*`, `board.invitations.*`) tamam. Backend sözleşmesi → [`03-backend.md`](03-backend.md) (Faz 2.5 procedure'leri), [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md).

- **Konum:** board detay sayfasında (§8.1.4 Board ekranı), board başlığı yanında bir "Board ayarları" girişi — board `admin` ise — shadcn `Dialog` açar (workspace yönetim ekranındaki §8.1.2 pattern'iyle hizalı): içinde "Üyeler" + "Gönderilmiş davetler" + "Etiketler" bölümleri. Dialog yalnızca board `admin`'e mount edilir (gerçek kapı backend; UI rol-bazlı gizler — §8.1.2 modeli).
- **Üyeler** (`board-settings/board-members-section.tsx` + sunum `board-member-row.tsx`): `trpc.board.members.list` → satır başına ad/rol; inherited (workspace owner/admin) satırlar "workspace yöneticisi — düzenlenemez" işaretli (rol/çıkar yok). `admin` ise: rol değiştir (shadcn `Select` — `boardRoleSchema`: `admin`/`member`/`viewer`; tek explicit `admin` ve inherited satır kilitli) → `board.members.updateRole`; çıkar → `board.members.remove` (kendi satırında "board'dan ayrıl" → başarıda `/workspaces/[id]`'e yönlendir + `board.list`/`workspace.list` invalidate); üye ekle (e-posta + rol — `add-board-member-form.tsx`) → `board.members.add`, sonuç `kind` discriminated union: `added` / `added_as_guest` / `invited` → inline durum mesajı; `CONFLICT` → "zaten üye / zaten davetli". Mutation sonrası `board.members.list` + `board.get` (+ ekleme sonrası `board.invitations.list`) invalidate.
- **Gönderilmiş board davetleri** (`board-settings/board-sent-invitations.tsx`): `trpc.board.invitations.list` → bekleyen davetler (e-posta, rol, davet eden, son tarih); `admin` ise "iptal et" → `board.invitations.revoke` → `invitations.list` invalidate. Kullanıcının kendi board davetleri (`board.invitations.mine`) workspace davetleriyle aynı yerde — `(app)/page.tsx` "Bekleyen davetler" bölümü (§8.1.1'deki `PendingInvitations`) genişletildi: "Workspace davetleri" + "Board davetleri" alt grupları; board satırı: board adı + workspace adı + rol + davet eden + son tarih; "Kabul et"/"Reddet" → `board.invitations.accept`/`decline` (`clientMutationId` ile); kabul sonrası `workspace.list` + `board.invitations.mine` + `workspace.invitations.mine` invalidate.
- **Etiketler** (`board-settings/board-labels-section.tsx` + sunum `board-label-row.tsx` / `create-board-label-form.tsx`): board ayarları dialog'unda `trpc.label.list` → satır başına renk swatch + ad (boşsa "(adsız)"); board `member+` (dialog admin-only olduğu için zaten sağlanır; arşivli board salt-okunur): etiket ekle (renk seçici — `@pusula/domain` `LABEL_COLORS` paleti + opsiyonel ad) → `label.create`; satır içi düzenle (renk + ad) → `label.update`; sil (onaylı — kartlardan da kalkar) → `label.delete`. `CONFLICT` (aynı renk+ad) inline. Mutation sonrası `label.list` + `board.get` (kart rozetleri) invalidate. Renk→Tailwind swatch eşlemesi paylaşılan `_components/label-colors.ts`'te (`LABEL_SWATCH`; eskiden `card-detail/` altındaydı, yukarı taşındı — kart detayı + board ayarları + board ekranı ortak kullanır).
- **Etiket filtresi (board ekranı)** (`board-filter-bar.tsx` + saf `board-filter.ts`): board kolonlarının üstünde bir filtre çubuğu — etiket çipleri (çoklu seçim; bir kart **en az bir** seçili etikete sahipse gösterilir — client-side filtre, `board.get` verisi üzerinde). Etiket paleti `board.get`'in döndürdüğü `cards[].labels`'tan türetilir (board ekranı `label.list` çağırmaz). Filtre durumu local state (URL param değil — sade tutuldu). Kart rozetleri: `card-item.tsx` artık `card.labels`'ı küçük renk çipleri olarak gösterir.
- **Arşivli öğeler toggle (G7):** aynı filtre çubuğunda "arşivli listeleri göster/gizle" toggle'ı (+ "N arşivli liste" sayacı) — board ekranı varsayılan olarak arşivli listeleri **gizler**; toggle açıkken arşivli listeler soluk gösterilir ve mevcut restore aksiyonu (`list.archive` `archived:false`) erişilebilir olur. **Arşivli kartlar bu fazda yapılmadı** — `board.get` arşivli kartları zaten döndürmüyor; arşivli-kart görünümü için `board.get`'e `includeArchivedCards` flag'i ileri faz/follow-up (board.get'i fazla genişletmemek için). Tam "arşiv kutusu" ekranı da isteğe bağlı ileride.
- **`board.get` additive alanı:** board ekranı etiket filtresi + kart rozetleri için `board.get`'in `cards` projection'ına her kart için `labels: { labelId, name, color }[]` eklendi (`card_labels ⋈ labels`, board genelinde tek sorgu, server'da Map ile gruplanır) — mevcut shape additive, eski testler kırılmaz; bkz. [`03-backend.md`](03-backend.md) (`board.get`).
- **shadcn:** yalnızca mevcut bileşenler — `Dialog`/`Select`/`Button`/`Input`/`Label`/`Badge`/`Alert` (yeni paket eklenmedi; renk seçici/arşiv toggle için `Popover`/`Switch`/`Checkbox` yerine native `button`/`input` + mevcut bileşenler — §8.1.5'teki gibi). Türkçe metinler `strings.board.settings` / `strings.board.filter` / `strings.invitations` (board grupları); hardcode metin yok. `clientMutationId` her collaborative mutation'da istemcide (`crypto.randomUUID()`). Optimistic UI yok (Faz 4) — mutation → `await` → ilgili query invalidate → refetch; hata inline `Alert`.
- **Test:** React Testing Library — board üye satırı (rol-bazlı görünürlük + inherited/last-admin işareti + rol değiştir/çıkar callback), board üye ekle formu (e-posta/rol validasyon + submit), board etiket satırı (düzenle/sil callback + no-op save), board etiket oluştur formu (renk/ad + conflict), board filtre çubuğu (çip seçim/temizle + arşiv toggle), board filtre saf fonksiyonları (`board-filter.ts` — OR semantiği + arşivli liste filtresi/sayacı), kart rozetleri. Backend için `board.test.ts`'e `board.get` `cards[].labels` testi eklendi. Playwright e2e ileri faz (Faz 8).

### 8.1.7 Profil / hesap ayarları ekranı (Faz 1)

Kullanıcının kendi hesabını yönetebileceği ekran — `bosluk-tara` (G5) ile açıldı ([DEM-55](https://linear.app/demirkol/issue/DEM-55)). Bu ekran **tRPC kullanmaz**; doğrudan Better Auth client (`apps/web/src/lib/auth-client.ts`) uçlarına gider — sözleşme → [`07-auth.md`](07-auth.md) (Profil & hesap yönetimi); şemalar `@pusula/domain` (`updateProfileInput` / `changePasswordInput` / `deleteAccountInput`). Hesap silme domain kuralı → [`../domain/02-yetkilendirme-kurallari.md`](../domain/02-yetkilendirme-kurallari.md) (Hesap (User) — öz-yönetim), [`../domain/01-urun-modeli.md`](../domain/01-urun-modeli.md) (invariant 14).

- **Route:** `app/(app)/account/page.tsx` (client component) — `authClient.useSession()` ile mevcut kullanıcı (oturum kabuğu `(app)/layout.tsx` zaten korur). App-shell header'ına "Hesap" linki (`/account`) eklenir (kullanıcı adının yanında).
- **Profil:** ad input (`@pusula/domain` `userNameSchema` ile client-side validasyon) + avatar URL input (boş → kaldır; URL formatı doğrulanır) → `authClient.updateUser({ name, image: image || null })`; başarıda `authClient.useSession().refetch()` (header güncellensin) + başarı mesajı. Avatar **basit URL** (yükleme yok — Faz 8 attachment'a bağlanabilir; karar 2026-05-12).
- **Parola değiştir:** mevcut parola + yeni parola (+ yeni parola tekrar — client-side eşleşme kontrolü) → `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`; hatalar inline (`currentPassword` yanlış → "Mevcut parola hatalı"); başarıda alanlar temizlenir + başarı mesajı.
- **Tehlikeli bölge — hesabı sil:** onaylı `Dialog` içinde parola input'u (re-auth) → `authClient.deleteUser({ password })`; başarıda `/sign-in`'e dön. Kullanıcı bir workspace'in `owner`'ıysa sunucu (`beforeDelete` hook) `BAD_REQUEST` döndürür → inline `Alert` ("Önce sahibi olduğun çalışma alanlarını silmen/devretmen gerekiyor" + workspace listesine link). UI bunu önceden de işaret edebilir (kullanıcının `owner` olduğu workspace sayısı `trpc.workspace.list`'in `role` alanından okunabilir) ama gerçek kapı sunucudadır.
- **shadcn:** mevcutlar yeterli (`Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`Button`/`Input`/`Label`/`Alert`/`Dialog`); yeni bileşen yok. Türkçe metinler `apps/web/src/lib/strings.ts` (`strings.account`); UI bileşenleri hardcode metin içermez. `clientMutationId` yok (Better Auth uçları — tRPC collaborative mutation değil).
- **Test:** React Testing Library — presentational form bileşenleri (`ProfileForm` / `ChangePasswordForm` / `DeleteAccountSection`): render + validasyon + callback (auth-client mock'lu). `canDeleteOwnAccount` domain kuralı için `@pusula/domain` Vitest. Playwright e2e ileri faz (Faz 8).

---

## 8.2 Mobil (`apps/mobile`)

Expo + Expo Router. **Henüz iskelet kurulmadı** — ileri faz; kullanıcı açıkça istemeden `apps/mobile` **oluşturulmaz**.

İleride desteklenecek: auth session · board listesi · board görüntüleme · card detail · card
create/update · notification center · push notification deep link · cache persistence (faydalı yerlerde).

Mobil teknoloji: Expo, Expo Router, React Native Reanimated, Gesture Handler, Expo Notifications,
tRPC client, TanStack Query.

Mobil drag-drop ilk implementasyonda **öncelikli değildir** — alternatif taşıma modeli daha
sağlıklı: kart üzerinde "liste değiştir" aksiyonu, kart detayında "move to" picker; gerekirse
ileride basit long-press reorder. Dikkat: push token yönetimi, foreground/background notification
davranışı, deep link ile kart açma, offline mutation queue, cache persistence, auth session refresh.
