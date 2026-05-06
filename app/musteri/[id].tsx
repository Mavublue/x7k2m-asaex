import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking, Modal, FlatList, SectionList, Image, Keyboard, Share,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { Musteri, Ilan, MusteriNot } from '../../types';
import R2Image from '../../components/R2Image';
import { TURKIYE, IL_LISTESI, getMahalleler, getMahalleGruplar } from '../../constants/turkiye';
import { ayirTelefon, birlestirTelefon, VARSAYILAN_TELEFON_KODU } from '../../constants/telefonKodlari';
import TelefonInput from '../../components/TelefonInput';
import DateTimePicker from '@react-native-community/datetimepicker';

const ILLER = TURKIYE;
const ILLER_LISTESI = IL_LISTESI;

const durumlar: ('Aktif' | 'Beklemede' | 'İptal')[] = ['Aktif', 'Beklemede', 'İptal'];
const EMLAK_TIPLERI = ['Daire', 'Villa', 'Arsa', 'İşyeri', 'Müstakil Ev', 'Rezidans'];
const ODALAR = ['Stüdyo', '1+0', '1+1', '2+1', '3+1', '3+2', '4+1', '5+'];
const BINA_YASLARI = ['0', '1', '2', '3', '4', '5', '6-10', '11-15', '16-20', '21-25', '+30'];
const TIP_LISTESI = ['Eş', 'Oğul', 'Kız', 'Anne', 'Baba', 'Kardeş', 'Diğer'];

type EkKisi = { id?: string; ad: string; kod: string; numara: string; tip: string };

function tarihFormat(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
function isoFormat(tr: string) {
  const parts = tr.split('.');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function notTarihGoster(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function notTarihParse(s: string): Date | null {
  // "GG.AA.YYYY SS:DD" → Date
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]));
  return isNaN(d.getTime()) ? null : d;
}

export default function MusteriDetayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [musteri, setMusteri] = useState<Musteri | null>(null);
  const [eslesen, setEslesen] = useState<Ilan[]>([]);
  const [elleEslesen, setElleEslesen] = useState<{id: string; ilan: Ilan}[]>([]);
  const [eslesenYuklendi, setEslesenYuklendi] = useState(false);
  const [eslesenYukleniyor, setEslesenYukleniyor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duzenle, setDuzenle] = useState(false);

  // Editable fields
  const [ad, setAd] = useState('');
  const [soyad, setSoyad] = useState('');
  const [varsayilanKod, setVarsayilanKod] = useState(VARSAYILAN_TELEFON_KODU);
  const [telKod, setTelKod] = useState(VARSAYILAN_TELEFON_KODU);
  const [telNumara, setTelNumara] = useState('');
  const [telefonRaw, setTelefonRaw] = useState('');
  const [butceMin, setButceMin] = useState('');
  const [butceMax, setButceMax] = useState('');
  const [konumlar, setKonumlar] = useState<string[]>([]);
  const [tempIl, setTempIl] = useState('');
  const [tempIlce, setTempIlce] = useState('');
  const [tempMahalle, setTempMahalle] = useState('');
  const [tercihTipler, setTercihTipler] = useState<string[]>([]);
  const [minOda, setMinOda] = useState('');
  const [ozelIstekler, setOzelIstekler] = useState<string[]>([]);
  const [ozellikAdlari, setOzellikAdlari] = useState<string[]>([]);
  const [takipTarihi, setTakipTarihi] = useState('');
  const [tumOzellikler, setTumOzellikler] = useState<{id: string; ad: string}[]>([]);
  const [binaYaslari, setBinaYaslari] = useState<string[]>([]);
  const [etiketCakisma, setEtiketCakisma] = useState<{ ad: string; soyad: string | null } | null>(null);
  const [notlar, setNotlar] = useState<MusteriNot[]>([]);
  const [notEkle, setNotEkle] = useState(false);
  const [notIcerik, setNotIcerik] = useState('');
  const [notTarih, setNotTarih] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState<'date' | 'time' | null>(null);
  const [notEditId, setNotEditId] = useState<string | null>(null);
  const [etiket, setEtiket] = useState('');
  const [durum, setDurum] = useState<'Aktif' | 'Beklemede' | 'İptal'>('Aktif');
  const [ekKisiler, setEkKisiler] = useState<EkKisi[]>([]);
  const [tipModal, setTipModal] = useState<number | null>(null);
  const [konumModal, setKonumModal] = useState(false);
  const [konumAcik, setKonumAcik] = useState(false);
  const [konumSayfa, setKonumSayfa] = useState<'il' | 'ilce' | 'mahalle'>('il');
  const [konumSearch, setKonumSearch] = useState('');

  function konumEkle(il: string, ilce?: string, mahalle?: string) {
    const k = [il, ilce, mahalle].filter(Boolean).join(' / ');
    setKonumlar(prev => prev.includes(k) ? prev : [...prev, k]);
  }
  const [ilanModal, setIlanModal] = useState(false);
  const [tumIlanlar, setTumIlanlar] = useState<Ilan[]>([]);
  const [ilanSearch, setIlanSearch] = useState('');
  const [pendingIlanlar, setPendingIlanlar] = useState<Ilan[]>([]);
  const [eslesiyorBulk, setEslesiyorBulk] = useState(false);

  // Link paylaş
  const [linkModal, setLinkModal] = useState(false);
  const [linkTumIlanlar, setLinkTumIlanlar] = useState<Ilan[]>([]);
  const [linkSecimIds, setLinkSecimIds] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkYukleniyor, setLinkYukleniyor] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkPortfoySearch, setLinkPortfoySearch] = useState('');
  const [linkSaat, setLinkSaat] = useState('24');


  const fetchMusteri = useCallback(async () => {
    const userKodPromise = (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return VARSAYILAN_TELEFON_KODU;
      const { data: pr } = await supabase.from('profiller').select('default_telefon_kodu').eq('id', user.id).single();
      return pr?.default_telefon_kodu || VARSAYILAN_TELEFON_KODU;
    })();

    const [
      { data },
      dKod,
      { data: kData },
      { data: nData },
      { data: jData },
    ] = await Promise.all([
      supabase.from('musteriler').select('*').eq('id', id).single(),
      userKodPromise,
      supabase.from('musteri_iletisim').select('*').eq('musteri_id', id).order('sira'),
      supabase.from('musteri_notlar').select('*').eq('musteri_id', id).order('tarih', { ascending: false }),
      supabase.from('musteri_ozellikler').select('ozellik_id, ozellikler(ad)').eq('musteri_id', id),
    ]);

    if (data) {
      setMusteri(data);
      setAd(data.ad ?? '');
      setSoyad(data.soyad ?? '');
      setTelefonRaw(data.telefon ?? '');

      setVarsayilanKod(dKod);
      const sp = ayirTelefon(data.telefon, dKod);
      setTelKod(sp.kod); setTelNumara(sp.numara.replace(/\D/g, ''));
      setButceMin(data.butce_min ? formatButce(String(data.butce_min)) : '');
      setButceMax(data.butce_max ? formatButce(String(data.butce_max)) : '');
      setKonumlar((data.tercih_konum ?? '').split(/\s*\|\s*/).filter(Boolean));
      setTercihTipler(data.tercih_tip ? data.tercih_tip.split(',') : []);
      setMinOda(data.min_oda ?? '');
      setTakipTarihi(data.takip_tarihi ? tarihFormat(data.takip_tarihi) : '');
      setBinaYaslari(data.bina_yasi ? data.bina_yasi.split(',') : []);
      setEtiket(data.etiketler ?? '');
      setDurum(data.durum ?? 'Aktif');

      setEkKisiler((kData ?? []).map((k: any) => {
        const sp2 = ayirTelefon(k.telefon, dKod);
        return { id: k.id, ad: k.ad ?? '', kod: sp2.kod, numara: sp2.numara.replace(/\D/g, ''), tip: k.tip ?? 'Eş' };
      }));

      setNotlar((nData ?? []) as MusteriNot[]);

      if (jData) {
        setOzelIstekler(jData.map((r: any) => r.ozellik_id));
        setOzellikAdlari(jData.map((r: any) => r.ozellikler?.ad).filter(Boolean));
      } else {
        setOzelIstekler([]);
        setOzellikAdlari([]);
      }

    }
    setLoading(false);
  }, [id]);

  const fetchTumOzellikler = useCallback(async () => {
    if (tumOzellikler.length > 0) return;
    const { data } = await supabase.from('ozellikler').select('*').order('olusturma_tarihi');
    if (data) setTumOzellikler(data);
  }, [tumOzellikler.length]);

  const fetchEslesenIlanlar = useCallback(async () => {
    if (!musteri) return;
    setEslesenYukleniyor(true);
    const [{ data: eslesme }, autoIlanlar] = await Promise.all([
      supabase.from('eslesmeler').select('id, ilan_id, ilanlar(*)').eq('musteri_id', id),
      (async () => {
        let query = supabase.from('ilanlar').select('*');
        if (musteri.butce_min) query = query.gte('fiyat', musteri.butce_min);
        if (musteri.butce_max) query = query.lte('fiyat', musteri.butce_max);
        if (musteri.tercih_tip) {
          const tipler = musteri.tercih_tip.split(',').map((t: string) => t.trim()).filter(Boolean);
          if (tipler.length > 0) query = query.or(tipler.map((t: string) => `kategori.ilike.%${t}%`).join(','));
        }
        let konumListesi: string[] = [];
        if (musteri.tercih_konum) {
          konumListesi = musteri.tercih_konum.split(/\s*\|\s*/).filter(Boolean);
          const iller = Array.from(new Set(konumListesi.map((k: string) => k.split(' / ')[0].trim()).filter(Boolean)));
          if (iller.length) {
            const orStr = iller.map((il: string) => `konum.ilike.${il}`).join(',');
            query = query.or(orStr);
          }
        }
        if (!musteri.butce_min && !musteri.butce_max && !musteri.tercih_tip && !musteri.tercih_konum) {
          return { ilanlar: [] as any[], konumListesi };
        }
        const { data: ilanlar } = await query.limit(50);
        return { ilanlar: ilanlar ?? [], konumListesi };
      })(),
    ]);

    setElleEslesen((eslesme ?? []).map((e: any) => ({ id: e.id, ilan: e.ilanlar })));

    const { ilanlar, konumListesi } = autoIlanlar;
    let filtered = ilanlar;
    if (konumListesi.length) {
      filtered = filtered.filter((i: any) => konumListesi.some((konum: string) => {
        const [il, ilce, mah] = konum.split(' / ').map((p: string) => p.trim());
        if (mah) {
          if (il && i.konum?.toLowerCase() !== il.toLowerCase()) return false;
          if (ilce && i.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
          if (!i.mahalle?.toLowerCase().includes(mah.toLowerCase())) return false;
          return true;
        }
        if (ilce) {
          if (il && i.konum?.toLowerCase() !== il.toLowerCase()) return false;
          if (i.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
          return true;
        }
        if (il) return i.konum?.toLowerCase() === il.toLowerCase();
        return false;
      }));
    }
    setEslesen(filtered.slice(0, 20));
    setEslesenYuklendi(true);
    setEslesenYukleniyor(false);
  }, [id, musteri]);

  useFocusEffect(useCallback(() => { fetchMusteri(); }, [fetchMusteri]));

  useEffect(() => {
    const e = etiket.trim();
    if (!e || !duzenle) { setEtiketCakisma(null); return; }
    const handle = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('musteriler').select('ad, soyad').eq('user_id', user.id).eq('etiketler', e).neq('id', id).limit(1);
      setEtiketCakisma(data && data.length > 0 ? (data[0] as { ad: string; soyad: string | null }) : null);
    }, 400);
    return () => clearTimeout(handle);
  }, [etiket, id, duzenle]);

  function formatButce(val: string) {
    const digits = val.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  async function handleKaydet() {
    if (!ad) { Alert.alert('Hata', 'Ad zorunludur.'); return; }
    if (etiketCakisma) {
      Alert.alert('Etiket Çakışması', 'Bu etiket başka müşteride var');
      return;
    }
    setSaving(true);
    const tamTelefon = birlestirTelefon(telKod, telNumara);
    const { error } = await supabase.from('musteriler').update({
      ad, soyad: soyad || null,
      telefon: tamTelefon,
      butce_min: butceMin ? parseInt(butceMin.replace(/\./g, '')) : null,
      butce_max: butceMax ? parseInt(butceMax.replace(/\./g, '')) : null,
      tercih_konum: konumlar.length ? konumlar.join(' | ') : null,
      tercih_tip: tercihTipler.length ? tercihTipler.join(',') : null,
      min_oda: minOda || null,
      takip_tarihi: takipTarihi ? isoFormat(takipTarihi) : null,
      bina_yasi: binaYaslari.length ? binaYaslari.join(',') : null,
      etiketler: etiket.trim() || null,
      durum,
    }).eq('id', id);

    if (error) { Alert.alert('Hata', error.message); setSaving(false); return; }

    await supabase.from('musteri_ozellikler').delete().eq('musteri_id', id);
    if (ozelIstekler.length) {
      const rows = ozelIstekler.map(oid => ({ musteri_id: id, ozellik_id: oid }));
      const { error: jErr } = await supabase.from('musteri_ozellikler').insert(rows);
      if (jErr) { Alert.alert('Özellik kaydı hatası', jErr.message); setSaving(false); return; }
    }

    await supabase.from('musteri_iletisim').delete().eq('musteri_id', id);
    const cleanKisiler = ekKisiler.map(k => ({ ad: k.ad.trim(), telefon: birlestirTelefon(k.kod, k.numara), tip: k.tip })).filter(k => k.ad || k.telefon);
    if (cleanKisiler.length) {
      const kRows = cleanKisiler.map((k, i) => ({
        musteri_id: id, ad: k.ad || '—', telefon: k.telefon, tip: k.tip || null, sira: i,
      }));
      const { error: kErr } = await supabase.from('musteri_iletisim').insert(kRows);
      if (kErr) { Alert.alert('Ek kişi kaydı hatası', kErr.message); setSaving(false); return; }
    }

    setDuzenle(false);
    fetchMusteri();
    setSaving(false);
  }

  async function handleIlanModalAc() {
    const { data } = await supabase.from('ilanlar').select('*').eq('durum', 'Aktif').order('olusturma_tarihi', { ascending: false });
    setTumIlanlar(data ?? []);
    setIlanSearch('');
    setPendingIlanlar([]);
    setIlanModal(true);
  }

  function togglePendingIlan(ilan: Ilan) {
    const zaten = elleEslesen.some(e => e.ilan?.id === ilan.id);
    if (zaten) return;
    setPendingIlanlar(prev =>
      prev.some(i => i.id === ilan.id) ? prev.filter(i => i.id !== ilan.id) : [...prev, ilan]
    );
  }

  async function handleEslesBulk() {
    if (pendingIlanlar.length === 0) return;
    setEslesiyorBulk(true);
    for (const ilan of pendingIlanlar) {
      const zaten = elleEslesen.some(e => e.ilan?.id === ilan.id);
      if (!zaten) {
        await supabase.from('eslesmeler').insert({ musteri_id: id, ilan_id: ilan.id });
      }
    }
    setIlanModal(false);
    setPendingIlanlar([]);
    setEslesiyorBulk(false);
    fetchMusteri();
  }

  async function handleEslesIptal(eslesmeId: string) {
    Alert.alert('Eşleşmeyi İptal Et', 'Bu eşleştirmeyi kaldırmak istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal Et', style: 'destructive', onPress: async () => {
        await supabase.from('eslesmeler').delete().eq('id', eslesmeId);
        fetchMusteri();
      }},
    ]);
  }

  async function handleLinkModalAc() {
    setLinkModal(true);
    setLinkUrl(null);
    setLinkSecimIds([]);
    setLinkSearch('');
    setLinkPortfoySearch('');
    if (linkTumIlanlar.length === 0) {
      setLinkYukleniyor(true);
      const { data } = await supabase.from('ilanlar').select('*').eq('durum', 'Aktif').order('olusturma_tarihi', { ascending: false });
      setLinkTumIlanlar(data ?? []);
      setLinkYukleniyor(false);
    }
  }

  function toggleLinkIlan(ilanId: string) {
    setLinkSecimIds(prev => prev.includes(ilanId) ? prev.filter(x => x !== ilanId) : [...prev, ilanId]);
  }

  async function handleLinkOlustur() {
    if (linkSecimIds.length === 0) return;
    setLinkYukleniyor(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLinkYukleniyor(false); return; }
    const expiresAt = new Date(Date.now() + parseInt(linkSaat) * 60 * 60 * 1000).toISOString();
    const { data: mevcutMt } = await supabase.from('musteri_tokenler').select('token').eq('user_id', session.user.id).eq('musteri_id', id).single();
    let musteriToken: string;
    if (mevcutMt) {
      musteriToken = mevcutMt.token;
      await supabase.from('musteri_tokenler').update({ expires_at: expiresAt }).eq('user_id', session.user.id).eq('musteri_id', id);
    } else {
      const arr = new Uint8Array(12);
      crypto.getRandomValues(arr);
      musteriToken = Array.from(arr).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
      await supabase.from('musteri_tokenler').insert({ token: musteriToken, user_id: session.user.id, musteri_id: id, expires_at: expiresAt });
    }
    const trMap: Record<string, string> = { ğ:'g', ü:'u', ş:'s', ı:'i', ö:'o', ç:'c', İ:'i', Ğ:'g', Ü:'u', Ş:'s', Ö:'o', Ç:'c' };
    const adNorm = (musteri?.ad ?? '').toLowerCase().replace(/[ğüşıöçİĞÜŞÖÇ]/g, (c: string) => trMap[c] ?? c).replace(/[^a-z0-9]/g, '').slice(0, 10);
    const arr2 = new Uint8Array(3);
    crypto.getRandomValues(arr2);
    const suffix = Array.from(arr2).map(b => b.toString(36)).join('').slice(0, 4);
    const paketToken = `${adNorm || 'ilan'}-${suffix}`;
    const { error } = await supabase.from('paylasim_paketleri').insert({ token: paketToken, ilan_ids: linkSecimIds, emlakci_id: session.user.id, musteri_token: musteriToken, expires_at: expiresAt });
    if (error) { Alert.alert('Hata', error.message); setLinkYukleniyor(false); return; }
    const url = `https://www.emlak-otomasyon.com/ozel-ilanlar/${paketToken}/${musteriToken}`;
    setLinkUrl(url);
    setLinkYukleniyor(false);
  }

  function notEkleAc() {
    setNotEditId(null);
    setNotIcerik('');
    setNotTarih(new Date());
    setNotEkle(true);
  }

  function notDuzenleAc(n: MusteriNot) {
    setNotEditId(n.id);
    setNotIcerik(n.icerik);
    const d = new Date(n.tarih);
    setNotTarih(isNaN(d.getTime()) ? new Date() : d);
    setNotEkle(true);
  }

  async function refreshNotlar() {
    const { data } = await supabase.from('musteri_notlar')
      .select('*').eq('musteri_id', id).order('tarih', { ascending: false });
    setNotlar((data ?? []) as MusteriNot[]);
  }

  async function handleNotKaydet() {
    if (!notIcerik.trim()) return;
    const tarihIso = notTarih.toISOString();
    if (notEditId) {
      const { error } = await supabase.from('musteri_notlar').update({ icerik: notIcerik.trim(), tarih: tarihIso }).eq('id', notEditId);
      if (error) { Alert.alert('Hata', error.message); return; }
    } else {
      const { error } = await supabase.from('musteri_notlar').insert({ musteri_id: id, icerik: notIcerik.trim(), tarih: tarihIso });
      if (error) { Alert.alert('Hata', error.message); return; }
    }
    setNotEkle(false);
    setNotEditId(null);
    setNotIcerik('');
    refreshNotlar();
  }

  async function handleNotSil(notId: string) {
    Alert.alert('Notu Sil', 'Bu not silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await supabase.from('musteri_notlar').delete().eq('id', notId);
        setNotlar(prev => prev.filter(n => n.id !== notId));
      }},
    ]);
  }

  async function handleSil() {
    Alert.alert('Müşteriyi Sil', 'Bu müşteriyi silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await supabase.from('musteriler').delete().eq('id', id);
        router.replace('/(tabs)/musteriler');
      }},
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!musteri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><Text>Müşteri bulunamadı</Text></View>
      </SafeAreaView>
    );
  }

  const initials = `${ad[0] ?? '?'}${soyad[0] ?? ''}`.toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.geri}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{ad} {soyad}</Text>
        <View style={styles.headerActions}>
          {duzenle ? (
            <TouchableOpacity style={styles.kaydetBtn} onPress={handleKaydet} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.kaydetText}>Kaydet</Text>}
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.duzenleBtn} onPress={() => { setDuzenle(true); fetchTumOzellikler(); }}>
                <Text style={styles.duzenleBtnText}>✏️ Düzenle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkBtn} onPress={handleLinkModalAc}>
                <Text style={styles.linkBtnText}>🔗</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.silBtn} onPress={handleSil}>
                <Text style={styles.silBtnText}>🗑️</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={true}>

          {/* Avatar + İletişim */}
          <View style={styles.profilBox}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.profilAd}>{ad} {soyad}</Text>
              {telefonRaw ? (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${telefonRaw}`)}>
                  <Text style={styles.profilTelefon}>📞 {telefonRaw}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={[styles.durumBadge, {
                backgroundColor: durum === 'Aktif' ? '#dcfce7' : durum === 'Beklemede' ? '#fef9c3' : '#fee2e2'
              }]}>
                <Text style={[styles.durumBadgeText, {
                  color: durum === 'Aktif' ? '#166534' : durum === 'Beklemede' ? '#854d0e' : '#991b1b'
                }]}>{durum}</Text>
              </View>
              {etiket ? <View style={styles.etiketBadge}><Text style={styles.etiketBadgeText}>#{etiket}</Text></View> : null}
            </View>
          </View>

          {duzenle ? (
            <>
              <View style={styles.satir}>
                <View style={{ flex: 1 }}>
                  <Field label="Ad *" value={ad} onChangeText={setAd} placeholder="Ahmet" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Soyad" value={soyad} onChangeText={setSoyad} placeholder="Yılmaz" />
                </View>
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
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Tercih Edilen Konum</Text>
                {konumlar.map((k, i) => (
                  <View key={i} style={styles.konumChip}>
                    <Text style={styles.konumChipText}>📍 {k}</Text>
                    <TouchableOpacity onPress={() => setKonumlar(prev => prev.filter((_, j) => j !== i))}>
                      <Text style={styles.konumChipSil}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.secimBtn} onPress={() => { setTempIl(''); setTempIlce(''); setTempMahalle(''); setKonumSearch(''); setKonumSayfa('il'); setKonumModal(true); }}>
                  <Text style={styles.secimBtnPlaceholder}>+ Konum Ekle</Text>
                  <Text style={styles.secimChevron}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Tercih Edilen Tip</Text>
                <View style={styles.chipRow}>
                  {EMLAK_TIPLERI.map(t => {
                    const secili = tercihTipler.includes(t);
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[styles.chip, secili && styles.chipActive]}
                        onPress={() => setTercihTipler(prev =>
                          secili ? prev.filter(x => x !== t) : [...prev, t]
                        )}
                      >
                        <Text style={[styles.chipText, secili && styles.chipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Minimum Oda Sayısı</Text>
                <View style={styles.chipRow}>
                  {ODALAR.map(o => {
                    const secili = minOda === o;
                    return (
                      <TouchableOpacity
                        key={o}
                        style={[styles.chip, secili && styles.chipActive]}
                        onPress={() => setMinOda(secili ? '' : o)}
                      >
                        <Text style={[styles.chipText, secili && styles.chipTextActive]}>{o}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
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
              {tumOzellikler.length > 0 && (
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Özel İstekler</Text>
                  <View style={styles.chipRow}>
                    {tumOzellikler.map(oz => {
                      const secili = ozelIstekler.includes(oz.id);
                      return (
                        <TouchableOpacity
                          key={oz.id}
                          style={[styles.chip, secili && styles.chipActive]}
                          onPress={() => setOzelIstekler(prev =>
                            secili ? prev.filter(x => x !== oz.id) : [...prev, oz.id]
                          )}
                        >
                          <Text style={[styles.chipText, secili && styles.chipTextActive]}>{oz.ad}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Takip Tarihi</Text>
                <TextInput
                  style={styles.input}
                  placeholder="GG.AA.YYYY"
                  placeholderTextColor={Colors.outlineVariant}
                  value={takipTarihi}
                  onChangeText={setTakipTarihi}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>

              {/* Notlar (edit modunda da göster) */}
              <View style={styles.notlarBox}>
                <View style={styles.notlarHeader}>
                  <Text style={styles.notlarBaslik}>📝 Notlar {notlar.length > 0 ? `(${notlar.length})` : ''}</Text>
                  {!notEkle && (
                    <TouchableOpacity onPress={notEkleAc} style={styles.notEkleBtn}>
                      <Text style={styles.notEkleBtnText}>+ Not Ekle</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {notEkle && (
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
                      <TouchableOpacity onPress={() => setShowPicker('date')} style={[styles.notInput, { flex: 1, minWidth: 160, justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 13, color: Colors.onSurface }}>📅 {notTarihGoster(notTarih.toISOString())}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleNotKaydet} style={[styles.notKaydetBtn, !notIcerik.trim() && { opacity: 0.5 }]} disabled={!notIcerik.trim()}>
                        <Text style={styles.notKaydetBtnText}>{notEditId ? 'Güncelle' : 'Kaydet'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setNotEkle(false); setNotEditId(null); setNotIcerik(''); }} style={styles.notIptalBtn}>
                        <Text style={styles.notIptalBtnText}>İptal</Text>
                      </TouchableOpacity>
                    </View>
                    {showPicker && (
                      <DateTimePicker
                        value={notTarih}
                        mode={showPicker}
                        is24Hour
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
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
                      <TouchableOpacity onPress={() => setShowPicker(showPicker === 'date' ? 'time' : null)} style={[styles.notKaydetBtn, { marginTop: 8 }]}>
                        <Text style={styles.notKaydetBtnText}>{showPicker === 'date' ? 'Saat Seç' : 'Tamam'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {notlar.length === 0 && !notEkle ? (
                  <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontStyle: 'italic' }}>Henüz not yok.</Text>
                ) : (
                  notlar.map(n => (
                    <View key={n.id} style={styles.notSatir}>
                      <View style={styles.notSatirHeader}>
                        <Text style={styles.notTarih}>{notTarihGoster(n.tarih)}</Text>
                        <TouchableOpacity onPress={() => Alert.alert('Not', '', [
                          { text: 'Düzenle', onPress: () => notDuzenleAc(n) },
                          { text: 'Sil', style: 'destructive', onPress: () => handleNotSil(n.id) },
                          { text: 'İptal', style: 'cancel' },
                        ])} style={styles.notIcon}>
                          <Text style={{ fontSize: 18, color: '#92400e', fontWeight: '700' }}>⋯</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.notIcerik}>{n.icerik}</Text>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Durum</Text>
                <View style={styles.durumRow}>
                  {durumlar.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.durumBtn, durum === d && styles.durumBtnAktif]}
                      onPress={() => setDurum(d)}
                    >
                      <Text style={[styles.durumBtnText, durum === d && styles.durumBtnTextAktif]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <>
                {/* Ek Kişiler */}
                {ekKisiler.length > 0 && (
                  <View style={[styles.infoBox, { marginBottom: Spacing.sm }]}>
                    <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Ek Kişiler</Text>
                    {ekKisiler.map((k, i) => (
                      <View key={k.id ?? i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < ekKisiler.length - 1 ? 1 : 0, borderBottomColor: Colors.surfaceContainerLow }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.onSurface }}>{k.ad}</Text>
                            {k.tip ? (
                              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: Colors.primaryFixed }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.primary }}>{k.tip}</Text>
                              </View>
                            ) : null}
                          </View>
                          {k.numara ? (
                            <TouchableOpacity onPress={() => Linking.openURL(`tel:${birlestirTelefon(k.kod, k.numara) ?? ''}`)}>
                              <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 }}>📞 {birlestirTelefon(k.kod, k.numara)}</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Bütçe & Konum Bilgisi */}
                  <View style={styles.infoBox}>
                    {(butceMin || butceMax) ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Bütçe</Text>
                        <Text style={styles.infoDeger}>
                          ₺{butceMin || '?'} – ₺{butceMax || '?'}
                        </Text>
                      </View>
                    ) : null}
                    {konumlar.length > 0 ? (
                      <View style={[styles.infoRow, { alignItems: 'flex-start' }]}>
                        <Text style={[styles.infoLabel, { paddingTop: 2 }]}>Tercih Konum</Text>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          {(konumAcik ? konumlar : konumlar.slice(0, 2)).map((k, i) => (
                            <Text key={i} style={[styles.infoDeger, { textAlign: 'right' }]}>📍 {k}</Text>
                          ))}
                          {konumlar.length > 2 && (
                            <TouchableOpacity onPress={() => setKonumAcik(p => !p)}>
                              <Text style={{ fontSize: 12, color: Colors.primary, marginTop: 2 }}>
                                {konumAcik ? 'Daha az göster' : `+${konumlar.length - 2} daha...`}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ) : null}
                    {tercihTipler.length > 0 ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Tercih Tip</Text>
                        <Text style={styles.infoDeger}>{tercihTipler.join(', ')}</Text>
                      </View>
                    ) : null}
                    {minOda ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Min. Oda</Text>
                        <Text style={styles.infoDeger}>{minOda}</Text>
                      </View>
                    ) : null}
                    {binaYaslari.length > 0 ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Bina Yaşı</Text>
                        <Text style={[styles.infoDeger, { flex: 1, textAlign: 'right' }]}>{binaYaslari.join(', ')}</Text>
                      </View>
                    ) : null}
                    {ozellikAdlari.length > 0 ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Özel İstekler</Text>
                        <Text style={[styles.infoDeger, { flex: 1, textAlign: 'right' }]}>{ozellikAdlari.join(', ')}</Text>
                      </View>
                    ) : null}
                    {takipTarihi ? (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Takip Tarihi</Text>
                        <Text style={[styles.infoDeger, { color: Colors.primary }]}>📅 {takipTarihi}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Notlar */}
                  <View style={styles.notlarBox}>
                    <View style={styles.notlarHeader}>
                      <Text style={styles.notlarBaslik}>📝 Notlar {notlar.length > 0 ? `(${notlar.length})` : ''}</Text>
                      {!notEkle && (
                        <TouchableOpacity onPress={notEkleAc} style={styles.notEkleBtn}>
                          <Text style={styles.notEkleBtnText}>+ Not Ekle</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {notEkle && (
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
                          <TouchableOpacity onPress={() => setShowPicker('date')} style={[styles.notInput, { flex: 1, minWidth: 160, justifyContent: 'center' }]}>
                            <Text style={{ fontSize: 13, color: Colors.onSurface }}>📅 {notTarihGoster(notTarih.toISOString())}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={handleNotKaydet} style={[styles.notKaydetBtn, !notIcerik.trim() && { opacity: 0.5 }]} disabled={!notIcerik.trim()}>
                            <Text style={styles.notKaydetBtnText}>{notEditId ? 'Güncelle' : 'Kaydet'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => { setNotEkle(false); setNotEditId(null); setNotIcerik(''); }} style={styles.notIptalBtn}>
                            <Text style={styles.notIptalBtnText}>İptal</Text>
                          </TouchableOpacity>
                        </View>
                        {showPicker && (
                          <DateTimePicker
                            value={notTarih}
                            mode={showPicker}
                            is24Hour
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
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
                          <TouchableOpacity onPress={() => setShowPicker(showPicker === 'date' ? 'time' : null)} style={[styles.notKaydetBtn, { marginTop: 8 }]}>
                            <Text style={styles.notKaydetBtnText}>{showPicker === 'date' ? 'Saat Seç' : 'Tamam'}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    {notlar.length === 0 && !notEkle ? (
                      <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontStyle: 'italic' }}>Henüz not yok.</Text>
                    ) : (
                      notlar.map(n => (
                        <View key={n.id} style={styles.notSatir}>
                          <View style={styles.notSatirHeader}>
                            <Text style={styles.notTarih}>{notTarihGoster(n.tarih)}</Text>
                            <TouchableOpacity onPress={() => Alert.alert('Not', '', [
                              { text: 'Düzenle', onPress: () => notDuzenleAc(n) },
                              { text: 'Sil', style: 'destructive', onPress: () => handleNotSil(n.id) },
                              { text: 'İptal', style: 'cancel' },
                            ])} style={styles.notIcon}>
                              <Text style={{ fontSize: 18, color: '#92400e', fontWeight: '700' }}>⋯</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.notIcerik}>{n.icerik}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {/* İlan Eşleşmeleri (lazy) */}
                  {!eslesenYuklendi ? (
                    <TouchableOpacity
                      style={styles.eslesGosterBtn}
                      onPress={fetchEslesenIlanlar}
                      disabled={eslesenYukleniyor}
                    >
                      {eslesenYukleniyor ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.eslesGosterText}>İlan Eşleşmelerini Göster</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <>
                  {/* Elle Eşleştirilenler */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm }}>
                    <Text style={styles.sectionTitle}>Elle Eşleştirilenler</Text>
                    <TouchableOpacity style={styles.eslesBtn} onPress={handleIlanModalAc}>
                      <Text style={styles.eslesBtnText}>+ İlan Eşleştir</Text>
                    </TouchableOpacity>
                  </View>
                  {elleEslesen.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>Elle eşleştirilmiş ilan yok</Text>
                </View>
              ) : (
                elleEslesen.map(({ id: eslesmeId, ilan }) => ilan ? (
                  <View key={eslesmeId} style={styles.ilanKartWrap}>
                    <TouchableOpacity style={[styles.ilanKart, { flex: 1 }]} onPress={() => router.push(`/ilan/${ilan.id}` as any)}>
                      {ilan.fotograflar?.[0] ? (
                        <R2Image source={ilan.fotograflar[0]} style={styles.ilanFoto} resizeMode="cover" size="sm" />
                      ) : (
                        <View style={styles.ilanFotoPlaceholder}>
                          <Text style={{ fontSize: 20 }}>🏠</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.ilanBaslik} numberOfLines={1}>{ilan.baslik}</Text>
                          <View style={styles.elleBadge}><Text style={styles.elleBadgeText}>Elle</Text></View>
                        </View>
                        <Text style={styles.ilanKonum}>📍 {ilan.konum}{ilan.ilce ? `, ${ilan.ilce}` : ''}</Text>
                      </View>
                      <Text style={styles.ilanFiyat}>₺{ilan.fiyat?.toLocaleString('tr-TR')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iptalBtn} onPress={() => handleEslesIptal(eslesmeId)}>
                      <Text style={styles.iptalBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : null)
              )}

              {/* Otomatik Eşleşenler */}
              <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Otomatik Eşleşenler</Text>
              {eslesen.filter(ilan => !elleEslesen.some(e => e.ilan?.id === ilan.id)).length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Bütçeye uygun ilan bulunamadı</Text>
                </View>
              ) : (
                eslesen
                  .filter(ilan => !elleEslesen.some(e => e.ilan?.id === ilan.id))
                  .map(ilan => (
                    <TouchableOpacity key={ilan.id} style={styles.ilanKart} onPress={() => router.push(`/ilan/${ilan.id}` as any)}>
                      {ilan.fotograflar?.[0] ? (
                        <R2Image source={ilan.fotograflar[0]} style={styles.ilanFoto} resizeMode="cover" size="sm" />
                      ) : (
                        <View style={styles.ilanFotoPlaceholder}>
                          <Text style={{ fontSize: 20 }}>🏠</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ilanBaslik} numberOfLines={1}>{ilan.baslik}</Text>
                        <Text style={styles.ilanKonum}>📍 {ilan.konum}{ilan.ilce ? `, ${ilan.ilce}` : ''}</Text>
                      </View>
                      <Text style={styles.ilanFiyat}>₺{ilan.fiyat.toLocaleString('tr-TR')}</Text>
                    </TouchableOpacity>
                  ))
              )}
                    </>
                  )}
            </>
          )}

        </ScrollView>

      {/* Tip Seçim Modalı */}
      {tipModal !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setTipModal(null)}>
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

      {/* İlan Seçim Modali (çoklu) */}
      <Modal visible={ilanModal} animationType="slide" transparent onRequestClose={() => setIlanModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDimmer} onPress={() => setIlanModal(false)} />
          <View style={[styles.modalPanel, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setIlanModal(false)}>
                <Text style={styles.modalKapat}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalBaslik}>İlan Seç</Text>
              <View style={{ width: 32 }} />
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="İlan ara..."
              placeholderTextColor={Colors.outlineVariant}
              value={ilanSearch}
              onChangeText={setIlanSearch}
            />
            <FlatList
              data={tumIlanlar.filter(i =>
                i.baslik?.toLowerCase().includes(ilanSearch.toLowerCase()) ||
                i.konum?.toLowerCase().includes(ilanSearch.toLowerCase())
              )}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const zaten = elleEslesen.some(e => e.ilan?.id === item.id);
                const secili = pendingIlanlar.some(i => i.id === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.ilanKart, { marginHorizontal: Spacing.md, marginBottom: Spacing.sm, opacity: zaten ? 0.5 : 1, backgroundColor: secili ? Colors.primaryFixed : Colors.surfaceContainerLowest }]}
                    onPress={() => !zaten && togglePendingIlan(item)}
                    disabled={zaten}
                  >
                    <View style={[styles.secimKutucuk, { borderColor: secili ? Colors.primary : Colors.outline, backgroundColor: secili ? Colors.primary : 'transparent' }]}>
                      {secili && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
                    </View>
                    {item.fotograflar?.[0] ? (
                      <R2Image source={item.fotograflar[0]} style={styles.ilanFoto} resizeMode="cover" size="sm" />
                    ) : (
                      <View style={styles.ilanFotoPlaceholder}>
                        <Text style={{ fontSize: 20 }}>🏠</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.ilanBaslik} numberOfLines={1}>{item.baslik}</Text>
                        {zaten && <View style={styles.zatenBadge}><Text style={styles.zatenBadgeText}>Eklendi</Text></View>}
                      </View>
                      <Text style={styles.ilanKonum}>📍 {item.konum}{item.ilce ? `, ${item.ilce}` : ''}</Text>
                    </View>
                    <Text style={styles.ilanFiyat}>₺{item.fiyat?.toLocaleString('tr-TR')}</Text>
                  </TouchableOpacity>
                );
              }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingTop: Spacing.sm, paddingBottom: 80 }}
            />
            {/* Footer */}
            <View style={styles.modalFooter}>
              <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>
                {pendingIlanlar.length > 0 ? `${pendingIlanlar.length} ilan seçildi` : 'İlan seçin'}
              </Text>
              <TouchableOpacity
                style={[styles.eslesBulkBtn, { opacity: pendingIlanlar.length === 0 || eslesiyorBulk ? 0.5 : 1 }]}
                onPress={handleEslesBulk}
                disabled={pendingIlanlar.length === 0 || eslesiyorBulk}
              >
                {eslesiyorBulk
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.eslesBulkBtnText}>Eşleştir{pendingIlanlar.length > 0 ? ` (${pendingIlanlar.length})` : ''}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Konum Seçim Modali */}
      <Modal visible={konumModal} animationType="slide" transparent onRequestClose={() => {
        if (konumSayfa === 'mahalle') { setKonumSayfa('ilce'); setKonumSearch(''); }
        else if (konumSayfa === 'ilce') { setKonumSayfa('il'); setKonumSearch(''); }
        else setKonumModal(false);
      }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <TouchableOpacity style={styles.modalDimmer} onPress={() => setKonumModal(false)} />
          <View style={styles.modalPanel}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => {
                if (konumSayfa === 'mahalle') { setKonumSayfa('ilce'); setKonumSearch(''); }
                else if (konumSayfa === 'ilce') { setKonumSayfa('il'); setKonumSearch(''); }
                else setKonumModal(false);
              }}>
                <Text style={styles.modalKapat}>{konumSayfa !== 'il' ? '←' : '✕'}</Text>
              </TouchableOpacity>
              <Text style={styles.modalBaslik}>
                {konumSayfa === 'il' ? 'İl Seçin' : konumSayfa === 'ilce' ? 'İlçe Seçin' : 'Mahalle Seçin'}
              </Text>
              {konumSayfa !== 'il' ? (
                <TouchableOpacity onPress={() => { konumEkle(tempIl, tempIlce, tempMahalle); setKonumModal(false); }}>
                  <Text style={{ fontSize: 13, color: Colors.primary }}>Ekle</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 32 }} />}
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder={konumSayfa === 'il' ? 'İl ara...' : konumSayfa === 'ilce' ? 'İlçe ara...' : 'Mahalle ara...'}
              placeholderTextColor={Colors.outlineVariant}
              value={konumSearch}
              onChangeText={setKonumSearch}
            />
            {konumSayfa === 'mahalle' ? (
              <SectionList
                sections={getMahalleGruplar(tempIl, tempIlce)
                  .map(g => ({
                    title: g.semt ?? '',
                    showHeader: g.semt !== null,
                    data: g.mahalleler.filter(m => m.toLowerCase().includes(konumSearch.toLowerCase())),
                  }))
                  .filter(s => s.data.length > 0)}
                keyExtractor={(item, index) => `mah-${index}-${item}`}
                keyboardShouldPersistTaps="handled"
                stickySectionHeadersEnabled
                renderSectionHeader={({ section }: any) => section.showHeader ? (
                  <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>{section.title}</Text></View>
                ) : null}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.modalItem} onPress={() => {
                    setTempMahalle(item);
                    konumEkle(tempIl, tempIlce, item);
                    setKonumModal(false);
                  }}>
                    <Text style={styles.modalItemText}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <FlatList
                data={
                  konumSayfa === 'il'
                    ? ILLER_LISTESI.filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()))
                    : (ILLER[tempIl] ?? []).slice().sort((a, b) => a.localeCompare(b, 'tr')).filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()))
                }
                keyExtractor={(item, index) => `${konumSayfa}-${index}-${item}`}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.modalItem} onPress={() => {
                    if (konumSayfa === 'il') {
                      setTempIl(item); setTempIlce(''); setTempMahalle(''); setKonumSearch('');
                      if (ILLER[item]?.length) setKonumSayfa('ilce');
                      else { konumEkle(item); setKonumModal(false); }
                    } else {
                      setTempIlce(item); setTempMahalle(''); setKonumSearch('');
                      const mah = getMahalleler(tempIl, item);
                      if (mah.length) setKonumSayfa('mahalle');
                      else { konumEkle(tempIl, item); setKonumModal(false); }
                    }
                  }}>
                    <Text style={styles.modalItemText}>{item}</Text>
                  </TouchableOpacity>
                )}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Link Paylaş Modali */}
      <Modal visible={linkModal} animationType="slide" transparent onRequestClose={() => setLinkModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDimmer} onPress={() => setLinkModal(false)} />
          <View style={[styles.modalPanel, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setLinkModal(false)}>
                <Text style={styles.modalKapat}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalBaslik}>🔗 Link Paylaş</Text>
              <View style={{ width: 32 }} />
            </View>
            {!linkUrl ? (
              <>
                <View style={{ flexDirection: 'row', gap: 8, margin: Spacing.md }}>
                  <TextInput
                    style={[styles.modalSearch, { flex: 1, margin: 0 }]}
                    placeholder="İlan ara..."
                    placeholderTextColor={Colors.outlineVariant}
                    value={linkSearch}
                    onChangeText={setLinkSearch}
                  />
                  <TextInput
                    style={[styles.modalSearch, { width: 120, margin: 0 }]}
                    placeholder="Portföy no..."
                    placeholderTextColor={Colors.outlineVariant}
                    value={linkPortfoySearch}
                    onChangeText={setLinkPortfoySearch}
                    keyboardType="numeric"
                  />
                </View>
                <FlatList
                  data={linkTumIlanlar.filter(i => {
                    const aramaOk = !linkSearch || i.baslik?.toLowerCase().includes(linkSearch.toLowerCase()) || i.konum?.toLowerCase().includes(linkSearch.toLowerCase());
                    const portfoyOk = !linkPortfoySearch || (i.portfoy_no ?? '').toLowerCase().includes(linkPortfoySearch.toLowerCase());
                    return aramaOk && portfoyOk;
                  })}
                  keyExtractor={item => item.id}
                  renderItem={({ item }) => {
                    const secili = linkSecimIds.includes(item.id);
                    return (
                      <TouchableOpacity onPress={() => toggleLinkIlan(item.id)} style={[styles.modalItem, secili && { backgroundColor: Colors.primaryFixed }]}>
                        <View style={[styles.secimKutucuk, { borderColor: secili ? Colors.primary : Colors.outline, backgroundColor: secili ? Colors.primary : Colors.surface }]}>
                          {secili && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.modalItemBaslik} numberOfLines={1}>{item.baslik}{item.portfoy_no ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}> #{item.portfoy_no}</Text> : ''}</Text>
                          <Text style={styles.modalItemAlt}>₺{item.fiyat?.toLocaleString('tr-TR')} · {item.kategori}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={linkYukleniyor ? <ActivityIndicator style={{ margin: 24 }} color={Colors.primary} /> : <Text style={styles.modalBosTxt}>Aktif ilan bulunamadı</Text>}
                />
                <View style={{ paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow, backgroundColor: Colors.surface }}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {([1, 24, 72, 168] as const).map(s => (
                      <TouchableOpacity key={s} onPress={() => setLinkSaat(String(s))} style={[styles.saatBtn, linkSaat === String(s) && styles.saatBtnAktif]}>
                        <Text style={[styles.saatBtnText, linkSaat === String(s) && styles.saatBtnTextAktif]}>
                          {s === 1 ? '1 saat' : s === 24 ? '1 gün' : s === 72 ? '3 gün' : '7 gün'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={{ width: 50, borderWidth: 1, borderColor: Colors.outline, borderRadius: Radius.md, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, textAlign: 'center', color: Colors.onSurface }}
                        value={linkSaat}
                        onChangeText={v => setLinkSaat(v.replace(/\D/g, '') || '1')}
                        keyboardType="numeric"
                      />
                      <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant }}>saat</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>{linkSecimIds.length > 0 ? `${linkSecimIds.length} ilan seçildi` : 'İlan seçin'}</Text>
                    <TouchableOpacity onPress={handleLinkOlustur} disabled={linkSecimIds.length === 0 || linkYukleniyor}
                      style={[styles.eslesBulkBtn, { opacity: linkSecimIds.length === 0 ? 0.4 : 1 }]}>
                      {linkYukleniyor ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.eslesBulkBtnText}>Link Oluştur{linkSecimIds.length > 0 ? ` (${linkSecimIds.length})` : ''}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <View style={{ padding: Spacing.xl }}>
                <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '700', marginBottom: 12 }}>✓ Link oluşturuldu</Text>
                <View style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, padding: Spacing.md, marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant }} selectable>{linkUrl}</Text>
                </View>
                <TouchableOpacity onPress={() => Share.share({ message: linkUrl! })} style={[styles.eslesBulkBtn, { marginBottom: 10 }]}>
                  <Text style={styles.eslesBulkBtnText}>Paylaş / Kopyala</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setLinkUrl(null); setLinkSecimIds([]); setLinkSaat('24'); }}
                  style={{ padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.outline, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>Yeni Link Oluştur</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; autoCapitalize?: any;
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
        autoCapitalize={autoCapitalize ?? 'words'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.xl, gap: Spacing.md, paddingBottom: 48 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  geri: { fontSize: 22, color: Colors.onSurface },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600', color: Colors.onSurface },
  headerActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  kaydetBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8 },
  kaydetText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  duzenleBtn: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6 },
  duzenleBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  silBtn: { backgroundColor: '#fee2e2', borderRadius: Radius.full, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  silBtnText: { fontSize: 14 },
  linkBtn: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  linkBtnText: { fontSize: 14 },
  saatBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.outline, backgroundColor: Colors.surface },
  saatBtnAktif: { borderColor: Colors.primary, backgroundColor: Colors.primaryFixed },
  saatBtnText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  saatBtnTextAktif: { color: Colors.primary },

  profilBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl, padding: Spacing.lg,
  },
  avatar: { width: 56, height: 56, borderRadius: Radius.full, backgroundColor: Colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.primary, fontWeight: '700', fontSize: 20 },
  profilAd: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  profilTelefon: { fontSize: 13, color: Colors.primary },
  profilEmail: { fontSize: 13, color: Colors.onSurfaceVariant },
  durumBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  durumBadgeText: { fontSize: 11, fontWeight: '700' },

  infoBox: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xl, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  infoLabel: { fontSize: 13, color: Colors.onSurfaceVariant },
  infoDeger: { fontSize: 13, fontWeight: '600', color: Colors.onSurface },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  eslesBtn: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  eslesBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  eslesGosterBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.sm },
  eslesGosterText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  ilanKartWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ilanKart: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.lg,
    overflow: 'hidden', gap: Spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  elleBadge: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  elleBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: '700' },
  zatenBadge: { backgroundColor: '#fef3c7', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  zatenBadgeText: { fontSize: 10, color: '#d97706', fontWeight: '700' },
  iptalBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  iptalBtnText: { fontSize: 14, color: '#ef4444' },
  ilanFoto: { width: 64, height: 64 },
  ilanFotoPlaceholder: { width: 64, height: 64, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  ilanBaslik: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  ilanKonum: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  ilanFiyat: { fontSize: 14, fontWeight: '700', color: Colors.primary, paddingRight: Spacing.md },

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

  emptyBox: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center' },
  emptyText: { color: Colors.onSurfaceVariant, fontSize: 14 },

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
  modalPanel: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalKapat: { fontSize: 20, color: Colors.onSurface, width: 32 },
  modalBaslik: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  modalSearch: { margin: Spacing.md, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, fontSize: 14, color: Colors.onSurface },
  modalItem: { paddingHorizontal: Spacing.xl, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow, flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalItemText: { fontSize: 15, color: Colors.onSurface },
  sectionHeader: { backgroundColor: Colors.surfaceContainerLow, paddingVertical: 8, paddingHorizontal: Spacing.xl },
  sectionHeaderText: { fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalItemBaslik: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  modalItemAlt: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  modalBosTxt: { textAlign: 'center', color: Colors.onSurfaceVariant, fontSize: 13, padding: Spacing.xl },
  modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow, backgroundColor: Colors.surface },

  secimKutucuk: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  eslesBulkBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 9 },
  eslesBulkBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  etiketInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, width: 80 },
  etiketHash: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginRight: 1 },
  etiketInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: Colors.onSurface },
  etiketBadge: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  etiketBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

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
