# Kart Yetkilendirme vs Yansıtma (Mirror) Sistemi

## Amaç

Bu dokümanın amacı:

- Sistemin neden **liste/kart bazlı yetkilendirmeden kaçındığını**
- Bunun yerine neden **workspace + pano bazlı yetkilendirme** tercih edildiğini
- İstisnai durumlar için geliştirilen **Kart Yansıtma (Mirror Card)** yaklaşımını
- Bu yaklaşımın teknik ve UX avantajlarını

açıklamaktır.

---

# 1. Temel Sistem Yapısı

Sistemin temel hiyerarşisi:

```txt
Workspace
 └── Pano (Board)
      └── Liste
           └── Kart
```

Yetkilendirme mantığı:

```txt
Kullanıcı → Workspace Yetkisi
Kullanıcı → Pano Yetkisi
```

Bunun dışında:

- Liste bazlı yetki YOK
- Kart bazlı yetki YOK

Bu bilinçli alınmış bir mimari karardır.

---

# 2. Neden Kart Bazlı Yetkilendirmeden Kaçınılıyor?

İlk bakışta:

```txt
"Karta kullanıcı ekleyelim"
```

fikri kolay görünür.

Fakat zamanla sistem aşağıdaki problemleri üretir.

---

## 2.1 Yetki Karmaşası

Örnek:

| Seviye    | Yetki |
| --------- | ----- |
| Workspace | Var   |
| Pano      | Yok   |
| Liste     | Var   |
| Kart      | Var   |

Bu durumda sistemin cevaplaması gereken sorular oluşur:

- Kullanıcı panoyu göremiyor ama kartı görebiliyor mu?
- Kart görünüyorsa listenin adı görünmeli mi?
- Kart aramada çıkmalı mı?
- Bildirim gitmeli mi?
- Kart taşınırsa yetki ne olacak?
- Alt görevlerde yetki nasıl işleyecek?

Bu durum zamanla:

- Backend karmaşıklığı
- Frontend karmaşıklığı
- Performans problemleri
- Anlaşılması zor UX
- Yönetilemeyen edge-case’ler

oluşturur.

---

## 2.2 Kullanıcı Deneyimi Problemi

Küçük ekipler genellikle şunu ister:

- Basitlik
- Hız
- Öğrenmesi kolay yapı
- "Nerede ne var" hissinin net olması

Kart bazlı yetkilendirme ise:

```txt
"Görebildiğim ama panosunu göremediğim kart"
```

gibi kafa karıştırıcı durumlar üretir.

Bu nedenle sistemin ana prensibi:

> Yetki yalnızca Workspace ve Pano seviyesinde yönetilir.

---

# 3. Peki İstisnai Durumlar Nasıl Çözülecek?

Bazı durumlarda:

- Tek bir kartın
- Sadece belirli kişiler tarafından
- İzole şekilde görülmesi

istenebilir.

Örnek:

- İnsan kaynakları görevi
- Finans kartı
- Yöneticiye özel iş
- Firma dışı danışman erişimi
- Gizli müşteri kartı

Bu durumda klasik çözüm:

```txt
Kart bazlı yetki
```

olur.

Fakat bu sistem bunu tercih etmez.

Bunun yerine:

# Kart Yansıtma (Mirror Card)

yaklaşımı kullanılır.

---

# 4. Kart Yansıtma (Mirror Card) Nedir?

Kart yansıtma:

> Aynı kartın farklı bir pano içerisinde görünmesidir.

Burada önemli nokta:

```txt
Yeni kart oluşturulmaz.
```

Sistemde TEK kart vardır.

Sadece farklı panolarda görünür.

---

## Mantık

Örneğin:

```txt
Pano A
 └── Finans Raporu Kartı
```

Bu kart:

```txt
Pano B
```

içerisine yansıtılır.

Sonuç:

```txt
Pano A → Kart görünür
Pano B → Aynı kart görünür
```

Ama aslında:

```txt
Tek veri kaynağı vardır.
```

---

# 5. Yansıtılmış Kart Nasıl Çalışır?

## Yapılan tüm işlemler ortaktır

Örneğin:

- Açıklama değişirse
- Yorum eklenirse
- Dosya yüklenirse
- Durum değişirse
- Checklist güncellenirse

bunların tamamı:

```txt
Ana karta eş zamanlı yansır.
```

Çünkü sistemde:

```txt
2 kart yoktur.
```

Tek kart vardır.

---

# 6. Bu Yapının Avantajı Nedir?

## 6.1 Ana Yetki Sistemi Basit Kalır

Hala sistemin temel kuralı korunur:

```txt
Yetki sadece pano seviyesindedir.
```

Kart bazlı ACL / permission sistemi oluşmaz.

Bu çok büyük avantajdır.

---

## 6.2 Gizlilik Sağlanır

Kullanıcı:

- Ana panoyu görmez
- Ana listedeki diğer kartları görmez
- Sadece yansıtılan kartı görür

Bu sayede:

```txt
İzole çalışma alanı hissi oluşur.
```

---

## 6.3 Teknik Karmaşıklık Azalır

Kart bazlı permission yerine:

```txt
Board visibility
```

kullanılır.

Bu çok daha yönetilebilir yapı oluşturur.

---

# 7. Yansıtma ile Kart Yetkilendirme Arasındaki Fark

## Kart Bazlı Yetkilendirme

```txt
Kart → kullanıcı listesi
```

Problemler:

- Çok fazla edge-case
- Karışık görünürlük kuralları
- Zor bakım
- Karmaşık sorgular
- UX belirsizliği

---

## Kart Yansıtma

```txt
Kart → başka panoda görünür
```

Avantajlar:

- Ana sistem sade kalır
- Yetki modeli değişmez
- Kullanıcı davranışı daha anlaşılır olur
- Gizlilik korunur
- Teknik bakım kolaylaşır

---

# 8. UX Önerisi

Kart üzerinde sağ tık menüsü:

```txt
• Taşı
• Kopyala
• Arşivle
• Yansıt
```

---

## "Yansıt" Akışı

Kullanıcı:

```txt
Kart → Yansıt
```

der.

Sonrasında:

```txt
Hangi panoda görünsün?
```

seçilir.

Sistem:

```txt
Kartın yansımasını oluşturur.
```

---

# 9. Yansıtılmış Kart UI Davranışı

Kart üzerinde küçük bir badge olabilir:

```txt
Yansıtıldı
```

veya:

```txt
Mirror
```

Ayrıca:

```txt
Bu kart başka panolarda da görünüyor
```

bilgisi verilebilir.

---

# 10. Teknik Yaklaşım Önerisi

## Önerilen Mantık

Kart tablosu:

```txt
cards
```

Yansıtma ilişkisi:

```txt
card_mirrors
```

Örnek:

| cardId | boardId |
| ------ | ------- |
| 123    | A       |
| 123    | B       |
| 123    | C       |

Burada:

```txt
123
```

tek karttır.

Ama:

- A panosunda görünür
- B panosunda görünür
- C panosunda görünür

---

# 11. Bu Yaklaşımın En Büyük Kazancı

Sistem:

## Başlangıçta sade kalır

ama

## Gelecekte büyümeye hazır olur.

Bu çok önemlidir.

Çünkü küçük ekipler başlangıçta:

- Basitlik ister

ama zamanla:

- Departmanlaşır
- Gizlilik ister
- Dış kullanıcı ekler
- Yetki ihtiyaçları artar

Mirror yaklaşımı:

```txt
Kart bazlı permission sistemine geçmeden
```

bu ihtiyacı çözebilir.

---

# 12. Nihai Mimari Kararı

## Ana Kural

```txt
Yetki:
Workspace + Pano seviyesinde yönetilir.
```

---

## İstisnai Durum Çözümü

```txt
Kart bazlı permission yerine:
Kart Yansıtma kullanılır.
```

---

# 13. Özet

| Özellik            | Kart Yetkilendirme | Kart Yansıtma |
| ------------------ | ------------------ | ------------- |
| Teknik Karmaşıklık | Yüksek             | Düşük         |
| UX Karmaşıklığı    | Yüksek             | Düşük         |
| Gizlilik           | Var                | Var           |
| Bakım Kolaylığı    | Zor                | Kolay         |
| Ölçeklenebilirlik  | Riskli             | Güçlü         |
| Öğrenilebilirlik   | Zor                | Kolay         |
| Sistem Tutarlılığı | Düşük              | Yüksek        |

---

# Sonuç

Bu yaklaşım sayesinde sistem:

- Küçük ekipler için sade
- Öğrenmesi kolay
- Teknik olarak yönetilebilir
- Geleceğe hazır
- Gizlilik destekleyen
- Trello benzeri yalın UX’e sahip

bir yapıda kalabilir.
