# LocalFlow

LocalFlow, PNG/JPEG/WebP görsellerini tarayıcı içinde toplu işler. Dosyalar sunucuya gönderilmez.

[English](README.md) · [Hazır tarifler](examples/README.md) · [Katkı rehberi](CONTRIBUTING.md)

## Başlatma

Windows'ta `start-localflow.cmd` dosyasını çalıştır. Node.js 22.13+ gerekir. Ardından **http://localhost:4318** adresini aç.

Geliştirme için:

```sh
git clone https://github.com/enestanerr/LocalFlow.git
cd LocalFlow
npm ci
npm run dev -- --port 4318
```

## İlk kullanım

1. Dosyalarını sürükle veya **Try 3 sample images** düğmesini kullan.
2. Ortadaki işlem kartını seç; sağ panelden ayarları değiştir.
3. İşlemleri sürükleyerek veya oklarla sırala. İstemediğin adımı anahtarla kapat.
4. **Live preview** bölümünden gerçek çıktı boyutunu ve görünümünü karşılaştır.
5. **Process images** → **Download ZIP** ile sonuçları al.

**Save:** cihazda favori tarif. **Import:** JSON tarifi içe aktar. **Share:** ayarları içeren bağlantı veya JSON dosyası. Paylaşımda görseller bulunmaz; localhost bağlantısı başka bilgisayarda bu uygulamayı açmaz.

## Sınırlar

100 dosya, toplam 200 MB; dosya başına 32 MB; kenar başına 8192 piksel, toplam 24 megapiksel. Animasyonlu PNG/WebP desteklenmez. Orijinal dosyalar değiştirilmez. JPEG şeffaflığı seçilen arka planla doldurur. Kaynak EXIF/GPS etiketleri yeni çıktıya kopyalanmaz; renk profili korunumu garanti edilmez.

Dosyalar yalnızca açık sekmenin belleğinde tutulur. Son geçerli tarif cihazda geri yüklenir. Uygulama tamamen yüklendikten sonra işleme ve indirme için internet gerekmez; çevrimdışı yeniden açılma özelliği yoktur.

Arayüz, GitHub'daki uluslararası hedef kitle için İngilizce hazırlanmıştır. Teknik bilgiler ve katkı rehberi `README.md` dosyasındadır.

Tüm geliştirme kontrolleri için `npm run check` çalıştır. Otomatik kontrollerin kapsamı ve henüz tamamlanmamış tarayıcı kontrolleri [doğrulama belgesinde](docs/VALIDATION.md) açıklanır.
