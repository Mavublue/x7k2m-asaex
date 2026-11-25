import type { ScrollViewRef, TextInputRef, ViewRef } from '../../lib/refTipleri';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Linking, Animated, Easing, Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import R2Image from '../../components/R2Image';
import { yerelBildirimleriYenile } from '../../lib/yerelBildirim';
import { Colors, Radius, Spacing } from '../../constants/theme';

// Jarvis: sohbet düzeni — ☰ ile sohbet listesi, ortada mesajlaşma, altta yazma kutusu.
// Komut → Jarvis okur ve ONAY KARTI hazırlar → onaylayınca kaydı BU oturum yapar (RLS).
// Jarvis'in hafızası = aynı sohbetin son 4 mesajı (jarvis_komut_al).
// Web karşılığı: ilan-web/app/panel/jarvis/page.tsx
type Sohbet = { id: string; baslik: string; guncelleme_at: string };
const SECILI_KEY = 'jarvis_secili_sohbet';

function kisaTarih(iso: string) {
  const d = new Date(iso);
  const bugun = new Date();
  if (d.toDateString() === bugun.toDateString()) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const dun = new Date(bugun); dun.setDate(bugun.getDate() - 1);
  if (d.toDateString() === dun.toDateString()) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function baslikUret(metin: string) {
  const t = metin.replace(/\s+/g, ' ').trim();
  return t.length > 40 ? t.slice(0, 40).trimEnd() + '…' : t;
}

type KartTur = 'not' | 'gorev' | 'ilan_gonder' | 'soru' | 'gorev_guncelle' | 'musteri_durum' | 'ilan_durum'
  | 'ilan_fiyat' | 'link_uzat' | 'musteri_ekle' | 'musteri_istek' | 'hafiza' | 'ilan_goster';
type Kart = {
  id: string; tur: KartTur; musteri_id: string | null;
  veri: any; durum: 'bekliyor' | 'onaylandi' | 'reddedildi'; duzenlendi: boolean;
};
type Komut = {
  id: string; metin: string; durum: 'bekliyor' | 'isleniyor' | 'hazir' | 'hata';
  cevap: string | null; hata: string | null; sure_ms: number | null; created_at: string;
  jarvis_kartlar: Kart[];
};
type IlanMini = { id: string; portfoy_no: string | null; baslik: string | null; fiyat: number | null; oda_sayisi: string | null; ilce: string | null; mahalle: string | null; fotograflar: string[] | null };
const ILAN_ALAN = 'id, portfoy_no, baslik, fiyat, oda_sayisi, ilce, mahalle, fotograflar';
// Jarvis ilanları [ilan:1293] diye yazar (# müşteri etiketiyle karışmasın) → ekranda kapak + başlık
const ILAN_RE = /\[ilan:\s*#?(\d+)\]/g;
const cevapIlanNolari = (t: string | null) => (t ? [...t.matchAll(ILAN_RE)].map(m => m[1]) : []);

const ROZET: Record<KartTur, string> = {
  not: '📝 Not', gorev: '📋 Görev', ilan_gonder: '🏠 İlan gönder', soru: '❓ Soru',
  gorev_guncelle: '📋 Görev', musteri_durum: '👤 Müşteri durumu', ilan_durum: '🏠 İlan durumu',
  ilan_fiyat: '💰 İlan fiyatı', link_uzat: '🔗 Link süresi', musteri_ekle: '👤 Yeni müşteri', musteri_istek: '🎯 Müşteri isteği',
  hafiza: '🧠 Hafıza', ilan_goster: '🏠 Uygun ilanlar',
};
// Onayda mevcut form dolu açılan kartlar (kurallar formda: etiket, telefon, istek)
const FORM_KART: KartTur[] = ['ilan_gonder', 'musteri_ekle', 'musteri_istek'];
const GOREV_ISLEM: Record<string, string> = { tamamla: 'Tamamlandı yap', ertele: 'Ertele', sil: 'Sil' };

const fiyatYaz = (f: number | null) => (f == null ? '—' : '₺' + Math.round(f).toLocaleString('tr-TR'));
function istekYaz(i: any) {
  if (!i) return '';
  const butce = (i.butce_min || i.butce_max) ? `${i.butce_min ? fiyatYaz(i.butce_min) : '—'} – ${i.butce_max ? fiyatYaz(i.butce_max) : '—'}` : null;
  return [i.satilik_kiralik, i.tip, butce, i.tercih_konum ? String(i.tercih_konum).split('|').join(', ') : null,
    i.min_oda ? `min ${i.min_oda}` : null].filter(Boolean).join(' · ');
}
function tarihYaz(iso: string, saatli: boolean) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })
    + (saatli ? ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '');
}

export default function JarvisEkran() {
  const [komutlar, setKomutlar] = useState<Komut[]>([]);
  const [musteriler, setMusteriler] = useState<Record<string, string>>({});
  const [ilanlar, setIlanlar] = useState<Record<string, IlanMini>>({});
  const [ilanNo, setIlanNo] = useState<Record<string, string>>({}); // portföy no → ilan id
  const [ilanPopup, setIlanPopup] = useState<{ id: string; veri: any | null } | null>(null);
  const [metin, setMetin] = useState('');
  const [gonderiyor, setGonderiyor] = useState(false);
  const [duzenle, setDuzenle] = useState<Record<string, any>>({});
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [yuklendi, setYuklendi] = useState(false);
  const [popup, setPopup] = useState<any | null>(null);
  const [sohbetler, setSohbetler] = useState<Sohbet[]>([]);
  const [secili, setSecili] = useState<string | null>(null); // null = yeni sohbet
  const [hazir, setHazir] = useState(false); // kayıtlı seçili sohbet okundu mu
  const [yanAcik, setYanAcik] = useState(false);
  const [adDegis, setAdDegis] = useState<{ id: string; baslik: string } | null>(null);
  const [hafizaAcik, setHafizaAcik] = useState(false);
  const [acikIsAcik, setAcikIsAcik] = useState(false);
  const [acikIsSayi, setAcikIsSayi] = useState<number | null>(null);
  const { acikIsler } = useLocalSearchParams<{ acikIsler?: string }>();
  useEffect(() => {  // bildirimden gelindiyse Açık İşler'i aç
    if (!acikIsler) return;
    router.setParams({ acikIsler: undefined });
    setAcikIsAcik(true);
  }, [acikIsler]);
  useFocusEffect(useCallback(() => {
    supabase.from('musteri_gorevler').select('id', { count: 'exact', head: true }).eq('tamamlandi', false)
      .then(({ count }) => setAcikIsSayi(count ?? 0));
  }, []));
  const [hafiza, setHafiza] = useState<{ id: string; metin: string }[]>([]);
  const [hafizaYeni, setHafizaYeni] = useState('');
  const scrollRef = useRef<ScrollViewRef>(null);
  const [alanH, setAlanH] = useState(0);
  const [alanW, setAlanW] = useState(0);
  const [altta, setAltta] = useState(true);
  const [odak, setOdak] = useState(false);
  const insets = useSafeAreaInsets();
  const kokRef = useRef<ViewRef>(null);
  const [kbPad, setKbPad] = useState(0);
  // Klavye: alttaki boşluk = ekranın altı ile klavyenin üstü arası (tab bar payı ölçümle düşer)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const ac = Keyboard.addListener('keyboardWillChangeFrame', e => {
      const ust = e.endCoordinates.screenY;
      kokRef.current?.measureInWindow((_x, y, _w, h) => setKbPad(Math.max(0, y + h - ust)));
    });
    const kapa = Keyboard.addListener('keyboardWillHide', () => setKbPad(0));
    const kapa2 = Keyboard.addListener('keyboardDidHide', () => setKbPad(0));
    return () => { ac.remove(); kapa.remove(); kapa2.remove(); };
  }, []);
  // Panel/pencere açılınca ya da ekrana dönünce boşluğu sıfırla
  useEffect(() => { if (yanAcik || hafizaAcik || popup) { Keyboard.dismiss(); setKbPad(0); } }, [yanAcik, hafizaAcik, popup]);
  useFocusEffect(useCallback(() => { setKbPad(0); }, []));

  const sohbetleriYukle = useCallback(async () => {
    const { data } = await supabase.from('jarvis_sohbetler').select('id, baslik, guncelleme_at')
      .order('guncelleme_at', { ascending: false }).limit(100);
    if (data) setSohbetler(data as Sohbet[]);
    return (data ?? []) as Sohbet[];
  }, []);

  // İlk açılış: son seçili sohbet (varsa), yoksa yeni sohbet
  useEffect(() => {
    (async () => {
      const [liste, kayitli] = await Promise.all([
        sohbetleriYukle(),
        AsyncStorage.getItem(SECILI_KEY).catch(() => null),
      ]);
      if (kayitli && liste.some(s => s.id === kayitli)) setSecili(kayitli);
      setHazir(true);
    })();
  }, [sohbetleriYukle]);

  useEffect(() => {
    if (!hazir) return;
    (secili ? AsyncStorage.setItem(SECILI_KEY, secili) : AsyncStorage.removeItem(SECILI_KEY)).catch(() => {});
  }, [secili, hazir]);

  // Jarvis'in hafızası: danışmanın kalıcı tercihleri (her komutta Jarvis'e gider)
  async function hafizaYukle() {
    const { data } = await supabase.from('jarvis_hafiza').select('id, metin').order('created_at');
    setHafiza(data ?? []);
  }
  async function hafizaEkle() {
    const m = hafizaYeni.trim();
    if (!m) return;
    const { error } = await supabase.from('jarvis_hafiza').insert({ metin: m.slice(0, 300) });
    if (error) { Alert.alert('Eklenemedi', error.message); return; }
    setHafizaYeni('');
    hafizaYukle();
  }
  function hafizaSil(id: string) {
    Alert.alert('Hafızadan silinsin mi?', undefined, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => { await supabase.from('jarvis_hafiza').delete().eq('id', id); hafizaYukle(); } },
    ]);
  }

  // Soru kartı seçeneğindeki / karttaki müşterinin kısa detayı (web'deki popup ile aynı veri)
  // ── İlan: kapak + başlık; basınca özet pencere ──
  async function ilanAc(id: string) {
    Keyboard.dismiss();
    setIlanPopup({ id, veri: null });
    const { data } = await supabase.from('ilanlar')
      .select('id, portfoy_no, baslik, fiyat, tip, kategori, oda_sayisi, metrekare, bulundugu_kat, kat_sayisi, bina_yasi, banyo_sayisi, konum, ilce, mahalle, aciklama, fotograflar, durum, musteri_gizle, denize_mesafe_m, ilan_ozellikler(ozellikler(ad))')
      .eq('id', id).single();
    setIlanPopup(p => (p && p.id === id ? { ...p, veri: data ?? { hata: true } } : p));
  }
  function ilanSatir(id: string, ek?: ReactNode, sag?: ReactNode) {
    const il = ilanlar[id];
    return (
      <Pressable key={id} onPress={() => ilanAc(id)} style={styles.ilanSatir}>
        {il?.fotograflar?.[0]
          ? <R2Image source={il.fotograflar[0]} style={styles.ilanSatirFoto} resizeMode="cover" size="sm" />
          : <View style={[styles.ilanSatirFoto, styles.ilanBos]}><Text>🏠</Text></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.ilanBaslik} numberOfLines={2}>{il?.baslik ?? '…'}</Text>
          <Text style={[styles.soluk, { fontSize: 12 }]} numberOfLines={1}>
            {il?.fiyat ? <Text style={{ color: J.cyan, fontWeight: '700' }}>{fiyatYaz(il.fiyat)}</Text> : null}{ek ? <> · {ek}</> : null}
          </Text>
        </View>
        {sag}
      </Pressable>
    );
  }
  function cevapGoster(t: string, hata: boolean) {
    const parca: ReactNode[] = [];
    const ids: string[] = [];
    let son = 0;
    for (const m of t.matchAll(ILAN_RE)) {
      const bas = m.index ?? 0;
      parca.push(t.slice(son, bas));
      const id = ilanNo[m[1]];
      if (id) {
        if (!ids.includes(id)) ids.push(id);
        parca.push(<Text key={bas} onPress={() => ilanAc(id)} style={{ color: J.mavi, fontWeight: '700', textDecorationLine: 'underline' }}>{ilanlar[id]?.baslik ?? `#${m[1]}`}</Text>);
      } else parca.push(`#${m[1]}`);
      son = bas + m[0].length;
    }
    parca.push(t.slice(son));
    return (
      <>
        <Text style={[styles.govde, hata && { color: '#f87171' }]}>{parca}</Text>
        {ids.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
            {ids.map(id => {
              const il = ilanlar[id];
              return (
                <Pressable key={id} onPress={() => ilanAc(id)} style={styles.ilanKart}>
                  {il?.fotograflar?.[0]
                    ? <R2Image source={il.fotograflar[0]} style={styles.ilanKartFoto} resizeMode="cover" size="sm" />
                    : <View style={[styles.ilanKartFoto, styles.ilanBos]}><Text>🏠</Text></View>}
                  <Text style={[styles.ilanBaslik, { paddingHorizontal: 8, paddingTop: 6 }]} numberOfLines={2}>{il?.baslik}</Text>
                  <Text style={{ color: J.cyan, fontWeight: '700', fontSize: 12, paddingHorizontal: 8, paddingBottom: 8 }}>{il?.fiyat ? fiyatYaz(il.fiyat) : ''}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </>
    );
  }

  async function musteriAc(id: string) {
    setPopup({ id, _yukleniyor: true });
    const [{ data: m }, { data: rpc }, { data: istekler }] = await Promise.all([
      supabase.from('musteriler').select('id, ad, soyad, etiketler, durum, musteri_tipi, telefon').eq('id', id).maybeSingle(),
      supabase.rpc('get_musteri_detay', { mid: id }),
      supabase.from('musteri_istekler').select('*').eq('musteri_id', id),
    ]);
    if (!m) { setPopup(null); Alert.alert('Müşteri bulunamadı'); return; }
    setPopup({
      ...m,
      notlar: (((rpc as any)?.notlar ?? []) as any[]).slice(0, 5),
      iletisim: (((rpc as any)?.iletisim ?? []) as any[]),
      istekler: (istekler ?? []) as any[],
    });
  }

  const yukle = useCallback(async () => {
    if (!secili) { setKomutlar([]); setYuklendi(true); return; }
    const { data } = await supabase.from('jarvis_komutlar')
      .select('id, metin, durum, cevap, hata, sure_ms, created_at, jarvis_kartlar(id, tur, musteri_id, veri, durum, duzenlendi)')
      .eq('sohbet_id', secili)
      .order('created_at', { ascending: true }).limit(200);
    setYuklendi(true);
    if (!data) return;
    const liste = data as unknown as Komut[];
    setKomutlar(liste);
    const kartlar = liste.flatMap(k => k.jarvis_kartlar ?? []);
    const mIds = [...new Set(kartlar.map(k => k.musteri_id).filter(Boolean) as string[])];
    const iIds = [...new Set([
      ...kartlar.filter(k => k.tur === 'ilan_gonder').flatMap(k => k.veri?.ilan_ids ?? []),
      ...kartlar.filter(k => k.tur === 'ilan_goster').flatMap(k => (k.veri?.eksik ?? []).map((e: any) => e.id)),
      ...kartlar.filter(k => k.tur === 'ilan_durum' || k.tur === 'ilan_fiyat').map(k => k.veri?.ilan_id),
    ].filter(Boolean))] as string[];
    const nolar = [...new Set(liste.flatMap(k => cevapIlanNolari(k.cevap)))];
    if (mIds.length) {
      const { data: m } = await supabase.from('musteriler').select('id, ad, soyad').in('id', mIds);
      if (m) setMusteriler(p => ({ ...p, ...Object.fromEntries(m.map(x => [x.id, [x.ad, x.soyad].filter(Boolean).join(' ')])) }));
    }
    const ilanEkle = (il: IlanMini[] | null) => {
      if (!il?.length) return;
      setIlanlar(p => ({ ...p, ...Object.fromEntries(il.map(x => [x.id, x])) }));
      setIlanNo(p => ({ ...p, ...Object.fromEntries(il.filter(x => x.portfoy_no).map(x => [String(x.portfoy_no), x.id])) }));
    };
    if (iIds.length) ilanEkle((await supabase.from('ilanlar').select(ILAN_ALAN).in('id', iIds)).data as IlanMini[] | null);
    if (nolar.length) ilanEkle((await supabase.from('ilanlar').select(ILAN_ALAN).in('portfoy_no', nolar)).data as IlanMini[] | null);
  }, [secili]);

  useFocusEffect(useCallback(() => {
    if (!hazir) return;
    yukle();
    sohbetleriYukle();
  }, [hazir, yukle, sohbetleriYukle]));

  // Yeni mesaj / cevap gelince alta kay
  const imza = komutlar.map(k => k.id + k.durum).join('|');
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [imza]);

  const calisiyor = komutlar.some(k => k.durum === 'bekliyor' || k.durum === 'isleniyor');
  useEffect(() => {
    if (!calisiyor) return;
    const t = setInterval(yukle, 1500);
    return () => clearInterval(t);
  }, [calisiyor, yukle]);

  async function komutGonder(yazi: string) {
    const t = yazi.trim();
    if (!t || gonderiyor) return;
    setGonderiyor(true);
    try {
      let sid = secili;
      if (!sid) {
        const { data: s, error: e1 } = await supabase.from('jarvis_sohbetler').insert({ baslik: baslikUret(t) }).select('id').single();
        if (e1 || !s) { Alert.alert('Sohbet açılamadı', e1?.message ?? ''); return; }
        sid = s.id as string;
      }
      const { error } = await supabase.from('jarvis_komutlar').insert({ metin: t, sohbet_id: sid });
      if (error) { Alert.alert('Gönderilemedi', error.message); return; }
      setMetin('');
      if (sid !== secili) setSecili(sid); else await yukle();
      sohbetleriYukle();
    } finally {
      setGonderiyor(false);
    }
  }

  function yeniSohbet() {
    setSecili(null);
    setYanAcik(false);
    setMetin('');
  }

  function sohbetIslem(s: Sohbet) {
    Alert.alert(s.baslik, undefined, [
      { text: 'Yeniden adlandır', onPress: () => setAdDegis({ id: s.id, baslik: s.baslik }) },
      {
        text: 'Sil', style: 'destructive', onPress: () => Alert.alert('Sohbet silinsin mi?', s.baslik, [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Sil', style: 'destructive', onPress: async () => {
              const { error } = await supabase.from('jarvis_sohbetler').delete().eq('id', s.id);
              if (error) { Alert.alert('Silinemedi', error.message); return; }
              if (secili === s.id) setSecili(null);
              sohbetleriYukle();
            },
          },
        ]),
      },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  async function adKaydet() {
    if (!adDegis) return;
    const b = adDegis.baslik.trim();
    if (b) await supabase.from('jarvis_sohbetler').update({ baslik: b.slice(0, 120) }).eq('id', adDegis.id);
    setAdDegis(null);
    sohbetleriYukle();
  }

  async function kartKarar(kart: Kart, durum: 'onaylandi' | 'reddedildi', duzenlendi = false) {
    await supabase.from('jarvis_kartlar').update({ durum, duzenlendi, karar_at: new Date().toISOString() }).eq('id', kart.id);
  }

  async function onayla(kart: Kart) {
    if (kart.tur === 'ilan_gonder') {
      // Mevcut paylaş penceresi kartın ilanları + müşterisiyle açılır; link oluşunca kart onaylanır
      router.navigate({ pathname: '/(tabs)/ilanlar', params: { jarvisKart: kart.id } });
      return;
    }
    if (kart.tur === 'musteri_ekle') {
      // Yeni müşteri formu dolu açılır; kaydedilince kart onaylanır
      router.push({ pathname: '/musteri/ekle', params: { jarvisKart: kart.id } } as any);
      return;
    }
    if (kart.tur === 'musteri_istek') {
      router.push({ pathname: '/musteri/[id]', params: { id: kart.musteri_id!, jarvisKart: kart.id } } as any);
      return;
    }
    setMesgul(kart.id);
    try {
      const d = duzenle[kart.id];
      if (kart.tur === 'not') {
        const icerik = (d?.metin ?? kart.veri.metin ?? '').trim();
        if (!icerik || !kart.musteri_id) return;
        const { error } = await supabase.from('musteri_notlar').insert({ musteri_id: kart.musteri_id, icerik, tarih: new Date().toISOString() });
        if (error) { Alert.alert('Not eklenemedi', error.message); return; }
      } else if (kart.tur === 'gorev') {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const baslik = (d?.baslik ?? kart.veri.baslik ?? '').trim();
        if (!baslik) return;
        const { error } = await supabase.from('musteri_gorevler').insert({
          baslik, hedef_tarih: d?.hedef_tarih ?? kart.veri.hedef_tarih, user_id: session.user.id, tamamlandi: false, kaynak: 'jarvis',
          ...(kart.musteri_id ? { musteri_id: kart.musteri_id } : {}),
        });
        if (error) { Alert.alert('Görev eklenemedi', error.message); return; }
        yerelBildirimleriYenile();
      } else {
        const hata = await tekDokunus(kart);
        if (hata) { Alert.alert('Yapılamadı', hata); return; }
        if (kart.tur === 'gorev_guncelle') yerelBildirimleriYenile();
      }
      await kartKarar(kart, 'onaylandi', !!d);
      setDuzenle(p => { const n = { ...p }; delete n[kart.id]; return n; });
      await yukle();
    } finally {
      setMesgul(null);
    }
  }

  // A grubu: tek dokunuşla kayıt (kurallar DB tetikleyicilerinde: pasif→gizle, fiyat düştü bildirimi, tamamlanma tarihi)
  async function tekDokunus(kart: Kart): Promise<string | null> {
    const v = kart.veri;
    if (kart.tur === 'gorev_guncelle') {
      const q = supabase.from('musteri_gorevler');
      const { error } = v.islem === 'sil' ? await q.delete().eq('id', v.gorev_id)
        : v.islem === 'tamamla' ? await q.update({ tamamlandi: true }).eq('id', v.gorev_id)
        : await q.update({ hedef_tarih: v.hedef_tarih }).eq('id', v.gorev_id);
      return error?.message ?? null;
    }
    if (kart.tur === 'musteri_durum') {
      const { error } = await supabase.from('musteriler').update({ durum: v.durum }).eq('id', kart.musteri_id!);
      return error?.message ?? null;
    }
    if (kart.tur === 'ilan_durum' || kart.tur === 'ilan_fiyat') {
      const alan = kart.tur === 'ilan_durum' ? { durum: v.durum } : { fiyat: v.fiyat };
      const { error } = await supabase.from('ilanlar').update(alan).eq('id', v.ilan_id);
      return error?.message ?? null;
    }
    if (kart.tur === 'link_uzat') {
      // Müşteri detayındaki "Süreyi Uzat" ile aynı: token + o token'ın paketleri
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return 'oturum yok';
      const yeniIso = new Date(Date.now() + Number(v.sure_saat) * 3600 * 1000).toISOString();
      const { data: tk } = await supabase.from('musteri_tokenler').select('token')
        .eq('user_id', session.user.id).eq('musteri_id', kart.musteri_id!).maybeSingle();
      if (!tk) return 'müşterinin linki yok';
      const { error } = await supabase.from('musteri_tokenler').update({ expires_at: yeniIso })
        .eq('user_id', session.user.id).eq('musteri_id', kart.musteri_id!);
      if (error) return error.message;
      await supabase.from('paylasim_paketleri').update({ expires_at: yeniIso })
        .eq('emlakci_id', session.user.id).eq('musteri_token', tk.token);
      return null;
    }
    if (kart.tur === 'hafiza') {
      const { error } = v.islem === 'sil'
        ? await supabase.from('jarvis_hafiza').delete().eq('id', v.hafiza_id)
        : await supabase.from('jarvis_hafiza').insert({ metin: String(v.metin).slice(0, 300) });
      return error?.message ?? null;
    }
    return 'bilinmeyen kart';
  }

  async function reddet(kart: Kart) {
    setMesgul(kart.id);
    await kartKarar(kart, 'reddedildi');
    await yukle();
    setMesgul(null);
  }

  async function secenekSec(kart: Kart, komut: string) {
    setMesgul(kart.id);
    await kartKarar(kart, 'onaylandi');
    await komutGonder(komut);
    setMesgul(null);
  }

  function kartGovde(kart: Kart) {
    const d = duzenle[kart.id];
    if (kart.tur === 'not') {
      return d ? (
        <TextInput value={d.metin} onChangeText={t => setDuzenle(p => ({ ...p, [kart.id]: { metin: t } }))}
          multiline style={styles.input} placeholderTextColor={Colors.outline} />
      ) : <Text style={styles.govde}>“{kart.veri.metin}”</Text>;
    }
    if (kart.tur === 'gorev') {
      if (d) {
        return (
          <View style={{ gap: 6 }}>
            <TextInput value={d.baslik} onChangeText={t => setDuzenle(p => ({ ...p, [kart.id]: { ...d, baslik: t } }))} style={styles.input} />
            <DateTimePicker value={new Date(d.hedef_tarih)} mode="datetime" locale="tr-TR" themeVariant="dark"
              onChange={(_, t) => { if (t) setDuzenle(p => ({ ...p, [kart.id]: { ...d, hedef_tarih: t.toISOString() } })); }} />
          </View>
        );
      }
      return (
        <View>
          <Text style={[styles.govde, { fontWeight: '700' }]}>{kart.veri.baslik}</Text>
          <Text style={styles.soluk}>🗓 {tarihYaz(kart.veri.hedef_tarih, !!kart.veri.saatli)}</Text>
        </View>
      );
    }
    if (kart.tur === 'gorev_guncelle') {
      return (
        <View>
          <Text style={[styles.govde, { fontWeight: '700' }]}>{kart.veri.baslik}</Text>
          <Text style={styles.soluk}>
            {GOREV_ISLEM[kart.veri.islem]}
            {kart.veri.eski_tarih ? ` · şu an ${tarihYaz(kart.veri.eski_tarih, true)}` : ''}
            {kart.veri.islem === 'ertele' ? ` → ${tarihYaz(kart.veri.hedef_tarih, !!kart.veri.saatli)}` : ''}
          </Text>
        </View>
      );
    }
    if (kart.tur === 'musteri_durum') {
      return <Text style={styles.govde}>{kart.veri.eski_durum ?? '—'} → <Text style={{ fontWeight: '700' }}>{kart.veri.durum}</Text></Text>;
    }
    if (kart.tur === 'ilan_durum' || kart.tur === 'ilan_fiyat') {
      const v = kart.veri;
      return (
        <View>
          {ilanlar[v.ilan_id] ? ilanSatir(v.ilan_id) : <Text style={styles.soluk}>{v.baslik} · {v.oda ?? ''} · {v.yer}</Text>}
          <Text style={[styles.govde, { marginTop: 4 }]}>
            {kart.tur === 'ilan_durum' ? `${v.eski_durum ?? '—'} → ` : `${fiyatYaz(v.eski_fiyat)} → `}
            <Text style={{ fontWeight: '700' }}>{kart.tur === 'ilan_durum' ? v.durum : fiyatYaz(v.fiyat)}</Text>
          </Text>
        </View>
      );
    }
    if (kart.tur === 'link_uzat') {
      const s = Number(kart.veri.sure_saat);
      return (
        <Text style={styles.govde}>
          {s % 24 === 0 ? `${s / 24} gün` : `${s} saat`} uzat
          {kart.veri.eski_bitis ? <Text style={styles.soluk}>{` · şu an bitiş ${tarihYaz(kart.veri.eski_bitis, true)}`}</Text> : null}
        </Text>
      );
    }
    if (kart.tur === 'musteri_ekle') {
      const v = kart.veri;
      return (
        <View>
          <Text style={[styles.govde, { fontWeight: '700' }]}>{[v.ad, v.soyad].filter(Boolean).join(' ')}{v.telefon ? <Text style={styles.soluk}>{` · ${v.telefon}`}</Text> : null}</Text>
          {!!v.istek && <Text style={styles.soluk}>🎯 {istekYaz(v.istek)}</Text>}
          {v.benzer?.length > 0 && <Text style={{ color: '#f59e0b', fontSize: 12, marginTop: 4 }}>⚠️ Benzer isim var: {v.benzer.join(', ')}</Text>}
        </View>
      );
    }
    if (kart.tur === 'hafiza') {
      return (
        <Text style={styles.govde}>
          {kart.veri.islem === 'sil' ? 'Unut: ' : 'Hatırla: '}<Text style={{ fontWeight: '700' }}>“{kart.veri.metin}”</Text>
        </Text>
      );
    }
    if (kart.tur === 'musteri_istek') {
      return (
        <Text style={styles.govde}>
          {kart.veri.islem === 'degistir' ? 'İsteği değiştir: ' : 'İstek ekle: '}<Text style={{ fontWeight: '700' }}>{istekYaz(kart.veri.istek)}</Text>
        </Text>
      );
    }
    if (kart.tur === 'ilan_goster') {
      const v = kart.veri;
      const L: any[] = v.ilanlar ?? [];
      const nt = L.filter(x => x.grup === 'tam').length;
      const nb = L.filter(x => x.grup === 'belki').length;
      const ng = L.filter(x => x.grup === 'gonderildi').length;
      const nz = L.filter(x => x.grup === 'benzer').length;
      const pay: string[] = v.paylasilan ?? [];
      return (
        <View style={{ gap: 3 }}>
          <Text style={styles.govde}>
            <Text style={{ fontWeight: '700', color: J.cyan }}>{L.length} ilan</Text>{nz ? ` · 🔁 ${nz} baktığına benzer` : ''} · {nt} tam uygun{nb ? ` · ${nb} belki beğenir` : ''}{ng ? ` · ${ng} daha önce gönderilmiş` : ''}
          </Text>
          {((v.gonderilmis > 0 && !ng) || !!v.kural) && (
            <Text style={[styles.soluk, { fontSize: 12 }]}>
              {[v.gonderilmis > 0 && !ng ? `${v.gonderilmis} gönderilmiş çıkarıldı` : '', v.kural ? `Kural: ${v.kural}` : ''].filter(Boolean).join(' · ')}
            </Text>
          )}
          {pay.length > 0 && <Text style={{ color: '#34d399', fontSize: 13 }}>✓ {pay.length} ilan paylaşıldı</Text>}
          {(v.eksik ?? []).length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={{ color: '#fbbf24', fontWeight: '700', fontSize: 12, marginBottom: 2 }}>⚠️ Eksik / tutarsız veri ({v.eksik_sayi ?? v.eksik.length})</Text>
              {(v.eksik as any[]).slice(0, 6).map(e => ilanSatir(e.id,
                <Text style={{ color: '#fbbf24' }}>{(e.sorun ?? []).join(', ')}</Text>,
                <Pressable onPress={() => router.push(`/ilan/${e.id}` as any)} hitSlop={8}>
                  <Text style={{ color: J.mavi, fontWeight: '700', fontSize: 12 }}>Düzelt →</Text>
                </Pressable>))}
            </View>
          )}
        </View>
      );
    }
    if (kart.tur === 'ilan_gonder') {
      const ids: string[] = kart.veri.ilan_ids ?? [];
      return (
        <View>
          {!!kart.veri.aciklama && <Text style={styles.soluk}>{kart.veri.aciklama}</Text>}
          {ids.map(id => {
            const il = ilanlar[id];
            return ilanSatir(id, il ? [il.oda_sayisi, il.mahalle].filter(Boolean).join(' · ') : null);
          })}
        </View>
      );
    }
    return (
      <View>
        <Text style={[styles.govde, { marginBottom: 8 }]}>{kart.veri.soru}</Text>
        {kart.durum === 'bekliyor' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(kart.veri.secenekler ?? []).map((s: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', gap: 2 }}>
                <Pressable disabled={mesgul === kart.id} onPress={() => secenekSec(kart, s.komut)} style={[styles.btn, { borderColor: J.mavi }]}>
                  <Text style={[styles.btnYazi, { color: J.mavi }]}>{s.etiket}</Text>
                </Pressable>
                {!!s.musteri_id && (
                  <Pressable onPress={() => musteriAc(s.musteri_id)} hitSlop={6} style={[styles.btn, { borderColor: J.mavi, paddingHorizontal: 10 }]}>
                    <Text style={styles.btnYazi}>👁</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  const sonKomut = komutlar[komutlar.length - 1];
  const sonHata = !calisiyor && sonKomut?.durum === 'hata';
  const buyukGoster = calisiyor || gonderiyor || sonHata;  // yeni sohbette büyük halka yerine rapor ekranı
  const orbDurum: OrbDurum = calisiyor || gonderiyor ? 'dusun' : sonHata ? 'hata' : 'bos';
  const orbBoyut = 150;
  const orbMerkez = alanH * 0.42;

  let sonGrup = '';

  return (
    <View style={[styles.ekran, { paddingTop: insets.top }]}>
      {/* Klavye boşluğu elle: KeyboardAvoidingView Modal açılıp kapanınca iPhone'da takılı kalıyordu */}
      <View ref={kokRef} style={{ flex: 1, paddingBottom: kbPad }}>
        {/* Üst şerit */}
        <LinearGradient colors={['rgba(34,211,238,0.09)', 'rgba(34,211,238,0)']} style={styles.ust}>
          <Pressable onPress={() => { Keyboard.dismiss(); sohbetleriYukle(); setYanAcik(true); }} hitSlop={8} style={styles.ustBtn}>
            <Text style={{ fontSize: 18, color: J.cyan }}>☰</Text>
          </Pressable>
          <Orb boyut={30} durum={calisiyor ? 'dusun' : sonHata ? 'hata' : 'bos'} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.logo}>J.A.R.V.I.S</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={[styles.nokta, { backgroundColor: calisiyor ? '#f97316' : sonHata ? '#ef4444' : '#34d399', shadowColor: calisiyor ? '#f97316' : sonHata ? '#ef4444' : '#34d399' }]} />
              <Text style={[styles.mono, { fontSize: 10.5, color: J.soluk }]}>{calisiyor ? 'İŞLENİYOR' : sonHata ? 'SORUN VAR' : 'ÇEVRİMİÇİ'}</Text>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 11.5, color: J.soluk }}>
                · {secili ? (sohbetler.find(s => s.id === secili)?.baslik ?? 'Jarvis') : 'Yeni sohbet'}
              </Text>
            </View>
          </View>
          <Pressable onPress={() => { Keyboard.dismiss(); setAcikIsAcik(true); }} hitSlop={8} style={[styles.ustBtn, { flexDirection: 'row', gap: 3, paddingHorizontal: 8, width: undefined }]}>
            <Text style={{ fontSize: 16 }}>📋</Text>
            {!!acikIsSayi && <Text style={[styles.mono, { fontSize: 11, color: '#fbbf24', fontWeight: '700' }]}>{acikIsSayi}</Text>}
          </Pressable>
          <Pressable onPress={yeniSohbet} hitSlop={8} style={styles.ustBtn}>
            <Text style={{ fontSize: 20, color: J.cyan, fontWeight: '700' }}>＋</Text>
          </Pressable>
        </LinearGradient>

        {/* Mesajlar: HUD ızgara zemin + büyük halka arkada */}
        <View style={{ flex: 1, backgroundColor: J.zemin, overflow: 'hidden' }}
          onLayout={e => { setAlanH(e.nativeEvent.layout.height); setAlanW(e.nativeEvent.layout.width); }}>
          <Izgara w={alanW} h={alanH} />
          <LinearGradient pointerEvents="none" colors={['rgba(34,211,238,0.10)', 'rgba(34,211,238,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 220 }} />
          {alanH > 0 && (
            <BuyukOrb gor={buyukGoster} boyut={orbBoyut} durum={orbDurum}
              style={{ top: orbMerkez - orbBoyut / 2, left: alanW / 2 - orbBoyut / 2 }} />
          )}

          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 16, gap: 16 }}
            keyboardShouldPersistTaps="handled" scrollEventThrottle={100}
            onScroll={e => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              setAltta(contentSize.height - contentOffset.y - layoutMeasurement.height < 80);
            }}
            onContentSizeChange={() => { if (secili) scrollRef.current?.scrollToEnd({ animated: false }); }}>
            {!!secili && yuklendi && !komutlar.length && <Text style={styles.soluk}>Bu sohbette mesaj yok.</Text>}
            {!secili && !gonderiyor && (
              <JarvisRapor musteriAc={musteriAc} ilanAc={ilanAc} acikIsAc={() => setAcikIsAcik(true)} komut={komutGonder} />
            )}

            {komutlar.map(k => {
              const isliyor = k.durum === 'bekliyor' || k.durum === 'isleniyor';
              return (
                <View key={k.id} style={{ gap: 6 }}>
                  {/* Kullanıcı */}
                  <View style={styles.balonBen}>
                    <Text style={{ color: '#eafcff', fontSize: 14 }}>{k.metin}</Text>
                  </View>
                  {/* Jarvis */}
                  <View style={[{ alignSelf: 'flex-start', maxWidth: '92%' }, (k.jarvis_kartlar ?? []).length ? { width: '92%' } : null]}>
                    <View style={styles.jEtiket}>
                      <Orb boyut={14} durum={isliyor ? 'dusun' : k.durum === 'hata' ? 'hata' : 'bos'} />
                      <Text style={[styles.mono, { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: J.cyan }]}>JARVIS</Text>
                    </View>
                    <View style={styles.balonJarvis}>
                      {isliyor ? <Nabiz><Text style={[styles.govde, { color: '#fb923c', fontWeight: '600' }]}>Analiz ediyorum…</Text></Nabiz>
                        : k.durum === 'hata' ? <Text style={[styles.govde, { color: '#f87171' }]}>⚠️ Yapamadım: {k.hata ?? ''}</Text>
                        : cevapGoster(k.cevap ?? '', false)}
                      {(k.jarvis_kartlar ?? []).map(kart => {
                        const renk = kart.durum === 'onaylandi' ? '#34d399' : kart.durum === 'reddedildi' ? '#64748b' : '#fbbf24';
                        return (
                          <HudKart key={kart.id} renk={renk} tara={kart.durum === 'bekliyor'} soluk={kart.durum === 'reddedildi'}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                              <Text style={[styles.govde, { flex: 1, fontSize: 12, fontWeight: '700', color: '#cfe3ee' }]}
                                onPress={kart.musteri_id ? () => musteriAc(kart.musteri_id!) : undefined}>
                                {ROZET[kart.tur]}{kart.musteri_id ? ` — ${musteriler[kart.musteri_id] ?? '…'} 👁` : ''}
                              </Text>
                              <Text style={[styles.mono, styles.kartDurum, { color: renk, borderColor: renk + '77' }]}>
                                {kart.tur === 'ilan_goster'
                                  ? (kart.durum === 'onaylandi' ? '✓ PAYLAŞILDI' : kart.durum === 'reddedildi' ? 'KAPATILDI' : 'BAKILACAK')
                                  : kart.durum === 'onaylandi' ? '✓ YAPILDI' : kart.durum === 'reddedildi' ? 'REDDEDİLDİ' : 'ONAY BEKLİYOR'}
                              </Text>
                            </View>
                            {kartGovde(kart)}
                            {kart.tur === 'ilan_goster' && (
                              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                                <Pressable onPress={() => router.navigate({ pathname: '/(tabs)/ilanlar', params: { jarvisGoster: kart.id } })}
                                  style={[styles.btn, { backgroundColor: '#34d399', borderColor: '#34d399' }]}>
                                  <Text style={[styles.btnYazi, { color: '#03121a' }]}>📋 İlanları Gör</Text>
                                </Pressable>
                                {kart.durum === 'bekliyor' && (
                                  <Pressable disabled={mesgul === kart.id} onPress={() => reddet(kart)} style={[styles.btn, { borderColor: J.soluk }]}>
                                    <Text style={[styles.btnYazi, { color: J.soluk }]}>Kapat</Text>
                                  </Pressable>
                                )}
                              </View>
                            )}
                            {kart.durum === 'bekliyor' && kart.tur !== 'soru' && kart.tur !== 'ilan_goster' && (
                              <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                                <Pressable disabled={mesgul === kart.id} onPress={() => onayla(kart)} style={[styles.btn, { backgroundColor: '#34d399', borderColor: '#34d399' }]}>
                                  <Text style={[styles.btnYazi, { color: '#03121a' }]}>{kart.tur === 'ilan_gonder' ? 'Gönder…' : FORM_KART.includes(kart.tur) ? 'Formu aç…' : 'Onayla'}</Text>
                                </Pressable>
                                {(kart.tur === 'not' || kart.tur === 'gorev') && !duzenle[kart.id] && (
                                  <Pressable disabled={mesgul === kart.id} style={[styles.btn, { borderColor: J.mavi }]}
                                    onPress={() => setDuzenle(p => ({ ...p, [kart.id]: kart.tur === 'not' ? { metin: kart.veri.metin } : { baslik: kart.veri.baslik, hedef_tarih: kart.veri.hedef_tarih } }))}>
                                    <Text style={[styles.btnYazi, { color: J.mavi }]}>Düzenle</Text>
                                  </Pressable>
                                )}
                                <Pressable disabled={mesgul === kart.id} onPress={() => reddet(kart)} style={[styles.btn, { borderColor: J.soluk }]}>
                                  <Text style={[styles.btnYazi, { color: J.soluk }]}>Reddet</Text>
                                </Pressable>
                              </View>
                            )}
                            {kart.durum === 'bekliyor' && kart.tur === 'soru' && (
                              <Pressable disabled={mesgul === kart.id} onPress={() => reddet(kart)} style={[styles.btn, { borderColor: J.soluk, marginTop: 8, alignSelf: 'flex-start' }]}>
                                <Text style={[styles.btnYazi, { color: J.soluk }]}>Vazgeç</Text>
                              </Pressable>
                            )}
                          </HudKart>
                        );
                      })}
                    </View>
                    <Text style={[styles.mono, styles.saat]}>
                      {new Date(k.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      {k.sure_ms != null ? ` · ⚡ ${(k.sure_ms / 1000).toFixed(1)} sn` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>


          {!altta && (
            <Pressable onPress={() => scrollRef.current?.scrollToEnd({ animated: true })} style={styles.asagi}>
              <Text style={{ color: J.cyan, fontSize: 16 }}>↓</Text>
            </Pressable>
          )}
        </View>

        {/* Yazma kutusu */}
        <View style={styles.yazAlan}>
          <View style={[styles.yaz, odak && { borderColor: 'rgba(34,211,238,0.6)', shadowOpacity: 0.35 }]}>
            <TextInput value={metin} onChangeText={setMetin} placeholder="Jarvis'e yaz…" placeholderTextColor="#4d6a80"
              onFocus={() => setOdak(true)} onBlur={() => setOdak(false)}
              multiline style={{ flex: 1, minHeight: 40, maxHeight: 120, color: J.yazi, fontSize: 15, paddingVertical: 8 }} />
            <GonderBtn aktif={!!metin.trim() && !gonderiyor} yukleniyor={gonderiyor} onPress={() => komutGonder(metin)} />
          </View>
        </View>
      </View>

      {/* Sohbet listesi (soldan açılan panel) */}
      <Modal visible={yanAcik} transparent animationType="fade" onRequestClose={() => setYanAcik(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <SafeAreaView style={styles.yan} edges={['top', 'bottom']}>
            <View style={{ flexDirection: 'row', gap: 6, padding: 12 }}>
              <Pressable onPress={yeniSohbet} style={[styles.yeniBtn, { flex: 1 }]}>
                <Text style={[styles.btnYazi, { color: J.cyan }]}>＋ Yeni sohbet</Text>
              </Pressable>
              <Pressable onPress={() => setYanAcik(false)} style={[styles.btn, { borderColor: J.soluk }]}>
                <Text style={[styles.btnYazi, { color: J.soluk }]}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}>
              {!sohbetler.length && <Text style={[styles.soluk, { padding: 12 }]}>Henüz sohbet yok.</Text>}
              {sohbetler.map(s => {
                const aktif = s.id === secili;
                const grup = grupAdi(s.guncelleme_at);
                const baslikGoster = grup !== sonGrup;
                sonGrup = grup;
                return (
                  <View key={s.id}>
                    {baslikGoster && <Text style={[styles.mono, styles.grup]}>{grup.toLocaleUpperCase('tr-TR')}</Text>}
                    <Pressable onPress={() => { setSecili(s.id); setYanAcik(false); }} onLongPress={() => sohbetIslem(s)}
                      style={[styles.sohbetSatir, aktif && { backgroundColor: 'rgba(34,211,238,0.13)' }]}>
                      {aktif && <View style={styles.aktifCizgi} />}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: aktif ? '700' : '500', color: aktif ? '#fff' : '#b9d3e3' }}>{s.baslik}</Text>
                        <Text style={[styles.mono, { fontSize: 10.5, color: J.soluk }]}>{kisaTarih(s.guncelleme_at)}</Text>
                      </View>
                      <Pressable onPress={() => sohbetIslem(s)} hitSlop={8} style={{ padding: 4 }}>
                        <Text style={{ color: J.soluk, fontSize: 16 }}>⋯</Text>
                      </Pressable>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => { setYanAcik(false); hafizaYukle(); setTimeout(() => setHafizaAcik(true), 350); }}
              style={[styles.btn, { borderColor: J.mavi, margin: 10, alignItems: 'center' }]}>
              <Text style={[styles.btnYazi, { color: J.mavi }]}>🧠 Hafıza</Text>
            </Pressable>
          </SafeAreaView>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,4,10,0.7)' }} onPress={() => setYanAcik(false)} />
        </View>
        {/* Yeniden adlandır (panelin içinde, iç içe Modal açmamak için) */}
        {!!adDegis && (
          <View style={[StyleSheet.absoluteFill, styles.perde]}>
            <View style={[styles.popup, { padding: 14, gap: 10 }]}>
              <Text style={[styles.govde, { fontWeight: '700' }]}>Sohbetin adı</Text>
              <TextInput autoFocus value={adDegis.baslik} onChangeText={t => setAdDegis({ id: adDegis.id, baslik: t })}
                onSubmitEditing={adKaydet} returnKeyType="done" style={styles.input} />
              <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-end' }}>
                <Pressable onPress={() => setAdDegis(null)} style={[styles.btn, { borderColor: J.soluk }]}>
                  <Text style={[styles.btnYazi, { color: J.soluk }]}>Vazgeç</Text>
                </Pressable>
                <Pressable onPress={adKaydet} style={[styles.btn, { backgroundColor: J.cyan, borderColor: J.cyan }]}>
                  <Text style={[styles.btnYazi, { color: '#03121a' }]}>Kaydet</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </Modal>

      <Modal visible={hafizaAcik} transparent animationType="fade" onRequestClose={() => setHafizaAcik(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.perde} onPress={() => setHafizaAcik(false)}>
            <Pressable style={styles.popup} onPress={() => {}}>
              <View style={styles.popupUst}>
                <Text style={[styles.govde, { flex: 1, fontSize: 16, fontWeight: '800' }]}>🧠 Jarvis'in hafızası</Text>
                <Pressable onPress={() => setHafizaAcik(false)} hitSlop={8}><Text style={[styles.soluk, { fontSize: 20 }]}>✕</Text></Pressable>
              </View>
              <Text style={[styles.soluk, { paddingHorizontal: 14, paddingTop: 10 }]}>
                Senin tercihlerin. Her komutta Jarvis'e gider. Müşteri bilgileri burada değil, notlarda.
              </Text>
              <ScrollView contentContainerStyle={{ padding: 14 }}>
                {!hafiza.length && <Text style={styles.soluk}>Henüz bir şey yok. Jarvis'e “bunu unutma: …” diyebilirsin.</Text>}
                {hafiza.map(h => (
                  <View key={h.id} style={[styles.satir, { marginBottom: 6 }]}>
                    <Text style={{ color: J.cyan }}>▸</Text>
                    <Text style={[styles.govde, { flex: 1 }]}>{h.metin}</Text>
                    <Pressable onPress={() => hafizaSil(h.id)} hitSlop={8}><Text>🗑</Text></Pressable>
                  </View>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: J.cizgi }}>
                <TextInput value={hafizaYeni} onChangeText={setHafizaYeni} placeholder="Yeni madde…" placeholderTextColor="#4d6a80"
                  maxLength={300} onSubmitEditing={hafizaEkle} returnKeyType="done" style={[styles.input, { flex: 1 }]} />
                <Pressable onPress={hafizaEkle} disabled={!hafizaYeni.trim()}
                  style={[styles.btn, { backgroundColor: J.cyan, borderColor: J.cyan, justifyContent: 'center', opacity: hafizaYeni.trim() ? 1 : 0.5 }]}>
                  <Text style={[styles.btnYazi, { color: '#03121a' }]}>Ekle</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <AcikIslerModal acik={acikIsAcik} kapat={() => setAcikIsAcik(false)} musteriAc={musteriAc} sayiDegisti={setAcikIsSayi} />

      <IlanOzetModal acik={ilanPopup} kapat={() => setIlanPopup(null)}
        detay={id => { setIlanPopup(null); router.push(`/ilan/${id}` as any); }} />

      <Modal visible={!!popup} transparent animationType="fade" onRequestClose={() => setPopup(null)}>
        <Pressable style={styles.perde} onPress={() => setPopup(null)}>
          <Pressable style={styles.popup} onPress={() => {}}>
            {popup?._yukleniyor ? (
              <View style={{ padding: 30, alignItems: 'center' }}><Orb boyut={60} durum="dusun" /></View>
            ) : popup && (
              <>
                <View style={styles.popupUst}>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.govde, { fontSize: 16, fontWeight: '800' }]}>{popup.ad} {popup.soyad ?? ''}</Text>
                    {!!popup.etiketler && <Text style={[styles.mono, styles.soluk]}>#{popup.etiketler}</Text>}
                    {!!popup.durum && <Text style={[styles.etiket, popup.durum === 'Aktif' && { color: '#34d399', backgroundColor: 'rgba(52,211,153,0.15)' }]}>{popup.durum}</Text>}
                  </View>
                  {!!popup.telefon && (
                    <Pressable onPress={() => Linking.openURL(`tel:${popup.telefon}`)} style={styles.ikonBtn}><Text>📞</Text></Pressable>
                  )}
                  <Pressable onPress={() => { const id = popup.id; setPopup(null); router.push(`/musteri/${id}` as any); }}
                    style={[styles.btn, { backgroundColor: J.cyan, borderColor: J.cyan, paddingVertical: 6 }]}>
                    <Text style={[styles.btnYazi, { color: '#03121a' }]}>Detay →</Text>
                  </Pressable>
                  <Pressable onPress={() => setPopup(null)} hitSlop={8}><Text style={[styles.soluk, { fontSize: 20 }]}>✕</Text></Pressable>
                </View>
                <ScrollView contentContainerStyle={{ padding: 14, gap: 16 }}>
                  {popup.iletisim.length > 0 && (
                    <View>
                      <Text style={[styles.mono, styles.bolum]}>EK KİŞİLER</Text>
                      {popup.iletisim.map((k: any) => (
                        <Pressable key={k.id} onPress={() => k.telefon && Linking.openURL(`tel:${k.telefon}`)} style={styles.satir}>
                          <Text style={[styles.govde, { flex: 1, fontWeight: '600' }]}>{k.ad}{k.tip ? `  · ${k.tip}` : ''}</Text>
                          {!!k.telefon && <Text style={{ fontSize: 13, color: J.cyan }}>📞 {k.telefon}</Text>}
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {popup.istekler.length > 0 && (
                    <View>
                      <Text style={[styles.mono, styles.bolum]}>İSTEKLER</Text>
                      {popup.istekler.map((i: any, idx: number) => (
                        <View key={i.id} style={styles.istek}>
                          <Text style={[styles.govde, { fontSize: 13 }]}>
                            <Text style={{ color: J.cyan, fontWeight: '700' }}>{`#${idx + 1}  `}</Text>
                            {[i.satilik_kiralik,
                              (i.butce_min || i.butce_max) ? `${i.butce_min ? fiyatYaz(i.butce_min) : '—'} – ${i.butce_max ? fiyatYaz(i.butce_max) : '—'}` : null,
                              i.tip, i.tercih_konum ? String(i.tercih_konum).split('|').join(', ') : null,
                              i.min_oda ? `Min ${i.min_oda}` : null].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View>
                    <Text style={[styles.mono, styles.bolum]}>SON NOTLAR</Text>
                    {popup.notlar.length === 0 ? <Text style={styles.soluk}>Not yok.</Text> : popup.notlar.map((n: any) => (
                      <View key={n.id} style={styles.not}>
                        {!!n.tarih && <Text style={[styles.mono, { fontSize: 11, fontWeight: '600', color: '#fbbf24', marginBottom: 3 }]}>{tarihYaz(n.tarih, true)}</Text>}
                        <Text style={{ fontSize: 13, lineHeight: 19, color: '#fde68a' }}>{n.icerik}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ───────── Jarvis HUD parçaları (web: ilan-web/app/panel/jarvis/page.tsx JV_CSS) ─────────
const J = {
  zemin: '#060a12', panel: 'rgba(10,18,32,0.88)', cyan: '#22d3ee', mavi: '#38bdf8',
  yazi: '#d7f2ff', soluk: '#7f97ad', cizgi: 'rgba(125,211,252,0.12)',
};
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

type OrbDurum = 'bos' | 'dusun' | 'hata';
// Renk: boşta mavi, düşünürken turuncu, sorun varsa kırmızı
const ORB_RENK: Record<OrbDurum, { o: string; o2: string; o3: string; oc: string }> = {
  bos: { o: '#22d3ee', o2: '#38bdf8', o3: '#67e8f9', oc: '#cffafe' },
  dusun: { o: '#f97316', o2: '#fb923c', o3: '#fdba74', oc: '#ffedd5' },
  hata: { o: '#ef4444', o2: '#f87171', o3: '#fca5a5', oc: '#fee2e2' },
};

function donen(val: Animated.Value, sure: number) {
  val.setValue(0);
  return Animated.loop(Animated.timing(val, { toValue: 1, duration: sure, easing: Easing.linear, useNativeDriver: true }));
}

// Ark reaktör halkası: boşta yavaş döner, düşünürken hızlanır + sonar dalgası
function Orb({ boyut, durum }: { boyut: number; durum: OrbDurum }) {
  const r1 = useRef(new Animated.Value(0)).current;
  const r2 = useRef(new Animated.Value(0)).current;
  const r3 = useRef(new Animated.Value(0)).current;
  const nefes = useRef(new Animated.Value(0)).current;
  const p1 = useRef(new Animated.Value(0)).current;
  const p2 = useRef(new Animated.Value(0)).current;
  const dusun = durum === 'dusun';
  const yavas = durum === 'hata' ? 3 : 1;

  useEffect(() => {
    const anim = [
      donen(r1, (dusun ? 1300 : 7000) * yavas),
      donen(r2, (dusun ? 2200 : 12000) * yavas),
      donen(r3, (dusun ? 800 : 3500) * yavas),
      Animated.loop(Animated.sequence([
        Animated.timing(nefes, { toValue: 1, duration: dusun ? 450 : 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(nefes, { toValue: 0, duration: dusun ? 450 : 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])),
    ];
    if (dusun) {
      anim.push(donen(p1, 1600));
      anim.push(Animated.sequence([Animated.delay(800), donen(p2, 1600)]));
    } else { p1.setValue(0); p2.setValue(0); }
    anim.forEach(a => a.start());
    return () => anim.forEach(a => a.stop());
  }, [dusun, yavas, r1, r2, r3, nefes, p1, p2]);

  const c = ORB_RENK[durum];
  const s = boyut;
  const don = (v: Animated.Value, ters = false) => ({ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ters ? ['360deg', '0deg'] : ['0deg', '360deg'] }) }] });
  const ping = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [dusun ? 0.8 : 0, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] }) }],
  });
  const halka = (oran: number) => ({ position: 'absolute' as const, left: s * oran, top: s * oran, width: s * (1 - 2 * oran), height: s * (1 - 2 * oran), borderRadius: s });
  const ince = Math.max(1, s / 90);

  return (
    <View style={{ width: s, height: s }} pointerEvents="none">
      <Animated.View style={[halka(0), { borderWidth: ince, borderColor: c.o }, ping(p1)]} />
      <Animated.View style={[halka(0), { borderWidth: ince, borderColor: c.o }, ping(p2)]} />
      <Animated.View style={[halka(0), { borderWidth: Math.max(1, s / 70), borderColor: c.o + '44', borderTopColor: c.o, borderBottomColor: c.o }, don(r1)]} />
      <Animated.View style={[halka(0.15), { borderWidth: Math.max(1, s / 60), borderColor: c.o2 + '99', borderStyle: s >= 40 ? 'dashed' : 'solid' }, don(r2, true)]} />
      <Animated.View style={[halka(0.28), { borderWidth: Math.max(1, s / 55), borderColor: 'transparent', borderLeftColor: c.o3, borderRightColor: c.o3 }, don(r3)]} />
      <Animated.View style={[halka(0.36), {
        backgroundColor: c.o, alignItems: 'center', justifyContent: 'center',
        shadowColor: c.o, shadowOpacity: 0.95, shadowRadius: s * 0.22, shadowOffset: { width: 0, height: 0 }, elevation: 8,
        transform: [{ scale: nefes.interpolate({ inputRange: [0, 1], outputRange: dusun ? [0.88, 1.15] : [0.94, 1.04] }) }],
        opacity: nefes.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
      }]}>
        <View style={{ width: '62%', height: '62%', borderRadius: s, backgroundColor: c.oc, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '50%', height: '50%', borderRadius: s, backgroundColor: '#fff' }} />
        </View>
      </Animated.View>
    </View>
  );
}

// Büyük halka: görünürken belirir, cevap gelince olduğu yerde söner
function BuyukOrb({ gor, boyut, durum, style }: { gor: boolean; boyut: number; durum: OrbDurum; style: any }) {
  const v = useRef(new Animated.Value(gor ? 1 : 0)).current;
  const [cizili, setCizili] = useState(gor);
  useEffect(() => {
    if (gor) setCizili(true);
    Animated.timing(v, { toValue: gor ? 1 : 0, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true })
      .start(({ finished }) => { if (finished && !gor) setCizili(false); });
  }, [gor, v]);
  if (!cizili) return null;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, style, {
      opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
    }]}>
      <Orb boyut={boyut} durum={durum} />
    </Animated.View>
  );
}

// HUD ızgara çizgileri
function Izgara({ w, h }: { w: number; h: number }) {
  const ad = 34;
  if (!w || !h) return null;
  const yatay = Math.ceil(h / ad), dikey = Math.ceil(w / ad);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: yatay }, (_, i) => <View key={'y' + i} style={{ position: 'absolute', left: 0, right: 0, top: i * ad, height: 1, backgroundColor: 'rgba(34,211,238,0.05)' }} />)}
      {Array.from({ length: dikey }, (_, i) => <View key={'d' + i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * ad, width: 1, backgroundColor: 'rgba(34,211,238,0.05)' }} />)}
    </View>
  );
}

// Onay kartı: HUD köşe çizgileri + bekliyorken tarama ışığı
// İlan özet penceresi: kaydırmalı fotoğraflar + bilgiler + "Tam detaya git"
function IlanOzetModal({ acik, kapat, detay }: { acik: { id: string; veri: any | null } | null; kapat: () => void; detay: (id: string) => void }) {
  const [genislik, setGenislik] = useState(0);
  const [fi, setFi] = useState(0);
  useEffect(() => { setFi(0); }, [acik?.id]);
  const v = acik?.veri;
  const fotolar: string[] = v?.fotograflar ?? [];
  const bilgi = v && !v.hata ? [
    v.tip, v.kategori, v.oda_sayisi, v.metrekare ? `${v.metrekare} m²` : null,
    v.bulundugu_kat ? `Kat: ${v.bulundugu_kat}` : null, v.kat_sayisi ? `${v.kat_sayisi} katlı` : null,
    v.bina_yasi ? `Bina yaşı: ${v.bina_yasi}` : null, v.banyo_sayisi ? `${v.banyo_sayisi} banyo` : null,
  ].filter(Boolean) : [];
  const ozellikler: string[] = (v?.ilan_ozellikler ?? []).map((x: any) => x.ozellikler?.ad).filter(Boolean);
  return (
    <Modal visible={!!acik} transparent animationType="fade" onRequestClose={kapat}>
      <Pressable style={styles.perde} onPress={kapat}>
        <Pressable style={[styles.popup, { padding: 0, overflow: 'hidden' }]} onPress={() => {}}>
          {!v ? (
            <View style={{ padding: 30, alignItems: 'center' }}><Orb boyut={60} durum="dusun" /></View>
          ) : v.hata ? (
            <Text style={[styles.govde, { padding: 20 }]}>İlan açılamadı.</Text>
          ) : (
            <ScrollView>
              <View onLayout={e => setGenislik(e.nativeEvent.layout.width)} style={{ backgroundColor: '#000' }}>
                {genislik > 0 && (fotolar.length ? (
                  <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={e => setFi(Math.round(e.nativeEvent.contentOffset.x / genislik))}>
                    {fotolar.map((f, i) => (
                      <R2Image key={i} source={f} style={{ width: genislik, height: genislik * 0.72 }} resizeMode="cover" size="md" />
                    ))}
                  </ScrollView>
                ) : <View style={[styles.ilanBos, { width: genislik, height: genislik * 0.5 }]}><Text style={{ fontSize: 30 }}>🏠</Text></View>)}
                {fotolar.length > 1 && (
                  <Text style={[styles.mono, { position: 'absolute', bottom: 8, right: 10, fontSize: 11, color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }]}>
                    {fi + 1}/{fotolar.length}
                  </Text>
                )}
                <Pressable onPress={kapat} hitSlop={10} style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 15 }}>✕</Text>
                </Pressable>
              </View>
              <View style={{ padding: 14, gap: 7 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={[styles.mono, styles.soluk, { fontSize: 12 }]}>#{v.portfoy_no}</Text>
                  {v.durum !== 'Aktif' && <Text style={{ fontSize: 11, color: '#f87171', fontWeight: '700' }}>{v.durum}</Text>}
                  {v.musteri_gizle && <Text style={{ fontSize: 11, color: '#fbbf24', fontWeight: '700' }}>👁 Müşteriden gizli</Text>}
                </View>
                <Text style={[styles.govde, { fontSize: 17, fontWeight: '800', lineHeight: 22 }]}>{v.baslik}</Text>
                <Text style={{ color: J.cyan, fontSize: 20, fontWeight: '800' }}>{fiyatYaz(v.fiyat)}</Text>
                <Text style={styles.soluk}>📍 {[v.mahalle, v.ilce, v.konum].filter(Boolean).join(', ')}</Text>
                {v.denize_mesafe_m != null && <Text style={[styles.govde, { fontSize: 13 }]}>🌊 Denize ~{v.denize_mesafe_m} m <Text style={styles.soluk}>(kuş uçuşu)</Text></Text>}
                {bilgi.length > 0 && <Text style={[styles.govde, { fontSize: 13 }]}>{bilgi.join(' · ')}</Text>}
                {ozellikler.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {ozellikler.map(o => <Text key={o} style={styles.ozellik}>{o}</Text>)}
                  </View>
                )}
                {!!v.aciklama && <Text style={[styles.soluk, { lineHeight: 19 }]} numberOfLines={8}>{v.aciklama}</Text>}
                <Pressable onPress={() => detay(v.id)} style={[styles.btn, { backgroundColor: '#34d399', borderColor: '#34d399', alignItems: 'center', marginTop: 6, paddingVertical: 11 }]}>
                  <Text style={[styles.btnYazi, { color: '#03121a' }]}>Tam detaya git →</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HudKart({ renk, tara, soluk, children }: { renk: string; tara: boolean; soluk: boolean; children: ReactNode }) {
  const [h, setH] = useState(0);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tara || !h) return;
    const a = donen(v, 3200);
    a.start();
    return () => a.stop();
  }, [tara, h, v]);
  const k = 12, t = 2;
  const kose = (pos: any) => <View style={[{ position: 'absolute', backgroundColor: renk }, pos]} />;
  return (
    <View onLayout={e => setH(e.nativeEvent.layout.height)}
      style={{ marginTop: 10, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: renk + '4d', backgroundColor: renk + '14', overflow: 'hidden', opacity: soluk ? 0.55 : 1 }}>
      {tara && h > 0 && (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: h * 0.4,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-h * 0.4, h] }) }],
        }}>
          <LinearGradient colors={['transparent', renk + '22', 'transparent']} style={{ flex: 1 }} />
        </Animated.View>
      )}
      {kose({ left: 0, top: 0, width: k, height: t })}{kose({ left: 0, top: 0, width: t, height: k })}
      {kose({ right: 0, top: 0, width: k, height: t })}{kose({ right: 0, top: 0, width: t, height: k })}
      {kose({ left: 0, bottom: 0, width: k, height: t })}{kose({ left: 0, bottom: 0, width: t, height: k })}
      {kose({ right: 0, bottom: 0, width: k, height: t })}{kose({ right: 0, bottom: 0, width: t, height: k })}
      {children}
    </View>
  );
}

// "Analiz ediyorum…" nabız
function Nabiz({ children }: { children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [v]);
  return <Animated.View style={{ opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }}>{children}</Animated.View>;
}

// Gönder: yazı varken nefes alan cyan buton
function GonderBtn({ aktif, yukleniyor, onPress }: { aktif: boolean; yukleniyor: boolean; onPress: () => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!aktif) { v.setValue(0); return; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 1000, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [aktif, v]);
  return (
    <Pressable onPress={onPress} disabled={!aktif}>
      <Animated.View style={{ opacity: aktif || yukleniyor ? 1 : 0.4, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }] }}>
        <LinearGradient colors={['#67e8f9', '#22d3ee', '#0ea5e9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
          {yukleniyor ? <ActivityIndicator color="#03121a" /> : <Text style={{ color: '#03121a', fontSize: 16, fontWeight: '800' }}>➤</Text>}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

// Harfleri karıştırıp yerine oturtan başlık
function Karistir({ metin }: { metin: string }) {
  const [g, setG] = useState(metin);
  useEffect(() => {
    const harf = 'ABCDEFGHIJKLMNOPRSTUVYZ0123456789#%&';
    let i = 0;
    const t = setInterval(() => {
      i += Math.max(1, metin.length / 14);
      setG(metin.split('').map((c, j) => (j < i || c === ' ' || c === ',') ? c : harf[Math.floor(Math.random() * harf.length)]).join(''));
      if (i >= metin.length) clearInterval(t);
    }, 40);
    return () => clearInterval(t);
  }, [metin]);
  return <>{g}</>;
}

function grupAdi(iso: string) {
  const d = new Date(iso);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  const fark = Math.round((b.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
  return fark <= 0 ? 'Bugün' : fark === 1 ? 'Dün' : fark < 7 ? 'Son 7 gün' : 'Daha eski';
}

const styles = StyleSheet.create({
  ekran: { flex: 1, backgroundColor: '#05080f' },
  ust: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: J.cizgi,
  },
  ustBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(34,211,238,0.08)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.25)' },
  logo: { fontFamily: MONO, fontSize: 13, fontWeight: '800', letterSpacing: 4, color: '#fff', textShadowColor: 'rgba(34,211,238,0.8)', textShadowRadius: 10 },
  nokta: { width: 7, height: 7, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  mono: { fontFamily: MONO },
  balonBen: {
    alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: 'rgba(34,211,238,0.16)',
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.45)',
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 14, borderBottomRightRadius: 4,
  },
  jEtiket: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, marginLeft: 2 },
  balonJarvis: {
    backgroundColor: J.panel, borderWidth: 1, borderColor: J.cizgi, borderLeftWidth: 2, borderLeftColor: J.cyan,
    paddingVertical: 10, paddingHorizontal: 13, borderRadius: 14, borderTopLeftRadius: 4,
  },
  saat: { fontSize: 10.5, color: '#4d6a80', paddingLeft: 4, marginTop: 4 },
  kartDurum: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderRadius: 4 },
  bos: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 16, alignItems: 'center', gap: 10 },
  bosBaslik: { fontFamily: MONO, fontSize: 17, fontWeight: '800', letterSpacing: 3, color: '#fff', textShadowColor: 'rgba(34,211,238,0.7)', textShadowRadius: 12 },
  ornek: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, backgroundColor: 'rgba(10,22,38,0.8)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.25)' },
  asagi: {
    position: 'absolute', right: 16, bottom: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(7,13,24,0.92)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.45)',
  },
  yazAlan: { padding: 10, borderTopWidth: 1, borderTopColor: J.cizgi, backgroundColor: 'rgba(5,9,16,0.98)' },
  yaz: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingVertical: 5, paddingRight: 5, paddingLeft: 14, borderRadius: 16,
    backgroundColor: 'rgba(10,20,34,0.9)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.22)',
    shadowColor: J.cyan, shadowOpacity: 0, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  yan: { width: '82%', maxWidth: 340, backgroundColor: 'rgba(7,13,24,0.98)', borderRightWidth: 1, borderRightColor: J.cizgi },
  yeniBtn: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(34,211,238,0.45)', backgroundColor: 'rgba(34,211,238,0.12)', alignItems: 'center' },
  grup: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#4d6a80', paddingTop: 12, paddingBottom: 4, paddingHorizontal: 8 },
  sohbetSatir: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, marginBottom: 2 },
  aktifCizgi: { position: 'absolute', left: 0, top: 7, bottom: 7, width: 2, borderRadius: 2, backgroundColor: J.cyan },
  soluk: { fontSize: 13, color: J.soluk },
  govde: { fontSize: 14, color: J.yazi, lineHeight: 20 },
  rk: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(125,211,252,0.16)', backgroundColor: 'rgba(8,16,28,0.78)', padding: 12, gap: 6 },
  rkBas: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rkBaslik: { flex: 1, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.3, color: '#7dd3fc' },
  rkSayi: { fontSize: 20, fontWeight: '800', color: '#fff' },
  rkSatir: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: 'rgba(125,211,252,0.08)' },
  rkLink: { color: J.mavi, fontWeight: '700' },
  isKart: { padding: 11, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(125,211,252,0.14)', backgroundColor: 'rgba(255,255,255,0.025)', gap: 4 },
  isKartSimdi: { borderColor: 'rgba(251,191,36,0.45)', backgroundColor: 'rgba(251,191,36,0.05)' },
  isGrup: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: J.soluk, marginTop: 12, marginBottom: 2 },
  isRozet: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  ilanSatir: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, marginTop: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(125,211,252,0.12)', backgroundColor: 'rgba(255,255,255,0.02)' },
  ilanSatirFoto: { width: 64, height: 46, borderRadius: 6 },
  ilanBos: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  ilanBaslik: { fontSize: 13, fontWeight: '700', color: J.yazi, lineHeight: 17 },
  ilanKart: { width: 150, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(125,211,252,0.18)', backgroundColor: 'rgba(255,255,255,0.03)' },
  ilanKartFoto: { width: 150, height: 96 },
  ozellik: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(56,189,248,0.1)', color: '#7dd3fc', borderWidth: 1, borderColor: 'rgba(56,189,248,0.25)' },
  input: {
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)', borderRadius: Radius.md, padding: 10,
    color: J.yazi, backgroundColor: 'rgba(3,10,20,0.85)', fontSize: 15,
  },
  btn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1 },
  btnYazi: { fontSize: 13, fontWeight: '700' },
  perde: { flex: 1, backgroundColor: 'rgba(0,4,10,0.75)', justifyContent: 'center', padding: 16 },
  popup: {
    backgroundColor: '#08101c', borderRadius: 14, maxHeight: '85%',
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)', overflow: 'hidden',
  },
  popupUst: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14,
    borderBottomWidth: 1, borderBottomColor: J.cizgi,
  },
  ikonBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(34,211,238,0.1)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)', alignItems: 'center', justifyContent: 'center' },
  etiket: { fontSize: 11, fontWeight: '600', color: '#cfe8f5', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  bolum: { fontSize: 11, fontWeight: '800', color: J.cyan, letterSpacing: 1.5, marginBottom: 6 },
  satir: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: J.cizgi, borderRadius: 8, marginBottom: 6 },
  istek: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: J.cizgi, borderLeftWidth: 3, borderLeftColor: J.cyan, backgroundColor: 'rgba(255,255,255,0.03)', marginBottom: 6 },
  not: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(234,179,8,0.3)', backgroundColor: 'rgba(234,179,8,0.08)', marginBottom: 6 },
});


// ── 📋 Açık İşler Defteri ── (web: ilan-web/app/panel/jarvis/page.tsx AcikIslerPanel)
// Hatırlatmayı DB yapar (pg_cron acik_is_tara; 22-08 sessiz; kapatılmazsa her 1 saat; 19:00 akşam özeti).
type AcikIs = {
  id: string; baslik: string; hedef_tarih: string | null; sonraki_hatirlatma: string | null;
  ertelenme_sayisi: number; son_mesaj: string | null; eski_toplu: boolean; musteri_id: string | null;
  musteriler: { ad: string; soyad: string | null } | null;
};

function acikIsZaman(g: AcikIs): { t: Date | null; saatsiz: boolean } {
  if (g.sonraki_hatirlatma) return { t: new Date(g.sonraki_hatirlatma), saatsiz: false };
  if (!g.hedef_tarih) return { t: null, saatsiz: true };
  const t = new Date(g.hedef_tarih);
  const saatsiz = (t.getHours() === 0 && t.getMinutes() === 0) || (t.getUTCHours() === 0 && t.getUTCMinutes() === 0);
  return { t, saatsiz };
}

function acikIsZamanYaz(g: AcikIs) {
  const { t, saatsiz } = acikIsZaman(g);
  if (!t) return 'Tarihsiz';
  const bugun = new Date();
  const yarin = new Date(Date.now() + 86400000);
  const saat = saatsiz ? '' : ' ' + t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (t.toDateString() === bugun.toDateString()) return 'Bugün' + saat + (!saatsiz && t < bugun ? ' (geçti)' : '');
  if (t.toDateString() === yarin.toDateString()) return 'Yarın' + saat;
  if (t < bugun) {
    const n = Math.max(1, Math.round((bugun.getTime() - t.getTime()) / 86400000));
    return `${n} gün önce (${t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })})`;
  }
  return t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' }) + saat;
}

function AcikIslerModal({ acik, kapat, musteriAc, sayiDegisti }: {
  acik: boolean; kapat: () => void; musteriAc: (id: string) => void; sayiDegisti: (n: number) => void;
}) {
  const [liste, setListe] = useState<AcikIs[] | null>(null);
  const [eskiAcik, setEskiAcik] = useState(false);
  const [mesgul, setMesgul] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    const { data } = await supabase.from('musteri_gorevler')
      .select('id, baslik, hedef_tarih, sonraki_hatirlatma, ertelenme_sayisi, son_mesaj, eski_toplu, musteri_id, musteriler(ad, soyad)')
      .eq('tamamlandi', false).order('hedef_tarih', { ascending: true, nullsFirst: false }).limit(300);
    const l = (data ?? []) as unknown as AcikIs[];
    setListe(l);
    sayiDegisti(l.length);
  }, [sayiDegisti]);
  useEffect(() => { if (acik) yukle(); }, [acik, yukle]);

  async function islem(id: string, p: string) {
    setMesgul(id);
    const { error } = await supabase.rpc('acik_is_islem', { p_gorev: id, p_islem: p });
    if (error) Alert.alert('Yapılamadı', error.message);
    await yukle();
    setMesgul(null);
  }
  async function toplu(p: 'yarina_al' | 'eski_kapat') {
    setMesgul(p);
    const { error } = await supabase.rpc('acik_is_toplu', { p_islem: p });
    if (error) Alert.alert('Yapılamadı', error.message);
    await yukle();
    setMesgul(null);
  }

  const gunSonu = new Date(); gunSonu.setHours(23, 59, 59, 999);
  const simdi = new Date();
  const l = liste ?? [];
  const eski = l.filter(g => g.eski_toplu);
  const aktif = l.filter(g => !g.eski_toplu);
  const bugun = aktif.filter(g => { const { t } = acikIsZaman(g); return !!t && t <= gunSonu; });
  const ileride = aktif.filter(g => { const { t } = acikIsZaman(g); return !!t && t > gunSonu; });
  const tarihsiz = aktif.filter(g => !acikIsZaman(g).t);

  const btn = (renk: string, dolu = false) => [styles.btn, { borderColor: renk, paddingVertical: 6, paddingHorizontal: 10 }, dolu && { backgroundColor: renk }];
  const satir = (g: AcikIs) => {
    const ad = g.musteriler ? [g.musteriler.ad, g.musteriler.soyad].filter(Boolean).join(' ') : null;
    const ek = (g.son_mesaj ?? '').split('\n').slice(1).map(x => x.replace(/\[ilan:\s*#?(\d+)\]/g, '#$1')).filter(Boolean);
    const { t } = acikIsZaman(g);
    const gecti = !!t && t <= simdi && !g.eski_toplu;
    return (
      <View key={g.id} style={[styles.isKart, gecti && styles.isKartSimdi]}>
        <Text style={[styles.govde, { fontSize: 14 }]}>
          {g.musteri_id && ad ? <Text style={{ color: J.mavi, fontWeight: '700' }} onPress={() => musteriAc(g.musteri_id!)}>{ad} 👁  </Text> : null}
          <Text style={{ fontWeight: '700' }}>{g.baslik}</Text>
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.soluk, { fontSize: 12 }]}>🗓 {acikIsZamanYaz(g)}</Text>
          {g.ertelenme_sayisi > 0 && <Text style={styles.isRozet}>↻ {g.ertelenme_sayisi}</Text>}
        </View>
        {ek.map((x, i) => <Text key={i} style={{ fontSize: 12.5, color: x.includes('vazgeç') ? '#fbbf24' : '#a5f3fc' }}>{x}</Text>)}
        {!ek.length && g.ertelenme_sayisi >= 3 && <Text style={{ fontSize: 12.5, color: '#fbbf24' }}>{g.ertelenme_sayisi} kez erteledin, vazgeçelim mi?</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          <Pressable disabled={mesgul === g.id} onPress={() => islem(g.id, 'yapildi')} style={btn('#34d399', true)}><Text style={[styles.btnYazi, { color: '#03121a' }]}>✓ Yaptım</Text></Pressable>
          <Pressable disabled={mesgul === g.id} onPress={() => islem(g.id, 'saat')} style={btn(J.mavi)}><Text style={[styles.btnYazi, { color: J.mavi }]}>⏰ 1 saat</Text></Pressable>
          <Pressable disabled={mesgul === g.id} onPress={() => islem(g.id, 'aksam')} style={btn(J.mavi)}><Text style={[styles.btnYazi, { color: J.mavi }]}>🌙 Akşam</Text></Pressable>
          <Pressable disabled={mesgul === g.id} onPress={() => islem(g.id, 'vazgec')} style={btn(J.soluk)}><Text style={[styles.btnYazi, { color: J.soluk }]}>✕ Vazgeç</Text></Pressable>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={acik} transparent animationType="fade" onRequestClose={kapat}>
      <Pressable style={styles.perde} onPress={kapat}>
        <Pressable style={[styles.popup, { maxHeight: '88%' }]} onPress={() => {}}>
          <View style={styles.popupUst}>
            <Text style={[styles.govde, { flex: 1, fontSize: 16, fontWeight: '800' }]}>📋 Açık İşler {liste ? `(${l.length})` : ''}</Text>
            {bugun.length > 0 && (
              <Pressable disabled={mesgul === 'yarina_al'} onPress={() => toplu('yarina_al')} style={btn(J.mavi)}>
                <Text style={[styles.btnYazi, { color: J.mavi, fontSize: 12 }]}>Bugünküleri yarına al</Text>
              </Pressable>
            )}
            <Pressable onPress={kapat} hitSlop={8}><Text style={[styles.soluk, { fontSize: 20 }]}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 2, gap: 8 }}>
            {!liste ? <Text style={styles.soluk}>Yükleniyor…</Text> : !l.length ? <Text style={styles.soluk}>Açık iş yok 🎉</Text> : null}
            {bugun.length > 0 && <Text style={styles.isGrup}>BUGÜN VE GEÇENLER ({bugun.length})</Text>}
            {bugun.map(satir)}
            {ileride.length > 0 && <Text style={styles.isGrup}>İLERİDE ({ileride.length})</Text>}
            {ileride.map(satir)}
            {tarihsiz.length > 0 && <Text style={styles.isGrup}>TARİHSİZ ({tarihsiz.length})</Text>}
            {tarihsiz.map(satir)}
            {eski.length > 0 && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <Text style={[styles.isGrup, { marginTop: 0, flex: 1 }]} onPress={() => setEskiAcik(v => !v)}>
                    {eskiAcik ? '▾' : '▸'} ESKİ AÇIK İŞLER ({eski.length})
                  </Text>
                  <Pressable disabled={mesgul === 'eski_kapat'} style={btn(J.soluk)}
                    onPress={() => Alert.alert('Eski işler', 'Eski açık işlerin hepsi "vazgeçildi" olarak kapatılsın mı?', [
                      { text: 'İptal', style: 'cancel' }, { text: 'Kapat', style: 'destructive', onPress: () => toplu('eski_kapat') }])}>
                    <Text style={[styles.btnYazi, { color: J.soluk, fontSize: 11 }]}>Hepsini kapat</Text>
                  </Pressable>
                </View>
                {eskiAcik && eski.map(satir)}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}


// ── 🏠 Jarvis rapor ekranı (yeni sohbet açılışı) ── tek RPC jarvis_ozet(), 0 token
// Web karşılığı: ilan-web/app/panel/jarvis/page.tsx JarvisRapor
function JarvisRapor({ musteriAc, ilanAc, acikIsAc, komut }: {
  musteriAc: (id: string) => void; ilanAc: (id: string) => void; acikIsAc: () => void; komut: (t: string) => void;
}) {
  const [o, setO] = useState<any | null>(null);
  const [hata, setHata] = useState(false);
  const yukle = useCallback(async () => {
    const { data, error } = await supabase.rpc('jarvis_ozet');
    if (error) { setHata(true); return; }
    setHata(false);
    setO(data);
  }, []);
  useFocusEffect(useCallback(() => { yukle(); }, [yukle]));

  const simdi = new Date();
  const saat = simdi.getHours();
  const selam = saat < 12 ? 'GÜNAYDIN' : saat < 18 ? 'İYİ GÜNLER' : 'İYİ AKŞAMLAR';
  const tarih = simdi.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  const dk = (sn: number) => (sn >= 60 ? `${Math.round(sn / 60)} dk` : `${sn} sn`);
  const once = (iso: string) => `${Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 86400000))} gün önce`;
  const saatYaz = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '');
  const uygunIlan = (id: string, ad: string) => komut(`${ad} için uygun ilanları göster [müşteri: ${id} ${ad}]`);

  if (hata) return <Text style={styles.soluk} onPress={yukle}>Rapor yüklenemedi. Tekrar denemek için dokun.</Text>;
  if (!o) return <Text style={styles.soluk}>Rapor hazırlanıyor…</Text>;

  const ai = o.acik_isler ?? {};
  const acan: any[] = o.bugun_acanlar ?? [];
  const sicak: any[] = o.sicak ?? [];
  const acmayan: any[] = o.acmayanlar ?? [];
  const ilanlar: any[] = o.ilanlar ?? [];
  const ev = o.eksik_veri ?? {};
  const Bas = ({ ikon, baslik, sayi }: { ikon: string; baslik: string; sayi?: number }) => (
    <View style={styles.rkBas}>
      <Text style={{ fontSize: 14 }}>{ikon}</Text>
      <Text style={[styles.mono, styles.rkBaslik]}>{baslik}</Text>
      {sayi != null && <Text style={[styles.mono, styles.rkSayi]}>{sayi}</Text>}
    </View>
  );

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={[styles.bosBaslik, { fontSize: 17 }]}><Karistir metin={selam} /></Text>
        <Text style={[styles.soluk, { flex: 1, fontSize: 12 }]} numberOfLines={1}>{tarih}</Text>
        <Text style={[styles.rkLink, { fontSize: 12 }]} onPress={yukle}>↻</Text>
      </View>

      <View style={styles.rk}>
        <Bas ikon="📋" baslik="AÇIK İŞLER" sayi={ai.toplam ?? 0} />
        <Text style={[styles.soluk, { fontSize: 12 }]}>
          {[ai.gecikmis ? `${ai.gecikmis} gecikmiş` : '', ai.bugun ? `${ai.bugun} bugün` : '', ai.eski ? `${ai.eski} eski` : ''].filter(Boolean).join(' · ') || 'Bugün için bekleyen iş yok'}
        </Text>
        {(ai.ilk ?? []).map((g: any) => (
          <View key={g.id} style={styles.rkSatir}>
            <Text style={[styles.govde, { flex: 1, fontSize: 13.5 }]} numberOfLines={1}>
              {g.musteri ? <Text style={{ fontWeight: '700' }}>{g.musteri}: </Text> : null}{g.baslik}
            </Text>
            <Text style={[styles.soluk, { fontSize: 12 }]}>{saatYaz(g.zaman)}</Text>
          </View>
        ))}
        {(ai.toplam ?? 0) > 0 && <Text style={[styles.rkLink, { fontSize: 12.5 }]} onPress={acikIsAc}>Listeyi aç →</Text>}
      </View>

      <View style={styles.rk}>
        <Bas ikon="👀" baslik="BUGÜN LİNKİ AÇANLAR" sayi={acan.length} />
        {!acan.length && <Text style={styles.soluk}>Bugün henüz kimse açmadı.</Text>}
        {acan.map(a => (
          <View key={a.musteri_id} style={styles.rkSatir}>
            <Text style={styles.rkLink} onPress={() => musteriAc(a.musteri_id)}>{a.musteri ?? '—'}</Text>
            <Text style={[styles.soluk, { flex: 1, fontSize: 12.5 }]} numberOfLines={1}>
              {a.ilan_adet ? `${a.ilan_adet} ilana baktı` : 'listeyi açtı'}
              {a.en_cok ? <> · en çok <Text style={styles.rkLink} onPress={() => ilanAc(a.en_cok.id)}>#{a.en_cok.no}</Text> ({dk(a.en_cok.sn)})</> : null}
            </Text>
            <Text style={[styles.soluk, { fontSize: 12 }]}>{saatYaz(a.son)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rk}>
        <Bas ikon="🔥" baslik="SICAK MÜŞTERİLER" sayi={sicak.length} />
        <Text style={[styles.soluk, { fontSize: 12 }]}>Son 3 günde ilanlarına en çok bakanlar</Text>
        {!sicak.length && <Text style={styles.soluk}>Son 3 günde yoğun bakan yok.</Text>}
        {sicak.map(m => (
          <View key={m.musteri_id} style={styles.rkSatir}>
            <Text style={styles.rkLink} onPress={() => musteriAc(m.musteri_id)}>{m.musteri ?? '—'}</Text>
            <Text style={[styles.soluk, { flex: 1, fontSize: 12.5 }]}>{dk(m.sn)} · {m.ilan_adet} ilan</Text>
            <Pressable onPress={() => uygunIlan(m.musteri_id, m.musteri ?? '')} style={[styles.btn, { borderColor: J.mavi, paddingVertical: 4, paddingHorizontal: 8 }]}>
              <Text style={[styles.btnYazi, { color: J.mavi, fontSize: 11.5 }]}>Uygun ilanlar</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.rk}>
        <Bas ikon="🔕" baslik="LİNKİ AÇMAYANLAR" sayi={acmayan.length} />
        <Text style={[styles.soluk, { fontSize: 12 }]}>Liste attın, o günden beri hiç bakmadı</Text>
        {!acmayan.length && <Text style={styles.soluk}>Herkes attığın linklere bakmış 👍</Text>}
        {acmayan.map(m => (
          <View key={m.musteri_id} style={styles.rkSatir}>
            <Text style={styles.rkLink} onPress={() => musteriAc(m.musteri_id)}>{m.musteri ?? '—'}</Text>
            <Text style={[styles.soluk, { flex: 1, fontSize: 12.5 }]}>{once(m.son)} attın{m.adet > 1 ? ` (${m.adet} liste)` : ''}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rk}>
        <Bas ikon="🆕" baslik="YENİ VE FİYATI DÜŞEN" sayi={ilanlar.length} />
        <Text style={[styles.soluk, { fontSize: 12 }]}>Son 3 gün · kaç müşterinin isteğine uyuyor</Text>
        {!ilanlar.length && <Text style={styles.soluk}>Son 3 günde yeni ya da fiyatı düşen ilan yok.</Text>}
        {ilanlar.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 4 }}>
            {ilanlar.map(il => (
              <Pressable key={il.id} onPress={() => ilanAc(il.id)} style={styles.ilanKart}>
                {il.kapak
                  ? <R2Image source={il.kapak} style={styles.ilanKartFoto} resizeMode="cover" size="sm" />
                  : <View style={[styles.ilanKartFoto, styles.ilanBos]}><Text>🏠</Text></View>}
                <View style={{ padding: 8, gap: 2 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: il.neden === 'yeni' ? '#34d399' : '#fb923c' }}>
                    {il.neden === 'yeni' ? 'YENİ' : 'FİYATI DÜŞTÜ'}
                  </Text>
                  <Text style={styles.ilanBaslik} numberOfLines={2}>{il.baslik}</Text>
                  <Text style={{ color: J.cyan, fontWeight: '700', fontSize: 12 }}>{fiyatYaz(il.fiyat)}</Text>
                  <Text style={[styles.soluk, { fontSize: 11.5 }]}>{il.uyan?.adet ? `${il.uyan.adet} müşteriye uyuyor` : 'Uyan müşteri yok'}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {(ev.deniz_kara > 0 || ev.oda > 0) && (
        <View style={[styles.rk, { borderColor: 'rgba(251,191,36,0.35)' }]}>
          <View style={styles.rkBas}>
            <Text style={{ fontSize: 14 }}>⚠️</Text>
            <Text style={[styles.mono, styles.rkBaslik, { color: '#fbbf24' }]}>EKSİK VERİ</Text>
          </View>
          {ev.deniz_kara > 0 && (
            <View style={styles.rkSatir}>
              <Text style={[styles.govde, { flex: 1, fontSize: 13 }]}>{ev.deniz_kara} aktif ilanda deniz/kara tarafı işaretli değil</Text>
              <Text style={styles.rkLink} onPress={() => komut('Deniz tarafı ya da kara tarafı işaretli olmayan aktif ilanları listele')}>Listele →</Text>
            </View>
          )}
          {ev.oda > 0 && (
            <View style={styles.rkSatir}>
              <Text style={[styles.govde, { flex: 1, fontSize: 13 }]}>{ev.oda} konut ilanında oda sayısı boş</Text>
              <Text style={styles.rkLink} onPress={() => komut('Oda sayısı boş olan aktif konut ilanlarını listele')}>Listele →</Text>
            </View>
          )}
        </View>
      )}

      <Text style={[styles.soluk, { textAlign: 'center', fontSize: 12 }]}>Aşağıya yaz, ben hazırlayayım. Sen onaylamadan hiçbir şey kaydedilmez.</Text>
    </View>
  );
}
