---
title: 'Role Info Tooltips Design'
description: 'Workspace, board ve kart uyeligi mantigini baglamsal info ikonlariyla aciklama tasarimi.'
status: 'draft'
date: 2026-05-15
---

# Role Info Tooltips Design

## Goal

Uyelik ve rol mantigi kullanicinin karar verdigi yerde aciklanacak. Amac, workspace, pano ve kart uyeligi arasindaki farki ayarlar ekranlarinda ve kart detayinda kisa, baglamsal bilgi ikonlariyla gorunur yapmak.

Bu degisiklik yetki mantigini degistirmez. Yalnizca mevcut davranisin kullaniciya daha anlasilir anlatilmasini saglar.

## Scope

Info ikonlari su yuzeylere eklenecek:

- Workspace uye yonetimi bolumu.
- Pano uyeleri bolumu.
- Pano davetleri bolumu.
- Pano erisim talepleri bolumu.
- Kart detayindaki Sorumlu / Izleyen uyelik alani.

Ilk uygulama turunda kalici yardim sayfasi, onboarding turu veya uzun dokumantasyon modal'i eklenmeyecek.

## Content

Metinler kisa tutulacak ve kullanicinin ekrandaki aksiyonuyla baglantili olacak.

Workspace uyeleri:

> Workspace rolu genel erisimi belirler. Sahip ve Yonetici uyeleri yonetir; Uye panolarda calisabilir; Misafir yalnizca davet edildigi panolara erisir.

Pano uyeleri:

> Panoda acik rol varsa o kullanilir. Yoksa workspace Sahip/Yonetici panoda Yonetici, workspace Uye panoda Uye sayilir. Misafir yalnizca acikca eklendigi panoya girer.

Pano davetleri:

> Pano daveti kabul edilince kisi workspace uyesi degilse once Misafir yapilir, sonra bu panoya secilen rolle eklenir.

Pano erisim talepleri:

> Paylasilan pano linkinden gelen talepler yalnizca bu pano icindir. Onaylanirsa kullanici gerekirse workspace Misafir'i olur ve secilen pano rolunu alir.

Kart uyeleri:

> Sorumlu ve Izleyen kart iliskileridir, erisim yetkisi vermez. Karta eklenen kisi panoyu zaten gorebiliyor olmalidir.

## UI Design

Ortak bir `InfoTooltipButton` bileşeni eklenecek. Bu bileşen lucide `InfoIcon`, mevcut `Button`, `Tooltip`, `TooltipTrigger` ve `TooltipContent` bileşenlerini kullanacak.

Davranis:

- Icon button baslik veya alan etiketi yaninda yer alir.
- Masaustunde hover ve keyboard focus tooltip'i acar.
- Touch cihazlarda Radix tooltip tetik davranisi kullanilir; ek modal veya sayfa gerekmez.
- Icon button `aria-label` ile "Bilgi" ya da bolume ozel kisa bir ad tasir.
- Tooltip genisligi sinirli olur; uzun cumleler okunabilir sekilde satir kirar.

Gorsel stil:

- Ikon boyutu diger toolbar ikonlariyla uyumlu olur.
- Buton `ghost` ve `icon`/kompakt boyutta kullanilir.
- Tooltip metni mevcut `TooltipContent` diliyle ayni kalir; yeni renk paleti veya kart stili eklenmez.

## Placement

Workspace sayfasinda info ikonu uye listesi basliginin yanina konur. Bu bilgi tum liste icin gecerlidir, her satira tekrar edilmez.

Pano ayarlarinda info ikonlari ilgili sekme/panel basliginin yanina konur:

- Uyeler sekmesi: pano rol mirasi ve explicit uyelik anlatilir.
- Davetler sekmesi: pano davetinin workspace misafirligini nasil olusturdugu anlatilir.
- Erisim talepleri sekmesi: talebin board-scope oldugu anlatilir.

Kart detayinda info ikonu kart uyeleri/Sorumlu-Izleyen alaninin basligina veya sidebar aksiyon grubuna konur. Metin kart uyeliginin yetki vermedigini aciklar.

## Architecture

Yeni ortak bileşen web uygulamasi icinde kucuk bir UI yardimcisi olarak tutulacak. `packages/ui`'a tasimak simdilik gerekli degil; metinler urun-domain baglamina ait ve `apps/web/src/lib/strings.ts` icinden beslenecek.

Olası dosyalar:

- `apps/web/src/components/info-tooltip-button.tsx`
- `apps/web/src/components/info-tooltip-button.test.tsx`
- `apps/web/src/lib/strings.ts`
- Workspace uye listesi/panel bileşenleri.
- Pano ayarlari uye/davet/erisim talebi bileşenleri.
- Kart detay uyeleri bileşeni.

## Accessibility

Info button keyboard ile focuslanabilir olacak. Tooltip icerigi sadece hover'a bagimli kalmayacak; focus durumunda da acilacak. Icon dekoratif oldugu icin `aria-hidden` olur, anlam button `aria-label` uzerinden verilir.

Tooltip metni bilgilendiricidir, bir aksiyonun tamamlanmasi icin zorunlu bilgi olmayacak. Bu nedenle form validation veya kritik hata mesajlari tooltip'e tasinmayacak.

## Testing

Testler once yazilacak.

Beklenen test kapsami:

- Ortak `InfoTooltipButton` aria label ve tooltip icerigini render eder.
- Workspace uye yonetimi rol aciklamasi ikonunu gosterir.
- Pano uyeleri/davetleri/erisim talepleri ilgili aciklamalari gosterir.
- Kart uyeleri alani kart uyeliginin yetki vermedigini aciklar.

Ekran davranisi dogrudan yetki kontrolu degistirmedigi icin API testi gerekmez. Mevcut backend permission testleri degismeden kalir.

## Non-Goals

- Rol sistemini veya permission hesaplamasini degistirmek.
- Her rol rozeti icin ayri tooltip eklemek.
- Yardim merkezi, uzun modal veya onboarding turu eklemek.
- Kart uyeligi ile pano erisimi arasindaki kurali gevsetmek.
