import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
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
  | 'ilan_fiyat' | 'link_uzat' | 'musteri_ekle' | 'musteri_istek';
type Kart = {
  id: string; tur: KartTur; musteri_id: string | null;
  veri: any; durum: 'bekliyor' | 'onaylandi' | 'reddedildi'; duzenlendi: boolean;
};
type Komut = {
  id: string; metin: string; durum: 'bekliyor' | 'isleniyor' | 'hazir' | 'hata';
  cevap: string | null; hata: string | null; sure_ms: number | null; created_at: string;
  jarvis_kartlar: Kart[];
};
type IlanMini = { id: string; portfoy_no: string | null; fiyat: number | null; oda_sayisi: string | null; ilce: string | null; mahalle: string | null };

const ROZET: Record<KartTur, string> = {
  not: '📝 Not', gorev: '📋 Görev', ilan_gonder: '🏠 İlan gönder', soru: '❓ Soru',
  gorev_guncelle: '📋 Görev', musteri_durum: '👤 Müşteri durumu', ilan_durum: '🏠 İlan durumu',
  ilan_fiyat: '💰 İlan fiyatı', link_uzat: '🔗 Link süresi', musteri_ekle: '👤 Yeni müşteri', musteri_istek: '🎯 Müşteri isteği',
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
  const scrollRef = useRef<ScrollView>(null);

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

  // Soru kartı seçeneğindeki / karttaki müşterinin kısa detayı (web'deki popup ile aynı veri)
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
    const iIds = [...new Set(kartlar.filter(k => k.tur === 'ilan_gonder').flatMap(k => k.veri?.ilan_ids ?? []))] as string[];
    if (mIds.length) {
      const { data: m } = await supabase.from('musteriler').select('id, ad, soyad').in('id', mIds);
      if (m) setMusteriler(p => ({ ...p, ...Object.fromEntries(m.map(x => [x.id, [x.ad, x.soyad].filter(Boolean).join(' ')])) }));
    }
    if (iIds.length) {
      const { data: il } = await supabase.from('ilanlar').select('id, portfoy_no, fiyat, oda_sayisi, ilce, mahalle').in('id', iIds);
      if (il) setIlanlar(p => ({ ...p, ...Object.fromEntries(il.map(x => [x.id, x])) }));
    }
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
          <Text style={styles.soluk}>#{v.portfoy_no ?? '—'} · {v.oda ?? ''} · {v.yer} · {v.baslik}</Text>
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
    if (kart.tur === 'musteri_istek') {
      return (
        <Text style={styles.govde}>
          {kart.veri.islem === 'degistir' ? 'İsteği değiştir: ' : 'İstek ekle: '}<Text style={{ fontWeight: '700' }}>{istekYaz(kart.veri.istek)}</Text>
        </Text>
      );
    }
    if (kart.tur === 'ilan_gonder') {
      const ids: string[] = kart.veri.ilan_ids ?? [];
      return (
        <View>
          {!!kart.veri.aciklama && <Text style={styles.soluk}>{kart.veri.aciklama}</Text>}
          {ids.map(id => {
            const il = ilanlar[id];
            return (
              <Text key={id} style={[styles.govde, { fontSize: 13, paddingVertical: 3 }]}>
                {il ? `#${il.portfoy_no ?? '—'} · ${il.oda_sayisi ?? ''} · ${[il.ilce, il.mahalle].filter(Boolean).join(' / ')} · ${fiyatYaz(il.fiyat)}` : '…'}
              </Text>
            );
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
                <Pressable disabled={mesgul === kart.id} onPress={() => secenekSec(kart, s.komut)} style={[styles.btn, { borderColor: '#2563eb' }]}>
                  <Text style={[styles.btnYazi, { color: '#60a5fa' }]}>{s.etiket}</Text>
                </Pressable>
                {!!s.musteri_id && (
                  <Pressable onPress={() => musteriAc(s.musteri_id)} hitSlop={6} style={[styles.btn, { borderColor: '#2563eb', paddingHorizontal: 10 }]}>
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

  return (
    <SafeAreaView style={styles.ekran} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Üst şerit */}
        <View style={styles.ust}>
          <Pressable onPress={() => { sohbetleriYukle(); setYanAcik(true); }} hitSlop={8} style={styles.ustBtn}>
            <Text style={{ fontSize: 18, color: Colors.onSurface }}>☰</Text>
          </Pressable>
          <Text style={styles.ustBaslik} numberOfLines={1}>
            🤖 {secili ? (sohbetler.find(s => s.id === secili)?.baslik ?? 'Jarvis') : 'Yeni sohbet'}
          </Text>
          <Pressable onPress={yeniSohbet} hitSlop={8} style={styles.ustBtn}>
            <Text style={{ fontSize: 20, color: Colors.primary, fontWeight: '700' }}>＋</Text>
          </Pressable>
        </View>

        {/* Mesajlar */}
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 16, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          {!secili && (
            <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 34 }}>🤖</Text>
              <Text style={[styles.soluk, { textAlign: 'center', marginTop: 6, lineHeight: 19 }]}>
                Yaz, Jarvis hazırlasın; sen onaylamadan hiçbir şey kaydedilmez.
              </Text>
              <Text style={[styles.soluk, { textAlign: 'center', marginTop: 6, color: Colors.outline }]}>
                Örn: “Ahmet'e not ekle: kredi onayı çıktı, bir de bahçe katı 5 ml'ye kadar ilanları atalım”
              </Text>
            </View>
          )}
          {!!secili && yuklendi && !komutlar.length && <Text style={styles.soluk}>Bu sohbette mesaj yok.</Text>}

          {komutlar.map(k => (
            <View key={k.id} style={{ gap: 6 }}>
              {/* Kullanıcı */}
              <View style={styles.balonBen}>
                <Text style={{ color: '#fff', fontSize: 14 }}>{k.metin}</Text>
              </View>
              {/* Jarvis */}
              <View style={[styles.balonJarvis, (k.jarvis_kartlar ?? []).length ? { width: '92%' } : null]}>
                <Text style={[styles.govde, k.durum === 'hata' && { color: '#f87171' }, (k.durum === 'bekliyor' || k.durum === 'isleniyor') && { color: Colors.outline }]}>
                  {k.durum === 'bekliyor' || k.durum === 'isleniyor' ? '⏳ Jarvis hazırlıyor…'
                    : k.durum === 'hata' ? `⚠️ Yapamadım: ${k.hata ?? ''}` : (k.cevap ?? '')}
                </Text>
              {(k.jarvis_kartlar ?? []).map(kart => (
                <View key={kart.id} style={[styles.kart,
                  kart.durum === 'onaylandi' ? { borderColor: '#166534', backgroundColor: '#052e16' }
                    : kart.durum === 'reddedildi' ? { opacity: 0.5 } : { borderColor: '#854d0e', backgroundColor: '#1c1404' }]}>
                  <Text style={[styles.soluk, { fontWeight: '700', marginBottom: 6 }]}
                    onPress={kart.musteri_id ? () => musteriAc(kart.musteri_id!) : undefined}>
                    {ROZET[kart.tur]}{kart.musteri_id ? ` — ${musteriler[kart.musteri_id] ?? '…'} 👁` : ''}
                    {kart.durum === 'onaylandi' ? ' · ✓ yapıldı' : kart.durum === 'reddedildi' ? ' · reddedildi' : ''}
                  </Text>
                  {kartGovde(kart)}
                  {kart.durum === 'bekliyor' && kart.tur !== 'soru' && (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <Pressable disabled={mesgul === kart.id} onPress={() => onayla(kart)} style={[styles.btn, { backgroundColor: '#16a34a', borderColor: '#16a34a' }]}>
                        <Text style={[styles.btnYazi, { color: '#fff' }]}>{kart.tur === 'ilan_gonder' ? 'Gönder…' : FORM_KART.includes(kart.tur) ? 'Formu aç…' : 'Onayla'}</Text>
                      </Pressable>
                      {(kart.tur === 'not' || kart.tur === 'gorev') && !duzenle[kart.id] && (
                        <Pressable disabled={mesgul === kart.id} style={[styles.btn, { borderColor: '#2563eb' }]}
                          onPress={() => setDuzenle(p => ({ ...p, [kart.id]: kart.tur === 'not' ? { metin: kart.veri.metin } : { baslik: kart.veri.baslik, hedef_tarih: kart.veri.hedef_tarih } }))}>
                          <Text style={[styles.btnYazi, { color: '#60a5fa' }]}>Düzenle</Text>
                        </Pressable>
                      )}
                      <Pressable disabled={mesgul === kart.id} onPress={() => reddet(kart)} style={[styles.btn, { borderColor: Colors.outline }]}>
                        <Text style={[styles.btnYazi, { color: Colors.onSurfaceVariant }]}>Reddet</Text>
                      </Pressable>
                    </View>
                  )}
                  {kart.durum === 'bekliyor' && kart.tur === 'soru' && (
                    <Pressable disabled={mesgul === kart.id} onPress={() => reddet(kart)} style={[styles.btn, { borderColor: Colors.outline, marginTop: 8, alignSelf: 'flex-start' }]}>
                      <Text style={[styles.btnYazi, { color: Colors.onSurfaceVariant }]}>Vazgeç</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              </View>
              <Text style={styles.saat}>
                {new Date(k.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                {k.sure_ms != null ? ` · ${(k.sure_ms / 1000).toFixed(1)} sn` : ''}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Yazma kutusu */}
        <View style={styles.yazAlan}>
          <TextInput value={metin} onChangeText={setMetin} placeholder="Jarvis'e yaz…" placeholderTextColor={Colors.outline}
            multiline style={[styles.input, { flex: 1, minHeight: 44, maxHeight: 120 }]} />
          <Pressable onPress={() => komutGonder(metin)} disabled={gonderiyor || !metin.trim()}
            style={[styles.btn, { backgroundColor: Colors.primary, borderColor: Colors.primary, justifyContent: 'center', opacity: gonderiyor || !metin.trim() ? 0.5 : 1 }]}>
            {gonderiyor ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnYazi, { color: '#fff' }]}>Gönder</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Sohbet listesi (soldan açılan panel) */}
      <Modal visible={yanAcik} transparent animationType="fade" onRequestClose={() => setYanAcik(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <SafeAreaView style={styles.yan} edges={['top', 'bottom']}>
            <View style={{ flexDirection: 'row', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
              <Pressable onPress={yeniSohbet} style={[styles.btn, { flex: 1, backgroundColor: Colors.primary, borderColor: Colors.primary, alignItems: 'center' }]}>
                <Text style={[styles.btnYazi, { color: '#fff' }]}>＋ Yeni sohbet</Text>
              </Pressable>
              <Pressable onPress={() => setYanAcik(false)} style={[styles.btn, { borderColor: Colors.outline }]}>
                <Text style={[styles.btnYazi, { color: Colors.onSurfaceVariant }]}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 6 }}>
              {!sohbetler.length && <Text style={[styles.soluk, { padding: 12 }]}>Henüz sohbet yok.</Text>}
              {sohbetler.map(s => {
                const aktif = s.id === secili;
                return (
                  <Pressable key={s.id} onPress={() => { setSecili(s.id); setYanAcik(false); }} onLongPress={() => sohbetIslem(s)}
                    style={[styles.sohbetSatir, aktif && { backgroundColor: 'rgba(229,57,53,0.12)' }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: aktif ? '700' : '500', color: aktif ? Colors.primary : Colors.onSurface }}>{s.baslik}</Text>
                      <Text style={{ fontSize: 11, color: Colors.outline }}>{kisaTarih(s.guncelleme_at)}</Text>
                    </View>
                    <Pressable onPress={() => sohbetIslem(s)} hitSlop={8} style={{ padding: 4 }}>
                      <Text style={{ color: Colors.onSurfaceVariant, fontSize: 16 }}>⋯</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          </SafeAreaView>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setYanAcik(false)} />
        </View>
        {/* Yeniden adlandır (panelin içinde, iç içe Modal açmamak için) */}
        {!!adDegis && (
          <View style={[StyleSheet.absoluteFill, styles.perde]}>
            <View style={[styles.popup, { padding: 14, gap: 10 }]}>
              <Text style={[styles.govde, { fontWeight: '700' }]}>Sohbetin adı</Text>
              <TextInput autoFocus value={adDegis.baslik} onChangeText={t => setAdDegis({ id: adDegis.id, baslik: t })}
                onSubmitEditing={adKaydet} returnKeyType="done" style={styles.input} />
              <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-end' }}>
                <Pressable onPress={() => setAdDegis(null)} style={[styles.btn, { borderColor: Colors.outline }]}>
                  <Text style={[styles.btnYazi, { color: Colors.onSurfaceVariant }]}>Vazgeç</Text>
                </Pressable>
                <Pressable onPress={adKaydet} style={[styles.btn, { backgroundColor: Colors.primary, borderColor: Colors.primary }]}>
                  <Text style={[styles.btnYazi, { color: '#fff' }]}>Kaydet</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </Modal>

      <Modal visible={!!popup} transparent animationType="fade" onRequestClose={() => setPopup(null)}>
        <Pressable style={styles.perde} onPress={() => setPopup(null)}>
          <Pressable style={styles.popup} onPress={() => {}}>
            {popup?._yukleniyor ? (
              <ActivityIndicator style={{ padding: 30 }} color={Colors.primary} />
            ) : popup && (
              <>
                <View style={styles.popupUst}>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.govde, { fontSize: 16, fontWeight: '800' }]}>{popup.ad} {popup.soyad ?? ''}</Text>
                    {!!popup.etiketler && <Text style={styles.soluk}>#{popup.etiketler}</Text>}
                    {!!popup.durum && <Text style={[styles.etiket, popup.durum === 'Aktif' && { color: '#3aaa6e' }]}>{popup.durum}</Text>}
                  </View>
                  {!!popup.telefon && (
                    <Pressable onPress={() => Linking.openURL(`tel:${popup.telefon}`)} style={styles.ikonBtn}><Text>📞</Text></Pressable>
                  )}
                  <Pressable onPress={() => { const id = popup.id; setPopup(null); router.push(`/musteri/${id}` as any); }}
                    style={[styles.btn, { backgroundColor: Colors.primary, borderColor: Colors.primary, paddingVertical: 6 }]}>
                    <Text style={[styles.btnYazi, { color: '#fff' }]}>Detay →</Text>
                  </Pressable>
                  <Pressable onPress={() => setPopup(null)} hitSlop={8}><Text style={[styles.soluk, { fontSize: 20 }]}>✕</Text></Pressable>
                </View>
                <ScrollView contentContainerStyle={{ padding: 14, gap: 16 }}>
                  {popup.iletisim.length > 0 && (
                    <View>
                      <Text style={styles.bolum}>EK KİŞİLER</Text>
                      {popup.iletisim.map((k: any) => (
                        <Pressable key={k.id} onPress={() => k.telefon && Linking.openURL(`tel:${k.telefon}`)} style={styles.satir}>
                          <Text style={[styles.govde, { flex: 1, fontWeight: '600' }]}>{k.ad}{k.tip ? `  · ${k.tip}` : ''}</Text>
                          {!!k.telefon && <Text style={styles.soluk}>📞 {k.telefon}</Text>}
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {popup.istekler.length > 0 && (
                    <View>
                      <Text style={styles.bolum}>İSTEKLER</Text>
                      {popup.istekler.map((i: any, idx: number) => (
                        <View key={i.id} style={styles.istek}>
                          <Text style={[styles.govde, { fontSize: 13 }]}>
                            {`#${idx + 1}  `}
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
                    <Text style={styles.bolum}>SON NOTLAR</Text>
                    {popup.notlar.length === 0 ? <Text style={styles.soluk}>Not yok.</Text> : popup.notlar.map((n: any) => (
                      <View key={n.id} style={styles.not}>
                        {!!n.tarih && <Text style={{ fontSize: 11, fontWeight: '600', color: '#fbbf24', marginBottom: 3 }}>{tarihYaz(n.tarih, true)}</Text>}
                        <Text style={[styles.govde, { fontSize: 13, lineHeight: 19 }]}>{n.icerik}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ekran: { flex: 1, backgroundColor: Colors.background },
  ust: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  ustBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceContainer },
  ustBaslik: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.onSurface },
  balonBen: {
    alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: Colors.primary,
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 14, borderBottomRightRadius: 4,
  },
  balonJarvis: {
    alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1, borderColor: Colors.outlineVariant,
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 14, borderBottomLeftRadius: 4,
  },
  saat: { fontSize: 11, color: Colors.outline, paddingLeft: 4 },
  yazAlan: {
    flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: Colors.outlineVariant,
    backgroundColor: Colors.background,
  },
  yan: { width: '82%', maxWidth: 340, backgroundColor: Colors.surfaceContainerLow, borderRightWidth: 1, borderRightColor: Colors.outlineVariant },
  sohbetSatir: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, marginBottom: 2 },
  soluk: { fontSize: 13, color: Colors.onSurfaceVariant },
  govde: { fontSize: 14, color: Colors.onSurface },
  input: {
    borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: Radius.md, padding: 10,
    color: Colors.onSurface, backgroundColor: Colors.surfaceContainer, fontSize: 15,
  },
  komut: {
    backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outlineVariant,
    borderRadius: Radius.md, padding: 12, marginBottom: 12,
  },
  kart: { marginTop: 10, padding: 10, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.outlineVariant },
  btn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm, borderWidth: 1 },
  btnYazi: { fontSize: 13, fontWeight: '700' },
  perde: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  popup: {
    backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, maxHeight: '85%',
    borderWidth: 1, borderColor: Colors.outlineVariant, overflow: 'hidden',
  },
  popupUst: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  ikonBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  etiket: { fontSize: 11, fontWeight: '600', color: Colors.onSurfaceVariant, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: Colors.surfaceContainer, overflow: 'hidden' },
  bolum: { fontSize: 11, fontWeight: '800', color: Colors.onSurfaceVariant, letterSpacing: 0.5, marginBottom: 6 },
  satir: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: Colors.surfaceContainer, borderRadius: 8, marginBottom: 6 },
  istek: { padding: 10, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: Colors.primary, backgroundColor: Colors.surfaceContainer, marginBottom: 6 },
  not: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#854d0e', backgroundColor: '#1c1404', marginBottom: 6 },
});
