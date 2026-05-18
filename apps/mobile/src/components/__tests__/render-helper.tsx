/**
 * Faz 7N — bileşen testleri için ince render sarmalayıcısı.
 *
 * `react-native` → `react-native-web` alias'ı sayesinde RN bileşenleri
 * gerçek DOM ağacına render edilir; bu yüzden sorgu/etkileşim katmanı
 * `@testing-library/react`'tir. Şu an ek bir provider gerekmez (test edilen
 * bileşenler saf presentational); ileride bir tema/query provider eklenirse
 * tüm testlerin tek noktadan sarılması için bu dosya kullanılır.
 */
export { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
