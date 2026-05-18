import { Redirect } from 'expo-router';

/**
 * Merkezi "Ekle" tab'ı için placeholder route — DEM-203.
 *
 * Bu ekran asla görünmez: tab bar'daki `CreateTabButton` `onPress`'i tab
 * navigasyonunu intercept eder (`router.push` ile Hızlı Notlar'a gider) ve
 * `onLongPress` oluşturma menüsünü açar. `<Tabs>` yine de geçerli bir
 * `default export` bekler; yine de bir kullanıcı buraya düşerse (örn. derin
 * bağlantı) sessizce "Panolar" sekmesine yönlendirilir.
 */
export default function CreateTabPlaceholder() {
  return <Redirect href="/(app)/(boards)" />;
}
