import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import PersistentTabBar from '../../components/PersistentTabBar';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { TURKIYE, IL_LISTESI, getMahalleGruplar } from '../../constants/turkiye';
import { ayirTelefon, birlestirTelefon, VARSAYILAN_TELEFON_KODU } from '../../constants/telefonKodlari';
import TelefonInput from '../../components/TelefonInput';
import DateTimePicker from '@react-native-community/datetimepicker';

const ILLER = TURKIYE;
const ILLER_LISTESI = IL_LISTESI;
const EMLAK_TIPLERI = ['Daire', 'Villa', 'Dubleks', 'Tripleks', 'Arsa', 'İşyeri', 'Müstakil Ev', 'Rezidans'];
const ODALAR = ['Stüdyo', '1+0', '1+1', '2+1', '3+1', '3+2', '4+1', '5+'];
const BINA_YASLARI = ['0', '1', '2', '3', '4', '5', '6-10', '11-15', '16-20', '21-25', '+30'];
const KAT_SAYILARI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '20+'];
const BULUNDUGU_KATLAR = ['Giriş Altı Kot', 'Bodrum Kat', 'Zemin Kat', 'Bahçe Katı', 'Giriş Katı', 'Yüksek Giriş', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20+', 'Çatı Katı', 'Müstakil', 'Villa Tipi'];
const TIP_LISTESI = ['Eş', 'Oğul', 'Kız', 'Anne', 'Baba', 'Kardeş', 'Diğer'];
const durumlar: ('Aktif' | 'Beklemede' | 'İptal')[] = ['Aktif', 'Beklemede', 'İptal'];
const musteriTipleri = ['Bireysel', 'Müteahhit', 'Al-Satçı', 'Diğer'];

type EkKisi = { ad: string; kod: string; numara: string; tip: string };

function formatButce(val: string) {
  return val.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function isoFormat(tr: string) {
  const p = tr.split('.');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : '';
}
function notTarihGoster(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function notTarihParse(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]));
  return isNaN(d.getTime()) ? null : d;
}

export default function MusteriEkleScreen() {
  const [ad, setAd] = useState('');
  const [soyad, setSoyad] = useState('');
  const [varsayilanKod, setVarsayilanKod] = useState(VARSAYILAN_TELEFON_KODU);
  const [telKod, setTelKod] = useState(VARSAYILAN_TELEFON_KODU);
  const [telNumara, setTelNumara] = useState('');
  type IstekState = { satilikKiralik: '' | 'Satılık' | 'Kiralık'; tipler: string[]; tipler_haric: string[]; butceMin: string; butceMax: string; konumlar: string[]; minOda: string; binaYaslari: string[]; binaYaslari_haric: string[]; ozelIstekler: string[]; ozelIstekler_haric: string[]; katSayilari: string[]; katSayilari_haric: string[]; bulunduguKatlar: string[]; bulunduguKatlar_haric: string[] };
  const [istekler, setIstekler] = useState<IstekState[]>([{ satilikKiralik: '', tipler: [], tipler_haric: [], butceMin: '', butceMax: '', konumlar: [], minOda: '', binaYaslari: [], binaYaslari_haric: [], ozelIstekler: [], ozelIstekler_haric: [], katSayilari: [], katSayilari_haric: [], bulunduguKatlar: [], bulunduguKatlar_haric: [] }]);
  const [activeIstekIdx, setActiveIstekIdx] = useState<number | null>(null);
  const [filterPage, setFilterPage] = useState<'main' | 'il' | 'ilce' | 'mahalle'>('main');
  const [konumSearch, setKonumSearch] = useState('');
  const tercihKonumlar = activeIstekIdx !== null ? (istekler[activeIstekIdx]?.konumlar ?? []) : [];
  const setTercihKonumlar = (v: string[] | ((p: string[]) => string[])) => {
    setIstekler(prev => prev.map((ist, i) => i === activeIstekIdx ? { ...ist, konumlar: typeof v === 'function' ? v(ist.konumlar) : v } : ist));
  };

  const ilIsaretli = (il: string) => tercihKonumlar.some(k => k === il || k.startsWith(il + ' / '));
  const ilceIsaretli = (il: string, ilce: string) => {
    const key = `${il} / ${ilce}`;
    return tercihKonumlar.some(k => k === key || k.startsWith(key + ' / '));
  };
  const mahIsaretli = (il: string, ilce: string, mah: string) =>
    tercihKonumlar.includes(`${il} / ${ilce} / ${mah}`);

  function toggleIl(il: string) {
    if (ilIsaretli(il)) {
      setTercihKonumlar(prev => prev.filter(k => k !== il && !k.startsWith(il + ' / ')));
    } else {
      setTercihKonumlar(prev => [...prev, il]);
    }
  }
  function toggleIlce(il: string, ilce: string) {
    const key = `${il} / ${ilce}`;
    if (ilceIsaretli(il, ilce)) {
      setTercihKonumlar(prev => prev.filter(k => k !== key && !k.startsWith(key + ' / ')));
    } else {
      setTercihKonumlar(prev => [...prev.filter(k => k !== il), key]);
    }
  }
  function toggleMah(il: string, ilce: string, mah: string) {
    const key = `${il} / ${ilce} / ${mah}`;
    if (mahIsaretli(il, ilce, mah)) {
      setTercihKonumlar(prev => prev.filter(k => k !== key));
    } else {
      setTercihKonumlar(prev => [...prev.filter(k => k !== `${il} / ${ilce}`), key]);
    }
  }

  const seciliIller = Array.from(new Set(tercihKonumlar.map(k => k.split(' / ')[0])))
    .sort((a, b) => a.localeCompare(b, 'tr'));
  const seciliIlceler: { il: string; ilce: string }[] = Array.from(
    new Set(tercihKonumlar.filter(k => k.split(' / ').length >= 2).map(k => {
      const [il, ilce] = k.split(' / '); return `${il}|${ilce}`;
    }))
  ).map(s => { const [il, ilce] = s.split('|'); return { il, ilce }; });
  const ilSayisi = seciliIller.length;
  const ilceSayisi = tercihKonumlar.filter(k => k.split(' / ').length === 2).length;
  const mahSayisi = tercihKonumlar.filter(k => k.split(' / ').length === 3).length;
  const [takipTarihi, setTakipTarihi] = useState('');
  const [showTakipPicker, setShowTakipPicker] = useState(false);
  const [etiket, setEtiket] = useState('');
  const [etiketCakisma, setEtiketCakisma] = useState<{ ad: string; soyad: string | null } | null>(null);
  const [etiketDolduruluyor, setEtiketDolduruluyor] = useState(false);

  useEffect(() => {
    const e = etiket.trim();
    if (!e) { setEtiketCakisma(null); return; }
    const handle = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('musteriler').select('ad, soyad').eq('user_id', user.id).eq('etiketler', e).limit(1);
      setEtiketCakisma(data && data.length > 0 ? (data[0] as { ad: string; soyad: string | null }) : null);
    }, 400);
    return () => clearTimeout(handle);
  }, [etiket]);

  async function enKucukBosEtiket() {
    setEtiketDolduruluyor(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('musteriler').select('etiketler').eq('user_id', user.id).not('etiketler', 'is', null);
      const kullanilan = new Set<number>();
      (data ?? []).forEach((r: { etiketler: string | null }) => {
        const n = parseInt((r.etiketler ?? '').trim(), 10);
        if (Number.isInteger(n) && n > 0) kullanilan.add(n);
      });
      let n = 1;
      while (kullanilan.has(n)) n++;
      setEtiket(String(n));
    } finally {
      setEtiketDolduruluyor(false);
    }
  }
  const [yeniNotlar, setYeniNotlar] = useState<{ icerik: string; tarih: string }[]>([]);
  const [notForm, setNotForm] = useState(false);
  const [notIcerik, setNotIcerik] = useState('');
  const [notTarih, setNotTarih] = useState<Date>(new Date());
  const [notEditIdx, setNotEditIdx] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState<'date' | 'time' | null>(null);
  const [durum, setDurum] = useState<'Aktif' | 'Beklemede' | 'İptal'>('Aktif');
  const [musteriTipi, setMusteriTipi] = useState('Bireysel');
  const [ekKisiler, setEkKisiler] = useState<EkKisi[]>([]);
  const [tipModal, setTipModal] = useState<number | null>(null);
  const scrollRef = useRef<any>(null);
  const notlarBoxY = useRef(0);
  const [loading, setLoading] = useState(false);
  const [tumOzellikler, setTumOzellikler] = useState<{id: string; ad: string}[]>([]);

  let filteredBoxList: any[] = [];
  if (filterPage === 'il') {
    filteredBoxList = ILLER_LISTESI
      .filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()))
      .map(i => ({ type: 'item', kind: 'il', label: i, il: i, key: i }));
  } else if (filterPage === 'ilce') {
    seciliIller.forEach(il => {
      const ilceler = (ILLER[il] ?? []).filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()));
      if (ilceler.length > 0) {
        filteredBoxList.push({ type: 'header', label: il });
        ilceler.sort((a,b) => a.localeCompare(b,'tr')).forEach(ilce => {
          filteredBoxList.push({ type: 'item', kind: 'ilce', label: ilce, il, ilce, key: `${il}/${ilce}` });
        });
      }
    });
  } else if (filterPage === 'mahalle') {
    seciliIlceler.forEach(({ il, ilce }) => {
      const gruplar = getMahalleGruplar(il, ilce)
        .map(g => {
          const sm = g.semt && g.semt.toLowerCase().includes(konumSearch.toLowerCase());
          return { semt: g.semt, mahalleler: sm ? g.mahalleler : g.mahalleler.filter(m => m.toLowerCase().includes(konumSearch.toLowerCase())) };
        })
        .filter(g => g.mahalleler.length > 0);
      if (gruplar.length > 0) {
        filteredBoxList.push({ type: 'header', label: `${il} - ${ilce}` });
        gruplar.forEach(g => {
          if (g.semt) filteredBoxList.push({ type: 'header', label: `  ${g.semt}` });
          g.mahalleler.forEach(mah => filteredBoxList.push({ type: 'item', kind: 'mah', label: mah, il, ilce, mah, key: `${il}/${ilce}/${mah}` }));
        });
      }
    });
  }

  useEffect(() => {
    supabase.from('ozellikler').select('*').order('ad').then(({ data }) => {
      if (data) setTumOzellikler(data);
    });
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiller').select('default_telefon_kodu').eq('id', user.id).single();
      if (data?.default_telefon_kodu) {
        setVarsayilanKod(data.default_telefon_kodu);
        setTelKod(data.default_telefon_kodu);
      }
    })();
  }, []);

  function notEkleAc() {
    setNotEditIdx(null);
    setNotIcerik('');
    setNotTarih(new Date());
    setNotForm(true);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, notlarBoxY.current - 20), animated: true }), 200);
  }
  function notDuzenleAc(idx: number) {
    const n = yeniNotlar[idx];
    setNotEditIdx(idx);
    setNotIcerik(n.icerik);
    const d = new Date(n.tarih);
    setNotTarih(isNaN(d.getTime()) ? new Date() : d);
    setNotForm(true);
  }
  function notKaydet() {
    if (!notIcerik.trim()) return;
    const yeni = { icerik: notIcerik.trim(), tarih: notTarih.toISOString() };
    if (notEditIdx !== null) {
      setYeniNotlar(prev => prev.map((n, i) => i === notEditIdx ? yeni : n));
    } else {
      setYeniNotlar(prev => [yeni, ...prev]);
    }
    setNotForm(false); setNotEditIdx(null); setNotIcerik(''); setNotTarih(new Date());
  }
  function notSil(idx: number) {
    setYeniNotlar(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleKaydet() {
    let finalNotlar = yeniNotlar;
    if (notIcerik.trim()) {
      const yeni = { icerik: notIcerik.trim(), tarih: notTarih.toISOString() };
      finalNotlar = notEditIdx !== null ? yeniNotlar.map((n, i) => i === notEditIdx ? yeni : n) : [yeni, ...yeniNotlar];
    }
    if (!ad) { Alert.alert('Hata', 'Ad zorunludur.'); return; }
    if (etiketCakisma) {
      Alert.alert('Etiket Çakışması', 'Bu etiket başka müşteride var');
      return;
    }
    setLoading(true);

    const { data: inserted, error } = await supabase.from('musteriler').insert({
      ad, soyad: soyad || null,
      telefon: birlestirTelefon(telKod, telNumara),
      takip_tarihi: takipTarihi ? isoFormat(takipTarihi) : null,
      etiketler: etiket.trim() || null,
      durum,
      musteri_tipi: musteriTipi,
    }).select('id').single();
    if (error) { Alert.alert('Hata', error.message); setLoading(false); return; }
    if (inserted) {
      const iRows = istekler
        .filter(i => i.tipler.length || i.butceMin || i.butceMax || i.konumlar.length || i.satilikKiralik)
        .map(i => ({
          musteri_id: (inserted as any).id,
          satilik_kiralik: i.satilikKiralik || null,
          tip: i.tipler.length ? i.tipler.join(',') : null,
          tip_haric: i.tipler_haric.length ? i.tipler_haric.join(',') : null,
          butce_min: i.butceMin ? parseInt(i.butceMin.replace(/\./g, '')) : null,
          butce_max: i.butceMax ? parseInt(i.butceMax.replace(/\./g, '')) : null,
          tercih_konum: i.konumlar.length ? i.konumlar.join(' | ') : null,
          min_oda: i.minOda || null,
          bina_yasi: i.binaYaslari.length ? i.binaYaslari.join(',') : null,
          bina_yasi_haric: i.binaYaslari_haric.length ? i.binaYaslari_haric.join(',') : null,
          kat_sayisi: i.katSayilari.length ? i.katSayilari.join(',') : null,
          kat_sayisi_haric: i.katSayilari_haric.length ? i.katSayilari_haric.join(',') : null,
          bulundugu_kat: i.bulunduguKatlar.length ? i.bulunduguKatlar.join(',') : null,
          bulundugu_kat_haric: i.bulunduguKatlar_haric.length ? i.bulunduguKatlar_haric.join(',') : null,
        }));
      const validIsteklerForOz = istekler.filter(i => i.tipler.length || i.butceMin || i.butceMax || i.konumlar.length || i.satilikKiralik);
      if (iRows.length) {
        const { data: insertedIstekler, error: iErr } = await supabase.from('musteri_istekler').insert(iRows).select('id');
        if (iErr) { Alert.alert('İstek kaydı hatası', iErr.message); setLoading(false); return; }
        if (insertedIstekler) {
          const ozRows = insertedIstekler.flatMap((ins: any, idx: number) => [
            ...(validIsteklerForOz[idx].ozelIstekler ?? []).map((oid: string) => ({ musteri_istek_id: ins.id, ozellik_id: oid, haric: false })),
            ...(validIsteklerForOz[idx].ozelIstekler_haric ?? []).map((oid: string) => ({ musteri_istek_id: ins.id, ozellik_id: oid, haric: true })),
          ]);
          if (ozRows.length) await supabase.from('musteri_istek_ozellikler').insert(ozRows);
        }
      }
    }
    const filteredKisiler = ekKisiler.map(k => ({ ad: k.ad.trim(), telefon: birlestirTelefon(k.kod, k.numara), tip: k.tip })).filter(k => k.ad || k.telefon);
    if (filteredKisiler.length && inserted) {
      const kRows = filteredKisiler.map((k, i) => ({
        musteri_id: (inserted as any).id, ad: k.ad || '—', telefon: k.telefon, tip: k.tip || null, sira: i,
      }));
      const { error: kErr } = await supabase.from('musteri_iletisim').insert(kRows);
      if (kErr) { Alert.alert('Ek kişi kaydı hatası', kErr.message); setLoading(false); return; }
    }
    if (finalNotlar.length && inserted) {
      const nRows = finalNotlar.map(n => ({ musteri_id: (inserted as any).id, icerik: n.icerik, tarih: n.tarih }));
      const { error: nErr } = await supabase.from('musteri_notlar').insert(nRows);
      if (nErr) { Alert.alert('Not kaydı hatası', nErr.message); setLoading(false); return; }
    }
    router.back();
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.geri}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yeni Müşteri</Text>
        <TouchableOpacity style={styles.kaydetBtn} onPress={handleKaydet} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.kaydetText}>Kaydet</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

          <View style={styles.satir}>
            <View style={{ flex: 1 }}><Field label="Ad *" value={ad} onChangeText={setAd} placeholder="Ahmet" /></View>
            <View style={{ flex: 1 }}><Field label="Soyad" value={soyad} onChangeText={setSoyad} placeholder="Yılmaz" /></View>
            <View style={[styles.inputContainer, { width: 110 }]}>
              <Text style={styles.label}>Etiket</Text>
              <View style={[styles.etiketInputRow, { width: 110 }, etiketCakisma && { borderWidth: 1, borderColor: Colors.primary }]}>
                <Text style={styles.etiketHash}>#</Text>
                <TextInput
                  style={styles.etiketInput}
                  placeholder="12"
                  placeholderTextColor={Colors.outlineVariant}
                  value={etiket}
                  onChangeText={v => setEtiket(v.replace(/[#\s]/g, ''))}
                  autoCapitalize="none"
                  returnKeyType="done"
                  keyboardType="number-pad"
                />
                <TouchableOpacity onPress={enKucukBosEtiket} disabled={etiketDolduruluyor}
                  style={{ paddingHorizontal: 6, paddingVertical: 6, marginLeft: 2 }}>
                  <Text style={{ fontSize: 16, opacity: etiketDolduruluyor ? 0.4 : 1 }}>✨</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {etiketCakisma && (
            <Text style={{ marginTop: -6, marginBottom: 8, fontSize: 12, color: Colors.primary, fontWeight: '600' }}>
              ⚠ Bu etiket başka müşteride var
            </Text>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Telefon</Text>
            <TelefonInput kod={telKod} numara={telNumara}
              onChange={(k, n) => { setTelKod(k); setTelNumara(n); }} />
          </View>

          {/* Ek Kişiler */}
          <View style={styles.inputContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.label}>Ek Kişiler {ekKisiler.length > 0 ? `(${ekKisiler.length})` : ''}</Text>
              <TouchableOpacity onPress={() => setEkKisiler(p => [...p, { ad: '', kod: varsayilanKod, numara: '', tip: 'Eş' }])}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.primaryFixed }}>
                <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700' }}>+ Kişi Ekle</Text>
              </TouchableOpacity>
            </View>
            {ekKisiler.length === 0 ? (
              <Text style={{ fontSize: 12, color: Colors.outlineVariant, marginTop: 4 }}>Eş, oğul, anne gibi başka iletişim kişilerini ekleyebilirsiniz.</Text>
            ) : (
              <View style={{ gap: 8, marginTop: 6 }}>
                {ekKisiler.map((k, idx) => (
                  <View key={idx} style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: 10, gap: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput style={[styles.input, { flex: 1, backgroundColor: Colors.surfaceContainerLow }]} placeholder="Ad Soyad" placeholderTextColor={Colors.outlineVariant}
                        value={k.ad} onChangeText={v => setEkKisiler(p => p.map((x, i) => i === idx ? { ...x, ad: v } : x))} />
                      <TouchableOpacity onPress={() => setEkKisiler(p => p.filter((_, i) => i !== idx))}
                        style={{ width: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryFixed, borderRadius: Radius.lg }}>
                        <Text style={{ fontSize: 18, color: Colors.primary, fontWeight: '700' }}>×</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <TelefonInput kod={k.kod} numara={k.numara}
                          onChange={(kk, nn) => setEkKisiler(p => p.map((x, i) => i === idx ? { ...x, kod: kk, numara: nn } : x))} />
                      </View>
                      <TouchableOpacity onPress={() => setTipModal(idx)}
                        style={[styles.input, { width: 110, backgroundColor: Colors.surfaceContainerLow, justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 14, color: Colors.onSurface }}>{k.tip} ▾</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* İstekler */}
          <View style={styles.inputContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.label}>İstekler {istekler.length > 1 ? `(${istekler.length})` : ''}</Text>
              <TouchableOpacity onPress={() => setIstekler(p => [...p, { satilikKiralik: '', tipler: [], tipler_haric: [], butceMin: '', butceMax: '', konumlar: [], minOda: '', binaYaslari: [], binaYaslari_haric: [], ozelIstekler: [], ozelIstekler_haric: [], katSayilari: [], katSayilari_haric: [], bulunduguKatlar: [], bulunduguKatlar_haric: [] }])}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.primaryFixed }}>
                <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700' }}>+ İstek Ekle</Text>
              </TouchableOpacity>
            </View>
            {istekler.map((istek, idx) => (
              <View key={idx} style={{ borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: Radius.lg, overflow: 'hidden', marginTop: 8 }}>
                {/* Kart başlık */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surfaceContainerHigh, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#E53935', letterSpacing: 0.5 }}>#{idx + 1} İSTEK</Text>
                  {istekler.length > 1 && (
                    <TouchableOpacity onPress={() => setIstekler(p => p.filter((_, i) => i !== idx))}>
                      <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '700' }}>× Kaldır</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {/* Satılık / Kiralık */}
                <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                  <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.onSurface, textTransform: 'uppercase', letterSpacing: 0.8 }}>Satılık / Kiralık</Text>
                  </View>
                  <View style={{ backgroundColor: Colors.surfaceContainerLow, padding: 10, flexDirection: 'row', gap: 8 }}>
                    {(['Satılık', 'Kiralık'] as const).map(s => { const sec = istek.satilikKiralik === s; return (
                      <TouchableOpacity key={s} style={[styles.chip, sec && styles.chipActive]}
                        onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, satilikKiralik: x.satilikKiralik === s ? '' : s } : x))}>
                        <Text style={[styles.chipText, sec && styles.chipTextActive]}>{s}</Text>
                      </TouchableOpacity>
                    ); })}
                  </View>
                </View>
                {/* Bütçe */}
                <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                  <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.onSurface, textTransform: 'uppercase', letterSpacing: 0.8 }}>Bütçe (₺)</Text>
                  </View>
                  <View style={{ backgroundColor: Colors.surfaceContainerLow, padding: 10, flexDirection: 'row', gap: 8 }}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Min ₺" placeholderTextColor={Colors.outlineVariant} keyboardType="numeric"
                      value={istek.butceMin} onChangeText={v => setIstekler(p => p.map((x, i) => i === idx ? { ...x, butceMin: formatButce(v) } : x))} />
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Max ₺" placeholderTextColor={Colors.outlineVariant} keyboardType="numeric"
                      value={istek.butceMax} onChangeText={v => setIstekler(p => p.map((x, i) => i === idx ? { ...x, butceMax: formatButce(v) } : x))} />
                  </View>
                </View>
                {/* Portföy Tipi */}
                <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                  <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.onSurface, textTransform: 'uppercase', letterSpacing: 0.8 }}>Portföy Tipi</Text>
                  </View>
                  <View style={{ backgroundColor: Colors.surfaceContainerLow, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {EMLAK_TIPLERI.map(t => { const s = istek.tipler.includes(t); const h = istek.tipler_haric.includes(t); return (
                      <TouchableOpacity key={t} style={[styles.chip, s && styles.chipActive, h && styles.chipHaric]}
                        onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, tipler: s ? x.tipler.filter(tt => tt !== t) : [...x.tipler, t], tipler_haric: x.tipler_haric.filter(tt => tt !== t) } : x))}
                        onLongPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, tipler: x.tipler.filter(tt => tt !== t), tipler_haric: h ? x.tipler_haric.filter(tt => tt !== t) : [...x.tipler_haric, t] } : x))}
                        delayLongPress={500}>
                        <Text style={[styles.chipText, s && styles.chipTextActive, h && styles.chipHaricText]}>{t}</Text>
                      </TouchableOpacity>
                    ); })}
                  </View>
                </View>
                {/* Konum */}
                <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                  <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.onSurface, textTransform: 'uppercase', letterSpacing: 0.8 }}>Tercih Konum</Text>
                  </View>
                  <View style={{ backgroundColor: Colors.surfaceContainerLow, padding: 10 }}>
                    <TouchableOpacity style={[styles.konumBox, istek.konumlar.length > 0 && styles.konumBoxAktif]}
                      onPress={() => { setActiveIstekIdx(idx); setKonumSearch(''); setFilterPage('il'); }}>
                      <Text style={[styles.konumBoxText, istek.konumlar.length > 0 && styles.konumBoxTextAktif]} numberOfLines={1}>
                        {istek.konumlar.length > 0 ? `${istek.konumlar.length} konum seçildi` : 'Konum Seç'}
                      </Text>
                      <Text style={styles.konumBoxChevron}>▾</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {/* Min Oda */}
                <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                  <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.onSurface, textTransform: 'uppercase', letterSpacing: 0.8 }}>Min Oda</Text>
                  </View>
                  <View style={{ backgroundColor: Colors.surfaceContainerLow, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {ODALAR.map(o => { const s = istek.minOda === o; return (
                      <TouchableOpacity key={o} style={[styles.chip, s && styles.chipActive]} onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, minOda: x.minOda === o ? '' : o } : x))}>
                        <Text style={[styles.chipText, s && styles.chipTextActive]}>{o}</Text>
                      </TouchableOpacity>
                    ); })}
                  </View>
                </View>
                {/* Bina Yaşı */}
                <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                  <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.onSurface, textTransform: 'uppercase', letterSpacing: 0.8 }}>Bina Yaşı</Text>
                  </View>
                  <View style={{ backgroundColor: Colors.surfaceContainerLow, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {BINA_YASLARI.map(y => { const s = istek.binaYaslari.includes(y); const h = istek.binaYaslari_haric.includes(y); return (
                      <TouchableOpacity key={y} style={[styles.chip, s && styles.chipActive, h && styles.chipHaric]}
                        onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, binaYaslari: s ? x.binaYaslari.filter(b => b !== y) : [...x.binaYaslari, y], binaYaslari_haric: x.binaYaslari_haric.filter(b => b !== y) } : x))}
                        onLongPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, binaYaslari: x.binaYaslari.filter(b => b !== y), binaYaslari_haric: h ? x.binaYaslari_haric.filter(b => b !== y) : [...x.binaYaslari_haric, y] } : x))}
                        delayLongPress={500}>
                        <Text style={[styles.chipText, s && styles.chipTextActive, h && styles.chipHaricText]}>{y}</Text>
                      </TouchableOpacity>
                    ); })}
                  </View>
                </View>
                {/* Kat Sayısı */}
                <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                  <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.onSurface, textTransform: 'uppercase', letterSpacing: 0.8 }}>Kat Sayısı</Text>
                  </View>
                  <View style={{ backgroundColor: Colors.surfaceContainerLow, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {KAT_SAYILARI.map(k => { const s = istek.katSayilari.includes(k); const h = istek.katSayilari_haric.includes(k); return (
                      <TouchableOpacity key={k} style={[styles.chip, s && styles.chipActive, h && styles.chipHaric]}
                        onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, katSayilari: s ? x.katSayilari.filter(ss => ss !== k) : [...x.katSayilari, k], katSayilari_haric: x.katSayilari_haric.filter(ss => ss !== k) } : x))}
                        onLongPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, katSayilari: x.katSayilari.filter(ss => ss !== k), katSayilari_haric: h ? x.katSayilari_haric.filter(ss => ss !== k) : [...x.katSayilari_haric, k] } : x))}
                        delayLongPress={500}>
                        <Text style={[styles.chipText, s && styles.chipTextActive, h && styles.chipHaricText]}>{k}</Text>
                      </TouchableOpacity>
                    ); })}
                  </View>
                </View>
                {/* Bulunduğu Kat */}
                <View style={{ borderBottomWidth: tumOzellikler.length > 0 ? 1 : 0, borderBottomColor: Colors.outlineVariant }}>
                  <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.onSurface, textTransform: 'uppercase', letterSpacing: 0.8 }}>Bulunduğu Kat</Text>
                  </View>
                  <View style={{ backgroundColor: Colors.surfaceContainerLow, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {BULUNDUGU_KATLAR.map(k => { const s = istek.bulunduguKatlar.includes(k); const h = istek.bulunduguKatlar_haric.includes(k); return (
                      <TouchableOpacity key={k} style={[styles.chip, s && styles.chipActive, h && styles.chipHaric]}
                        onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, bulunduguKatlar: s ? x.bulunduguKatlar.filter(ss => ss !== k) : [...x.bulunduguKatlar, k], bulunduguKatlar_haric: x.bulunduguKatlar_haric.filter(ss => ss !== k) } : x))}
                        onLongPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, bulunduguKatlar: x.bulunduguKatlar.filter(ss => ss !== k), bulunduguKatlar_haric: h ? x.bulunduguKatlar_haric.filter(ss => ss !== k) : [...x.bulunduguKatlar_haric, k] } : x))}
                        delayLongPress={500}>
                        <Text style={[styles.chipText, s && styles.chipTextActive, h && styles.chipHaricText]}>{k}</Text>
                      </TouchableOpacity>
                    ); })}
                  </View>
                </View>
                {/* Özel İstekler */}
                {tumOzellikler.length > 0 && (
                  <View>
                    <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.onSurface, textTransform: 'uppercase', letterSpacing: 0.8 }}>Özel İstekler</Text>
                    </View>
                    <View style={{ backgroundColor: Colors.surfaceContainerLow, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {tumOzellikler.map(oz => { const s = istek.ozelIstekler.includes(oz.id); const h = istek.ozelIstekler_haric.includes(oz.id); return (
                        <TouchableOpacity key={oz.id} style={[styles.chip, s && styles.chipActive, h && styles.chipHaric]}
                          onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, ozelIstekler: s ? x.ozelIstekler.filter(id => id !== oz.id) : [...x.ozelIstekler, oz.id], ozelIstekler_haric: x.ozelIstekler_haric.filter(id => id !== oz.id) } : x))}
                          onLongPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, ozelIstekler: x.ozelIstekler.filter(id => id !== oz.id), ozelIstekler_haric: h ? x.ozelIstekler_haric.filter(id => id !== oz.id) : [...x.ozelIstekler_haric, oz.id] } : x))}
                          delayLongPress={500}>
                          <Text style={[styles.chipText, s && styles.chipTextActive, h && styles.chipHaricText]}>{oz.ad}</Text>
                        </TouchableOpacity>
                      ); })}
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Takip Tarihi */}
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.label}>Takip Tarihi</Text>
            <TouchableOpacity onPress={() => setShowTakipPicker(true)} style={styles.dateBtn}>
              <Text style={[styles.dateBtnText, !takipTarihi && { color: Colors.onSurfaceVariant }]}>
                📅 {takipTarihi || 'Tarih seç'}
              </Text>
              {takipTarihi ? (
                <TouchableOpacity onPress={() => setTakipTarihi('')} hitSlop={10}>
                  <Text style={{ fontSize: 16, color: Colors.onSurfaceVariant }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
            {showTakipPicker && (
              <DateTimePicker
                value={takipTarihi ? (() => { const [d,m,y] = takipTarihi.split('.'); return new Date(+y, +m-1, +d); })() : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                locale="tr-TR"
                onChange={(_, sel) => {
                  setShowTakipPicker(Platform.OS === 'ios');
                  if (sel) {
                    const pad = (n: number) => String(n).padStart(2, '0');
                    setTakipTarihi(`${pad(sel.getDate())}.${pad(sel.getMonth()+1)}.${sel.getFullYear()}`);
                  }
                }}
              />
            )}
            {Platform.OS === 'ios' && showTakipPicker && (
              <TouchableOpacity onPress={() => setShowTakipPicker(false)} style={[styles.notKaydetBtn, { marginTop: 8, alignSelf: 'flex-start' }]}>
                <Text style={styles.notKaydetBtnText}>Tamam</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Notlar */}
          <View style={styles.notlarBox} onLayout={(e) => { notlarBoxY.current = e.nativeEvent.layout.y; }}>
            <View style={styles.notlarHeader}>
              <Text style={styles.notlarBaslik}>📝 Notlar {yeniNotlar.length > 0 ? `(${yeniNotlar.length})` : ''}</Text>
              {!notForm && (
                <TouchableOpacity onPress={notEkleAc} style={styles.notEkleBtn}>
                  <Text style={styles.notEkleBtnText}>+ Not Ekle</Text>
                </TouchableOpacity>
              )}
            </View>
            {notForm && (
              <View style={styles.notForm}>
                <TextInput
                  style={[styles.notInput, { minHeight: 60 }]}
                  placeholder="Not içeriği..."
                  placeholderTextColor={Colors.outlineVariant}
                  value={notIcerik}
                  onChangeText={setNotIcerik}
                  multiline
                  textAlignVertical="top"
                  onFocus={() => setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, notlarBoxY.current - 20), animated: true }), 300)}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <TouchableOpacity onPress={() => setShowPicker('date')} style={[styles.notInput, { flex: 1, minWidth: 160, justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 13, color: Colors.onSurface }}>📅 {notTarihGoster(notTarih.toISOString())}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={notKaydet} style={[styles.notKaydetBtn, !notIcerik.trim() && { opacity: 0.5 }]} disabled={!notIcerik.trim()}>
                    <Text style={styles.notKaydetBtnText}>{notEditIdx !== null ? 'Güncelle' : 'Kaydet'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setNotForm(false); setNotEditIdx(null); setNotIcerik(''); }} style={styles.notIptalBtn}>
                    <Text style={styles.notIptalBtnText}>İptal</Text>
                  </TouchableOpacity>
                </View>
                {showPicker && (
                  <DateTimePicker
                    value={notTarih}
                    mode={showPicker}
                    is24Hour
                    locale="tr-TR"
                    display={Platform.OS === 'ios' ? (showPicker === 'date' ? 'inline' : 'spinner') : showPicker === 'date' ? 'calendar' : 'default'}
                    onChange={(_, sel) => {
                      if (Platform.OS === 'android') {
                        if (showPicker === 'date') {
                          if (sel) {
                            const merged = new Date(notTarih);
                            merged.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate());
                            setNotTarih(merged);
                            setShowPicker('time');
                          } else { setShowPicker(null); }
                        } else {
                          if (sel) {
                            const merged = new Date(notTarih);
                            merged.setHours(sel.getHours(), sel.getMinutes());
                            setNotTarih(merged);
                          }
                          setShowPicker(null);
                        }
                      } else if (sel) {
                        setNotTarih(sel);
                      }
                    }}
                  />
                )}
                {Platform.OS === 'ios' && showPicker && (
                  <TouchableOpacity onPress={() => setShowPicker(showPicker === 'date' ? 'time' : null)} style={[styles.notKaydetBtn, { marginTop: 8, alignSelf: 'flex-start' }]}>
                    <Text style={styles.notKaydetBtnText}>{showPicker === 'date' ? 'Saat Seç' : 'Tamam'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {yeniNotlar.length === 0 && !notForm ? (
              <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontStyle: 'italic' }}>Henüz not yok.</Text>
            ) : (
              yeniNotlar.map((n, idx) => (
                <View key={idx} style={styles.notSatir}>
                  <View style={styles.notSatirHeader}>
                    <Text style={styles.notTarih}>{notTarihGoster(n.tarih)}</Text>
                    <TouchableOpacity onPress={() => Alert.alert('Not', '', [
                      { text: 'Düzenle', onPress: () => notDuzenleAc(idx) },
                      { text: 'Sil', style: 'destructive', onPress: () => notSil(idx) },
                      { text: 'İptal', style: 'cancel' },
                    ])} style={styles.notIcon}>
                      <Text style={{ fontSize: 18, color: '#fcd34d', fontWeight: '700' }}>⋯</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.notIcerik}>{n.icerik}</Text>
                </View>
              ))
            )}
          </View>

          {/* Durum */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Durum</Text>
            <View style={styles.durumRow}>
              {durumlar.map(d => (
                <TouchableOpacity key={d} style={[styles.durumBtn, durum === d && styles.durumBtnAktif]} onPress={() => setDurum(d)}>
                  <Text style={[styles.durumBtnText, durum === d && styles.durumBtnTextAktif]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Müşteri Tipi */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Müşteri Tipi</Text>
            <View style={[styles.durumRow, { flexWrap: 'wrap' }]}>
              {musteriTipleri.map(t => (
                <TouchableOpacity key={t} style={[styles.durumBtn, { flex: 0, paddingHorizontal: 16 }, musteriTipi === t && styles.durumBtnAktif]} onPress={() => setMusteriTipi(t)}>
                  <Text style={[styles.durumBtnText, musteriTipi === t && styles.durumBtnTextAktif]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Tip Seçim Modalı */}
      {tipModal !== null && (
        <Modal visible transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setTipModal(null)}>
            <View style={[styles.modalDimmer, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
            <View style={{ backgroundColor: Colors.surface, marginHorizontal: 32, marginTop: 'auto', marginBottom: 'auto', borderRadius: Radius.lg, paddingVertical: 8, alignSelf: 'center', minWidth: 220 }}>
              {TIP_LISTESI.map(t => (
                <TouchableOpacity key={t} onPress={() => {
                  setEkKisiler(p => p.map((x, i) => i === tipModal ? { ...x, tip: t } : x));
                  setTipModal(null);
                }} style={{ paddingVertical: 14, paddingHorizontal: 20 }}>
                  <Text style={{ fontSize: 15, color: Colors.onSurface, textAlign: 'center' }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Konum Modalı */}
      {activeIstekIdx !== null && filterPage !== 'main' && (
        <Modal visible={true} animationType="slide" transparent>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
            <TouchableOpacity style={styles.modalDimmer} onPress={() => { setFilterPage('main'); setActiveIstekIdx(null); }} />
            <View style={styles.modalPanel}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {([['il', 'İl'], ['ilce', 'İlçe'], ['mahalle', 'Mah.']] as ['il'|'ilce'|'mahalle', string][]).map(([p, label]) => {
                    const count = p === 'il' ? ilSayisi : p === 'ilce' ? ilceSayisi : mahSayisi;
                    const disabled = (p === 'ilce' && ilSayisi === 0) || (p === 'mahalle' && ilceSayisi === 0);
                    return (
                      <TouchableOpacity key={p} onPress={() => { if (!disabled) { setFilterPage(p); setKonumSearch(''); } }} disabled={disabled}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: filterPage === p ? Colors.primary : Colors.surfaceContainerHigh, opacity: disabled ? 0.4 : 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: filterPage === p ? '#fff' : Colors.onSurfaceVariant }}>
                          {label}{count > 0 ? ` (${count})` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity onPress={() => { setFilterPage('main'); setActiveIstekIdx(null); setKonumSearch(''); }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>Tamam</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.modalSearch}
                  placeholder="Ara..."
                  placeholderTextColor={Colors.outlineVariant}
                  value={konumSearch}
                  onChangeText={setKonumSearch}
                />
                <FlatList
                  data={filteredBoxList}
                  keyExtractor={(item, i) => `${filterPage}-${i}-${item.type === 'item' ? item.key : item.label}`}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    if (item.type === 'header') {
                      return <Text style={styles.listeGrupBaslik}>{item.label}</Text>;
                    }
                    const secili =
                      item.kind === 'il' ? ilIsaretli(item.il) :
                      item.kind === 'ilce' ? ilceIsaretli(item.il, item.ilce) :
                      mahIsaretli(item.il, item.ilce, item.mah);
                    return (
                      <TouchableOpacity
                        style={[styles.modalItem, secili && { backgroundColor: Colors.primaryFixed }]}
                        onPress={() => {
                          if (item.kind === 'il') toggleIl(item.il);
                          else if (item.kind === 'ilce') toggleIlce(item.il, item.ilce);
                          else toggleMah(item.il, item.ilce, item.mah);
                        }}
                      >
                        <View style={[styles.checkbox, secili && styles.checkboxAktif, { marginRight: 10 }]}>
                          {secili && <Text style={styles.checkboxTick}>✓</Text>}
                        </View>
                        <Text style={[styles.modalItemText, secili && { color: Colors.primary, fontWeight: '600' }, { flex: 1 }]}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
      <PersistentTabBar />
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any;
}) {
  return (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.outlineVariant}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize="words"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  scroll: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 32 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  geri: { fontSize: 22, color: Colors.onSurface },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  kaydetBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8 },
  kaydetText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  satir: { flexDirection: 'row', gap: Spacing.sm },
  inputContainer: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  input: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 8, fontSize: 13, color: Colors.onSurface },
  dateBtn: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateBtnText: { fontSize: 13, color: Colors.onSurface },
  textarea: { minHeight: 70, paddingTop: 8 },
  durumRow: { flexDirection: 'row', gap: Spacing.sm },
  durumBtn: { flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, paddingVertical: 7, alignItems: 'center' },
  durumBtnAktif: { backgroundColor: Colors.primary },
  durumBtnText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  durumBtnTextAktif: { color: '#fff' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outline },
  chipActive: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  chipHaric: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: '#ef4444' },
  chipText: { fontSize: 12, color: Colors.onSurfaceVariant, fontWeight: '500' },
  chipHaricText: { color: '#fca5a5', fontWeight: '600', textDecorationLine: 'line-through' },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },
  secimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  secimBtnText: { fontSize: 13, color: Colors.onSurface },
  secimBtnPlaceholder: { fontSize: 13, color: Colors.outlineVariant },
  secimChevron: { fontSize: 20, color: Colors.onSurfaceVariant },
  mahalleSatir: { flexDirection: 'row', gap: Spacing.sm, marginTop: 6, alignItems: 'center' },
  temizleBtn: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow },
  temizleBtnText: { fontSize: 13, color: Colors.onSurfaceVariant },
  konumChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primaryFixed, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, marginBottom: 6 },
  konumChipText: { fontSize: 14, color: Colors.primary, flex: 1 },
  konumChipSil: { fontSize: 14, color: Colors.primary, paddingLeft: 8 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalDimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalPanel: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '88%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalKapat: { fontSize: 20, color: Colors.onSurface, width: 32 },
  modalBaslik: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  modalSearch: { margin: Spacing.md, marginBottom: 0, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, fontSize: 14, color: Colors.onSurface },
  modalItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalItemText: { fontSize: 15, color: Colors.onSurface },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center' },
  checkboxAktif: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick: { fontSize: 14, color: '#fff', fontWeight: '700' },
  listeGrupBaslik: { fontSize: 12, fontWeight: '700', color: Colors.primary, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: 4, backgroundColor: Colors.primaryFixed },
  konumBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent' },
  konumBoxAktif: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  konumBoxDisabled: { opacity: 0.6 },
  konumBoxText: { fontSize: 13, color: Colors.onSurfaceVariant, flex: 1 },
  konumBoxTextAktif: { color: Colors.primary, fontWeight: '600' },
  konumBoxSil: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  konumBoxChevron: { fontSize: 14, color: Colors.onSurfaceVariant },
  etiketInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, width: 80 },
  etiketHash: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginRight: 1 },
  etiketInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: Colors.onSurface },
  notlarBox: { backgroundColor: 'rgba(234,179,8,0.10)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)', borderRadius: Radius.lg, padding: 14, marginTop: Spacing.sm },
  notlarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  notlarBaslik: { fontSize: 13, fontWeight: '700', color: '#fcd34d', letterSpacing: 0.3 },
  notEkleBtn: { backgroundColor: '#92400e', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  notEkleBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  notForm: { backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)', borderRadius: 8, padding: 10, marginBottom: 8 },
  notInput: { borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: Colors.onSurface, backgroundColor: Colors.surfaceContainerLow },
  notKaydetBtn: { backgroundColor: '#92400e', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  notKaydetBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  notIptalBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  notIptalBtnText: { color: Colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  notSatir: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4, gap: 4 },
  notSatirHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notTarih: { fontSize: 11, fontWeight: '700', color: '#fcd34d' },
  notIcerik: { fontSize: 13, color: '#fde68a', lineHeight: 18 },
  notIcon: { padding: 2 },
});
