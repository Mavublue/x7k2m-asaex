import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const ILLER = TURKIYE;
const ILLER_LISTESI = IL_LISTESI;
const EMLAK_TIPLERI = ['Daire', 'Villa', 'Arsa', 'İşyeri', 'Müstakil Ev', 'Rezidans'];
const ODALAR = ['Stüdyo', '1+0', '1+1', '2+1', '3+1', '3+2', '4+1', '5+'];
const BINA_YASLARI = ['0', '1', '2', '3', '4', '5', '6-10', '11-15', '16-20', '21-25', '+30'];
const TIP_LISTESI = ['Eş', 'Oğul', 'Kız', 'Anne', 'Baba', 'Kardeş', 'Diğer'];
const durumlar: ('Aktif' | 'Beklemede' | 'İptal')[] = ['Aktif', 'Beklemede', 'İptal'];

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
  const [butceMin, setButceMin] = useState('');
  const [butceMax, setButceMax] = useState('');
  const [tercihKonumlar, setTercihKonumlar] = useState<string[]>([]);
  const [filterPage, setFilterPage] = useState<'main' | 'il' | 'ilce' | 'mahalle'>('main');
  const [konumSearch, setKonumSearch] = useState('');

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
  const [tercihTipler, setTercihTipler] = useState<string[]>([]);
  const [minOda, setMinOda] = useState('');
  const [ozelIstekler, setOzelIstekler] = useState<string[]>([]);
  const [takipTarihi, setTakipTarihi] = useState('');
  const [binaYaslari, setBinaYaslari] = useState<string[]>([]);
  const [etiket, setEtiket] = useState('');
  const [etiketCakisma, setEtiketCakisma] = useState<{ ad: string; soyad: string | null } | null>(null);

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
  const [yeniNotlar, setYeniNotlar] = useState<{ icerik: string; tarih: string }[]>([]);
  const [notForm, setNotForm] = useState(false);
  const [notIcerik, setNotIcerik] = useState('');
  const [notTarih, setNotTarih] = useState('');
  const [notEditIdx, setNotEditIdx] = useState<number | null>(null);
  const [durum, setDurum] = useState<'Aktif' | 'Beklemede' | 'İptal'>('Aktif');
  const [ekKisiler, setEkKisiler] = useState<EkKisi[]>([]);
  const [tipModal, setTipModal] = useState<number | null>(null);
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
        .map(g => ({ semt: g.semt, mahalleler: g.mahalleler.filter(m => m.toLowerCase().includes(konumSearch.toLowerCase())) }))
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
    supabase.from('ozellikler').select('*').order('olusturma_tarihi').then(({ data }) => {
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
    setNotTarih(notTarihGoster(new Date().toISOString()));
    setNotForm(true);
  }
  function notDuzenleAc(idx: number) {
    const n = yeniNotlar[idx];
    setNotEditIdx(idx);
    setNotIcerik(n.icerik);
    setNotTarih(notTarihGoster(n.tarih));
    setNotForm(true);
  }
  function notKaydet() {
    if (!notIcerik.trim()) return;
    const parsed = notTarihParse(notTarih);
    if (!parsed) { Alert.alert('Hata', 'Tarih formatı: GG.AA.YYYY SS:DD'); return; }
    const yeni = { icerik: notIcerik.trim(), tarih: parsed.toISOString() };
    if (notEditIdx !== null) {
      setYeniNotlar(prev => prev.map((n, i) => i === notEditIdx ? yeni : n));
    } else {
      setYeniNotlar(prev => [yeni, ...prev]);
    }
    setNotForm(false); setNotEditIdx(null); setNotIcerik(''); setNotTarih('');
  }
  function notSil(idx: number) {
    setYeniNotlar(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleKaydet() {
    if (!ad) { Alert.alert('Hata', 'Ad zorunludur.'); return; }
    if (etiketCakisma) {
      Alert.alert('Etiket Çakışması', 'Bu etiket başka müşteride var');
      return;
    }
    setLoading(true);
    const tercih_konum_val = tercihKonumlar.length ? tercihKonumlar.join(' | ') : null;

    const { data: inserted, error } = await supabase.from('musteriler').insert({
      ad, soyad: soyad || null,
      telefon: birlestirTelefon(telKod, telNumara),
      butce_min: butceMin ? parseInt(butceMin.replace(/\./g, '')) : null,
      butce_max: butceMax ? parseInt(butceMax.replace(/\./g, '')) : null,
      tercih_konum: tercih_konum_val,
      tercih_tip: tercihTipler.length ? tercihTipler.join(',') : null,
      min_oda: minOda || null,
      takip_tarihi: takipTarihi ? isoFormat(takipTarihi) : null,
      bina_yasi: binaYaslari.length ? binaYaslari.join(',') : null,
      etiketler: etiket.trim() || null,
      durum,
    }).select('id').single();
    if (error) { Alert.alert('Hata', error.message); setLoading(false); return; }
    if (ozelIstekler.length && inserted) {
      const rows = ozelIstekler.map(oid => ({ musteri_id: (inserted as any).id, ozellik_id: oid }));
      const { error: jErr } = await supabase.from('musteri_ozellikler').insert(rows);
      if (jErr) { Alert.alert('Özellik kaydı hatası', jErr.message); setLoading(false); return; }
    }
    const filteredKisiler = ekKisiler.map(k => ({ ad: k.ad.trim(), telefon: birlestirTelefon(k.kod, k.numara), tip: k.tip })).filter(k => k.ad || k.telefon);
    if (filteredKisiler.length && inserted) {
      const kRows = filteredKisiler.map((k, i) => ({
        musteri_id: (inserted as any).id, ad: k.ad || '—', telefon: k.telefon, tip: k.tip || null, sira: i,
      }));
      const { error: kErr } = await supabase.from('musteri_iletisim').insert(kRows);
      if (kErr) { Alert.alert('Ek kişi kaydı hatası', kErr.message); setLoading(false); return; }
    }
    if (yeniNotlar.length && inserted) {
      const nRows = yeniNotlar.map(n => ({ musteri_id: (inserted as any).id, icerik: n.icerik, tarih: n.tarih }));
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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

          <View style={styles.satir}>
            <View style={{ flex: 1 }}><Field label="Ad *" value={ad} onChangeText={setAd} placeholder="Ahmet" /></View>
            <View style={{ flex: 1 }}><Field label="Soyad" value={soyad} onChangeText={setSoyad} placeholder="Yılmaz" /></View>
            <View style={[styles.inputContainer, { width: 80 }]}>
              <Text style={styles.label}>Etiket</Text>
              <View style={[styles.etiketInputRow, etiketCakisma && { borderWidth: 1, borderColor: Colors.primary }]}>
                <Text style={styles.etiketHash}>#</Text>
                <TextInput
                  style={styles.etiketInput}
                  placeholder="12"
                  placeholderTextColor={Colors.outlineVariant}
                  value={etiket}
                  onChangeText={v => setEtiket(v.replace(/[#\s]/g, ''))}
                  autoCapitalize="none"
                  returnKeyType="done"
                />
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
                      <TextInput style={[styles.input, { flex: 1, backgroundColor: '#fff' }]} placeholder="Ad Soyad" placeholderTextColor={Colors.outlineVariant}
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
                        style={[styles.input, { width: 110, backgroundColor: '#fff', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 14, color: Colors.onSurface }}>{k.tip} ▾</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.satir}>
            <View style={{ flex: 1 }}>
              <Field label="Bütçe Min (₺)" value={butceMin} onChangeText={v => setButceMin(formatButce(v))} placeholder="500.000" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Bütçe Max (₺)" value={butceMax} onChangeText={v => setButceMax(formatButce(v))} placeholder="2.000.000" keyboardType="numeric" />
            </View>
          </View>

          {/* Konum */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Tercih Edilen Konum</Text>
            <View style={{ flexDirection: 'column', gap: 12 }}>
              {/* İl Kutusu */}
              <TouchableOpacity
                style={[styles.konumBox, ilSayisi > 0 && styles.konumBoxAktif]}
                onPress={() => { setKonumSearch(''); setFilterPage('il'); }}
              >
                <Text style={[styles.konumBoxText, ilSayisi > 0 && styles.konumBoxTextAktif]} numberOfLines={1}>
                  {ilSayisi > 0 ? `${ilSayisi} İl Seçildi` : 'İl Seçin'}
                </Text>
                {ilSayisi > 0
                  ? <TouchableOpacity onPress={() => setTercihKonumlar([])} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                      <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                    </TouchableOpacity>
                  : <Text style={styles.konumBoxChevron}>▾</Text>
                }
              </TouchableOpacity>

              {/* İlçe Kutusu */}
              <TouchableOpacity
                style={[styles.konumBox, ilceSayisi > 0 && styles.konumBoxAktif, ilSayisi === 0 && styles.konumBoxDisabled]}
                onPress={() => { if (ilSayisi === 0) return; setKonumSearch(''); setFilterPage('ilce'); }}
                activeOpacity={ilSayisi > 0 ? 0.7 : 1}
              >
                <Text style={[styles.konumBoxText, ilceSayisi > 0 && styles.konumBoxTextAktif, ilSayisi === 0 && { color: Colors.outlineVariant }]} numberOfLines={1}>
                  {ilceSayisi > 0 ? `${ilceSayisi} İlçe Seçildi` : 'İlçe Seçin'}
                </Text>
                {ilceSayisi > 0
                  ? <TouchableOpacity onPress={() => setTercihKonumlar(prev => prev.filter(k => k.split(' / ').length === 1))} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                      <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                    </TouchableOpacity>
                  : <Text style={[styles.konumBoxChevron, ilSayisi === 0 && { color: Colors.outlineVariant }]}>▾</Text>
                }
              </TouchableOpacity>

              {/* Mahalle Kutusu */}
              <TouchableOpacity
                style={[styles.konumBox, mahSayisi > 0 && styles.konumBoxAktif, seciliIlceler.length === 0 && styles.konumBoxDisabled]}
                onPress={() => { if (seciliIlceler.length === 0) return; setKonumSearch(''); setFilterPage('mahalle'); }}
                activeOpacity={seciliIlceler.length > 0 ? 0.7 : 1}
              >
                <Text style={[styles.konumBoxText, mahSayisi > 0 && styles.konumBoxTextAktif, seciliIlceler.length === 0 && { color: Colors.outlineVariant }]} numberOfLines={1}>
                  {mahSayisi > 0 ? `${mahSayisi} Mahalle Seçildi` : 'Mahalle Seçin'}
                </Text>
                {mahSayisi > 0
                  ? <TouchableOpacity onPress={() => setTercihKonumlar(prev => prev.filter(k => k.split(' / ').length !== 3))} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                      <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                    </TouchableOpacity>
                  : <Text style={[styles.konumBoxChevron, seciliIlceler.length === 0 && { color: Colors.outlineVariant }]}>▾</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Tercih Tip */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Tercih Edilen Tip</Text>
            <View style={styles.chipRow}>
              {EMLAK_TIPLERI.map(t => {
                const secili = tercihTipler.includes(t);
                return (
                  <TouchableOpacity key={t} style={[styles.chip, secili && styles.chipActive]}
                    onPress={() => setTercihTipler(prev => secili ? prev.filter(x => x !== t) : [...prev, t])}>
                    <Text style={[styles.chipText, secili && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Min Oda */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Minimum Oda Sayısı</Text>
            <View style={styles.chipRow}>
              {ODALAR.map(o => {
                const secili = minOda === o;
                return (
                  <TouchableOpacity key={o} style={[styles.chip, secili && styles.chipActive]}
                    onPress={() => setMinOda(secili ? '' : o)}>
                    <Text style={[styles.chipText, secili && styles.chipTextActive]}>{o}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Bina Yaşı */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Bina Yaşı Tercihi</Text>
            <View style={styles.chipRow}>
              {BINA_YASLARI.map(y => {
                const secili = binaYaslari.includes(y);
                return (
                  <TouchableOpacity key={y} style={[styles.chip, secili && styles.chipActive]}
                    onPress={() => setBinaYaslari(prev => secili ? prev.filter(x => x !== y) : [...prev, y])}>
                    <Text style={[styles.chipText, secili && styles.chipTextActive]}>{y}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Özel İstekler */}
          {tumOzellikler.length > 0 && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Özel İstekler</Text>
              <View style={styles.chipRow}>
                {tumOzellikler.map(oz => {
                  const secili = ozelIstekler.includes(oz.id);
                  return (
                    <TouchableOpacity key={oz.id} style={[styles.chip, secili && styles.chipActive]}
                      onPress={() => setOzelIstekler(prev => secili ? prev.filter(x => x !== oz.id) : [...prev, oz.id])}>
                      <Text style={[styles.chipText, secili && styles.chipTextActive]}>{oz.ad}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Takip Tarihi */}
          <Field label="Takip Tarihi" value={takipTarihi} onChangeText={setTakipTarihi} placeholder="GG.AA.YYYY" keyboardType="numeric" />

          {/* Notlar */}
          <View style={styles.notlarBox}>
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
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <TextInput
                    style={[styles.notInput, { flex: 1, minWidth: 160 }]}
                    placeholder="GG.AA.YYYY SS:DD"
                    placeholderTextColor={Colors.outlineVariant}
                    value={notTarih}
                    onChangeText={setNotTarih}
                  />
                  <TouchableOpacity onPress={notKaydet} style={[styles.notKaydetBtn, !notIcerik.trim() && { opacity: 0.5 }]} disabled={!notIcerik.trim()}>
                    <Text style={styles.notKaydetBtnText}>{notEditIdx !== null ? 'Güncelle' : 'Kaydet'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setNotForm(false); setNotEditIdx(null); setNotIcerik(''); }} style={styles.notIptalBtn}>
                    <Text style={styles.notIptalBtnText}>İptal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {yeniNotlar.length === 0 && !notForm ? (
              <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontStyle: 'italic' }}>Henüz not yok.</Text>
            ) : (
              yeniNotlar.map((n, idx) => (
                <View key={idx} style={styles.notSatir}>
                  <View style={styles.notSatirHeader}>
                    <Text style={styles.notTarih}>{notTarihGoster(n.tarih)}</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity onPress={() => notDuzenleAc(idx)} style={styles.notIcon}>
                        <Text style={{ fontSize: 14 }}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => notSil(idx)} style={styles.notIcon}>
                        <Text style={{ fontSize: 14 }}>🗑</Text>
                      </TouchableOpacity>
                    </View>
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
      {filterPage !== 'main' && (
        <Modal visible={true} animationType="slide" transparent>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
            <TouchableOpacity style={styles.modalDimmer} onPress={() => setFilterPage('main')} />
            <View style={styles.modalPanel}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setFilterPage('main')}>
                  <Text style={styles.modalKapat}>←</Text>
                </TouchableOpacity>
                <Text style={styles.modalBaslik}>
                  {filterPage === 'il' ? 'İl Seçin' : filterPage === 'ilce' ? 'İlçe Seçin' : 'Mahalle Seçin'}
                </Text>
                <TouchableOpacity onPress={() => setFilterPage('main')}>
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
  scroll: { padding: Spacing.xl, gap: Spacing.md, paddingBottom: 48 },
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
  input: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },
  textarea: { minHeight: 80, paddingTop: 12 },
  durumRow: { flexDirection: 'row', gap: Spacing.sm },
  durumBtn: { flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, paddingVertical: 10, alignItems: 'center' },
  durumBtnAktif: { backgroundColor: Colors.primary },
  durumBtnText: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  durumBtnTextAktif: { color: '#fff' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outline },
  chipActive: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },
  secimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  secimBtnText: { fontSize: 15, color: Colors.onSurface },
  secimBtnPlaceholder: { fontSize: 15, color: Colors.outlineVariant },
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
  konumBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 14, borderWidth: 1, borderColor: 'transparent' },
  konumBoxAktif: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  konumBoxDisabled: { opacity: 0.6 },
  konumBoxText: { fontSize: 14, color: Colors.onSurfaceVariant, flex: 1 },
  konumBoxTextAktif: { color: Colors.primary, fontWeight: '600' },
  konumBoxSil: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  konumBoxChevron: { fontSize: 16, color: Colors.onSurfaceVariant },
  etiketInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, width: 80 },
  etiketHash: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginRight: 1 },
  etiketInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: Colors.onSurface },
  notlarBox: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: Radius.lg, padding: 14, marginTop: Spacing.sm },
  notlarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  notlarBaslik: { fontSize: 13, fontWeight: '700', color: '#92400e', letterSpacing: 0.3 },
  notEkleBtn: { backgroundColor: '#92400e', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  notEkleBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  notForm: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, padding: 10, marginBottom: 8 },
  notInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: Colors.onSurface, backgroundColor: '#fff' },
  notKaydetBtn: { backgroundColor: '#92400e', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  notKaydetBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  notIptalBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  notIptalBtnText: { color: Colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  notSatir: { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(253,230,138,0.6)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4, gap: 4 },
  notSatirHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notTarih: { fontSize: 11, fontWeight: '700', color: '#92400e' },
  notIcerik: { fontSize: 13, color: '#78350f', lineHeight: 18 },
  notIcon: { padding: 2 },
});
