# Plan Masası: Kurulum Rehberi

Toplam süre: yaklaşık 20 dakika. Her şey ücretsiz, kredi kartı gerekmiyor.

Not: `index.html` dosyasına çift tıklayınca uygulama açılmaz, çünkü tarayıcılar bu tür uygulamaları sadece bir web adresinden çalıştırır. 2. adımda site yayınlandıktan sonra, Firebase bilgileri girilmemiş olsa bile uygulama **demo modunda** açılır. Demo modunda veriler sadece o tarayıcıda durur.

---

## 1. Firebase (veriler ve giriş)

1. https://console.firebase.google.com adresine Google hesabınla gir.
2. **Proje oluştur** (Create a project). Ad: `plan-masasi`. Google Analytics'i **kapat**, projeyi oluştur.
3. Sol menüde **Build → Authentication → Get started**.
   - **Sign-in method** sekmesinde **Email/Password**'ü aç ve kaydet.
   - **Users** sekmesinde **Add user**: kendi e-postanı ve en az 8 karakterlik bir şifre gir. Uygulamaya bu bilgilerle gireceksin.
4. Sol menüde **Build → Firestore Database → Create database**.
   - Konum olarak `eur3 (europe)` seç, **production mode** ile oluştur.
   - **Rules** sekmesine geç. Oradaki her şeyi sil, `firestore.rules` dosyasının içeriğini yapıştır.
   - İçindeki `SENIN_EPOSTAN@ornek.com` yazısını 3. adımda girdiğin e-postayla değiştir ve **Publish**'e bas.
5. Sol üstteki dişli simgesi → **Project settings → General**. Aşağıdaki **Your apps** bölümünde web simgesine (`</>`) tıkla.
   - Uygulama adı: `Plan Masası`. "Firebase Hosting" kutusunu **işaretleme**. **Register app**'e bas.
   - Ekranda çıkan `firebaseConfig = { ... }` bilgilerini kopyala.
   - Bu bilgileri `firebase-config.js` dosyasındaki boş alanlara yapıştır ya da Claude'a gönder, o yerleştirsin. Bu bilgiler gizli değil, sitede görünmeleri sorun değil. Güvenliği 4. adımdaki kurallar sağlıyor.

## 2. GitHub Pages (sitenin yayınlanması)

1. https://github.com adresinde ücretsiz hesap aç.
2. Sağ üstte **+ → New repository**. Ad: `plan-masasi`, **Public** seç, **Create repository**'ye bas.
3. Açılan sayfada **uploading an existing file** bağlantısına tıkla. Bu klasördeki **tüm dosyaları** (icons klasörüyle birlikte) sürükleyip bırak, **Commit changes**'e bas.
4. Repo içinde **Settings → Pages**. **Source: Deploy from a branch**, **Branch: main**, klasör `/ (root)` seç ve **Save**'e bas.
5. 1-2 dakika sonra siten şu adreste açılır: `https://KULLANICI-ADIN.github.io/plan-masasi/`

## 3. Siteyi Firebase'e tanıt

Firebase konsolunda **Authentication → Settings → Authorized domains → Add domain** yolunu izle ve `KULLANICI-ADIN.github.io` ekle. Bunu yapmazsan giriş çalışmaz.

## 4. Cihazlara ekle

Siteyi her cihazda bir kere aç ve giriş yap. Oturum açık kalır.

- **iPhone / iPad (Safari):** Paylaş butonu → **Ana Ekrana Ekle**
- **Android (Chrome):** ⋮ menüsü → **Uygulamayı yükle** ya da **Ana ekrana ekle**
- **Bilgisayar (Chrome / Edge):** Adres çubuğunun sağındaki yükle simgesi → **Yükle**

Uygulama, normal bir uygulama gibi simgesiyle tam ekran açılır.

---

## Sonradan güncelleme yapmak

Değişen dosyaları GitHub'da repoya tekrar yükle (aynı isimle üstüne yazılır). `sw.js` içindeki `planmasasi-v1` sürümünü bir artır, örneğin `planmasasi-v2`. Cihazlar yeni sürümü bir sonraki açılışta alır.

## Yedek

Uygulamada **⚙ Ayarlar → Yedek indir** ile tüm verilerini tek dosya olarak indirebilirsin. Ara sıra yedek almanı öneririm.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Sayfa iskeleti, giriş ekranı |
| `app.js` | Takvim, hedefler, tekrarlar, sürükle-bırak |
| `store.js` | Firebase bağlantısı ve demo modu |
| `styles.css` | Tasarım (açık ve koyu tema) |
| `firebase-config.js` | Firebase proje bilgileri (kurulumda doldurulur) |
| `firestore.rules` | Veri güvenlik kuralları (Firebase konsoluna yapıştırılır) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Ana ekrana ekleme ve internetsiz açılma |
