import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from './supabase';

const BASLIK = 'Akola Makola';
const OZET_SAATLERI = [9, 13, 19];
const OZET_GUN = 7;
const SAATSIZ_SAAT = 9;
// iOS en fazla 64 bekleyen bildirim tutar
const IOS_LIMIT = 64;

function saatliMi(d: Date) {
  // Eski kayıtlar UTC gece yarısında (TR'de 03:00): onlar da saatsiz
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return false;
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

function bugunIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function zamanlariGetir(): Promise<number[]> {
  const bugun = bugunIso();
  const bugunBaslangic = new Date();
  bugunBaslangic.setHours(0, 0, 0, 0);
  const yediGunOnce = new Date(Date.now() - 7 * 86400000).toISOString();

  const [gorevler, takipler, iletisimYok, gecikmisGorev, gecikmisTakip] = await Promise.all([
    supabase.from('musteri_gorevler').select('hedef_tarih')
      .eq('tamamlandi', false)
      .gte('hedef_tarih', bugunBaslangic.toISOString())
      .order('hedef_tarih', { ascending: true })
      .limit(IOS_LIMIT),
    supabase.from('musteriler').select('takip_tarihi')
      .eq('durum', 'Aktif')
      .gte('takip_tarihi', bugun)
      .order('takip_tarihi', { ascending: true })
      .limit(IOS_LIMIT),
    supabase.from('musteriler').select('id', { count: 'exact', head: true })
      .eq('durum', 'Aktif')
      .lt('guncelleme_tarihi', yediGunOnce),
    supabase.from('musteri_gorevler').select('id', { count: 'exact', head: true })
      .eq('tamamlandi', false)
      .lt('hedef_tarih', new Date().toISOString()),
    supabase.from('musteriler').select('id', { count: 'exact', head: true })
      .eq('durum', 'Aktif')
      .lt('takip_tarihi', bugun),
  ]);
  const hata = gorevler.error || takipler.error || iletisimYok.error || gecikmisGorev.error || gecikmisTakip.error;
  if (hata) throw hata;

  const zamanlar: number[] = [];

  for (const g of gorevler.data ?? []) {
    const d = new Date(g.hedef_tarih);
    if (!saatliMi(d)) d.setHours(SAATSIZ_SAAT, 0, 0, 0);
    zamanlar.push(d.getTime());
  }

  for (const m of takipler.data ?? []) {
    const [y, mo, g] = m.takip_tarihi.split('-').map(Number);
    zamanlar.push(new Date(y, mo - 1, g, SAATSIZ_SAAT, 0, 0, 0).getTime());
  }

  if ((iletisimYok.count ?? 0) + (gecikmisGorev.count ?? 0) + (gecikmisTakip.count ?? 0) > 0) {
    for (let gun = 0; gun < OZET_GUN; gun++) {
      for (const saat of OZET_SAATLERI) {
        const d = new Date();
        d.setDate(d.getDate() + gun);
        d.setHours(saat, 0, 0, 0);
        zamanlar.push(d.getTime());
      }
    }
  }

  const simdi = Date.now();
  // Aynı dakikadaki işler tek bildirim olur
  const dakikalar = new Set(zamanlar.filter(t => t > simdi).map(t => Math.floor(t / 60000)));
  return [...dakikalar].sort((a, b) => a - b).slice(0, IOS_LIMIT).map(dk => dk * 60000);
}

async function kur() {
  if (!Device.isDevice) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  const { status: mevcut } = await Notifications.getPermissionsAsync();
  const izin = mevcut === 'granted' ? mevcut : (await Notifications.requestPermissionsAsync()).status;
  if (izin !== 'granted') return;

  // Önce veri: internet yoksa hata atar, eski kurulu bildirimler silinmez
  const zamanlar = await zamanlariGetir();

  await Notifications.cancelAllScheduledNotificationsAsync();
  await Promise.all(zamanlar.map(t => Notifications.scheduleNotificationAsync({
    content: { title: BASLIK, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(t) },
  })));
}

let calisiyor = false;
let tekrar = false;

export async function yerelBildirimleriYenile() {
  if (calisiyor) { tekrar = true; return; }
  calisiyor = true;
  try {
    do {
      tekrar = false;
      await kur();
    } while (tekrar);
  } catch {
    // Sonraki açılışta yeniden denenir
  } finally {
    calisiyor = false;
  }
}
