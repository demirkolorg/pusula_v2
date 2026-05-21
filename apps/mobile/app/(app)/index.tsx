import { Redirect } from 'expo-router';

/**
 * `(app)` grubunun explicit index route'u — cold-start yönlendirmesi.
 *
 * DEM-241 kök neden (2026-05-21, 4. tur — kaynak-kodlu analiz): cold-start'ta
 * uygulama `/` yoluyla açılır; expo-router `getStateFromPath('/')` →
 * `matchForEmptyPath()` boş yola uyan **ilk index leaf**'ini seçer. `(account)`,
 * `(boards)`, `(notifications)` index route'ları sıralama açısından eşittir;
 * Metro dosyaları **alfabetik** sıraladığı için (`(account)` < `(boards)`)
 * her zaman `(account)` seçilirdi. `unstable_settings`/`initialRouteName`/
 * `backBehavior` bu seçimi DEĞİŞTİRMEZ — yalnız history'ye prepend yaparlar.
 *
 * Bu dosya `(app)` layout'una grupsuz, otoriter bir `index` route'u ekler →
 * `/` artık üç grup-index arasında belirsiz kalmaz, doğrudan buraya çözülür;
 * `<Redirect>` mount anında ilk tab'a (`(boards)`) `replace` eder. Tab bar'da
 * görünmez (`_layout.tsx` `<Tabs.Screen name="index" href={null}>`).
 */
export default function AppIndexRedirect() {
  return <Redirect href="/(app)/(boards)" />;
}
