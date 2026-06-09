import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking, Modal, FlatList, Image, Keyboard, Share, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { Musteri, Ilan, MusteriNot, MusteriGorev, MusteriIstek } from '../../types';
import R2Image from '../../components/R2Image';
import { TURKIYE, IL_LISTESI, getMahalleGruplar } from '../../constants/turkiye';
import { ayirTelefon, birlestirTelefon, VARSAYILAN_TELEFON_KODU } from '../../constants/telefonKodlari';
import TelefonInput from '../../components/TelefonInput';
import PersistentTabBar from '../../components/PersistentTabBar';
import DateTimePicker from '@react-native-community/datetimepicker';

const ILLER = TURKIYE;
const ILLER_LISTESI = IL_LISTESI;

const durumlar: ('Aktif' | 'Beklemede' | 'İptal')[] = ['Aktif', 'Beklemede', 'İptal'];
const musteriTipleri = ['Bireysel', 'Müteahhit', 'Al-Satçı', 'Diğer'];
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

function paylasimTarihKisa(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function paylasimTarihGoster(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatSure(sn: number): string {
  if (sn < 60) return `${sn} sn`;
  const dk = Math.floor(sn / 60);
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  const kdk = dk % 60;
  return kdk > 0 ? `${sa} sa ${kdk} dk` : `${sa} sa`;
}
function sonAktifText(iso: string): { canli: boolean; text: string } {
  const ms = Date.now() - new Date(iso).getTime();
  const sn = Math.floor(ms / 1000);
  if (sn < 15) return { canli: true, text: 'Şu an bakıyor' };
  const dk = Math.floor(sn / 60);
  if (dk < 60) return { canli: false, text: `${dk} dk önce` };
  const sa = Math.floor(dk / 60);
  if (sa < 24) return { canli: false, text: `${sa} sa önce` };
  const gun = Math.floor(sa / 24);
  return { canli: false, text: `${gun} gün önce` };
}
function cihazAdi(ua: string | null): string {
  if (!ua) return 'Bilinmeyen cihaz';
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  let os = 'Cihaz';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) {
    const m = ua.match(/Android[^;)]*;\s*([^)]+?)(?:\s+Build|\))/);
    os = m ? `Android (${m[1].trim()})` : 'Android';
  }
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let br = '';
  if (/Edg\//i.test(ua)) br = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) br = 'Chrome';
  else if (/Firefox\//i.test(ua)) br = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) br = 'Safari';
  const ikon = /iPhone|iPad/i.test(ua) ? '📱' : isMobile ? '📱' : '💻';
  return `${ikon} ${os}${br ? ' · ' + br : ''}`;
}
function cihazKisa(ua: string | null): string {
  if (!ua) return 'Bilinmeyen';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Web';
}
function kalanSure(iso: string): { dolmus: boolean; text: string } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { dolmus: true, text: 'Süresi doldu' };
  const sn = Math.floor(ms / 1000);
  const saat = Math.floor(sn / 3600);
  if (saat < 1) {
    const dk = Math.max(1, Math.ceil(sn / 60));
    return { dolmus: false, text: `${dk} dakika kaldı` };
  }
  if (saat < 24) return { dolmus: false, text: `${saat} saat kaldı` };
  const gun = Math.floor(saat / 24);
  const kalanSaat = saat % 24;
  return { dolmus: false, text: kalanSaat > 0 ? `${gun} gün ${kalanSaat} saat kaldı` : `${gun} gün kaldı` };
}
function saatLabel(t: number) {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` };
}

export default function MusteriDetayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [musteri, setMusteri] = useState<Musteri | null>(null);
  const [eslesen, setEslesen] = useState<Ilan[]>([]);
  const [elleEslesen, setElleEslesen] = useState<{id: string; ilan: Ilan}[]>([]);
  const [eslesenYuklendi, setEslesenYuklendi] = useState(false);
  const [eslesenYukleniyor, setEslesenYukleniyor] = useState(false);
  const [eslesSort, setEslesSort] = useState<'tarih' | 'fiyat_artan' | 'fiyat_azalan'>('tarih');
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
  type IstekState = { id?: string; satilikKiralik: '' | 'Satılık' | 'Kiralık'; tipler: string[]; tipler_haric: string[]; butceMin: string; butceMax: string; konumlar: string[]; minOda: string; binaYaslari: string[]; binaYaslari_haric: string[]; ozelIstekler: string[]; ozelIstekler_haric: string[] };
  const [istekler, setIstekler] = useState<IstekState[]>([]);
  const [activeIstekIdx, setActiveIstekIdx] = useState<number | null>(null);
  const [filterPage, setFilterPage] = useState<'main' | 'il' | 'ilce' | 'mahalle'>('main');
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
  const [showTakipPicker, setShowTakipPicker] = useState(false);
  const [showInlineTakipPicker, setShowInlineTakipPicker] = useState(false);
  const [notEditId, setNotEditId] = useState<string | null>(null);
  const [gorevler, setGorevler] = useState<MusteriGorev[]>([]);
  const [gorevEkle, setGorevEkle] = useState(false);
  const [gorevBaslik, setGorevBaslik] = useState('');
  const [gorevAciklama, setGorevAciklama] = useState('');
  const [gorevHedefTarih, setGorevHedefTarih] = useState<Date | null>(null);
  const [gorevHedefSaat, setGorevHedefSaat] = useState<Date | null>(null);
  const [gorevEditId, setGorevEditId] = useState<string | null>(null);
  const [showGorevPicker, setShowGorevPicker] = useState(false);
  const [showGorevSaatPicker, setShowGorevSaatPicker] = useState(false);
  const [etiket, setEtiket] = useState('');
  const [durum, setDurum] = useState<'Aktif' | 'Beklemede' | 'İptal'>('Aktif');
  const [musteriTipi, setMusteriTipi] = useState('Bireysel');
  const [ekKisiler, setEkKisiler] = useState<EkKisi[]>([]);
  const [tipModal, setTipModal] = useState<number | null>(null);
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
    if (ilIsaretli(il)) setTercihKonumlar(prev => prev.filter(k => k !== il && !k.startsWith(il + ' / ')));
    else setTercihKonumlar(prev => [...prev, il]);
  }
  function toggleIlce(il: string, ilce: string) {
    const key = `${il} / ${ilce}`;
    if (ilceIsaretli(il, ilce)) setTercihKonumlar(prev => prev.filter(k => k !== key && !k.startsWith(key + ' / ')));
    else setTercihKonumlar(prev => [...prev.filter(k => k !== il), key]);
  }
  function toggleMah(il: string, ilce: string, mah: string) {
    const key = `${il} / ${ilce} / ${mah}`;
    if (mahIsaretli(il, ilce, mah)) setTercihKonumlar(prev => prev.filter(k => k !== key));
    else setTercihKonumlar(prev => [...prev.filter(k => k !== `${il} / ${ilce}`), key]);
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
        ilceler.slice().sort((a,b) => a.localeCompare(b,'tr')).forEach(ilce => {
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
  const [ilanModal, setIlanModal] = useState(false);
  const [tumIlanlar, setTumIlanlar] = useState<Ilan[]>([]);
  const [ilanSearch, setIlanSearch] = useState('');
  const [pendingIlanlar, setPendingIlanlar] = useState<Ilan[]>([]);
  const [eslesiyorBulk, setEslesiyorBulk] = useState(false);
  const [musteriFiltre, setMusteriFiltre] = useState(false);

  // Link paylaş
  const [linkModal, setLinkModal] = useState(false);
  const [linkTumIlanlar, setLinkTumIlanlar] = useState<Ilan[]>([]);
  const [linkSecimIds, setLinkSecimIds] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkYukleniyor, setLinkYukleniyor] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkPortfoySearch, setLinkPortfoySearch] = useState('');
  const [linkSaat, setLinkSaat] = useState('24');
  const [gorevOneriModal, setGorevOneriModal] = useState<{baslik: string; tarih: string | null; rowId: string | null} | null>(null);
  const [gorevOneriSaat, setGorevOneriSaat] = useState<Date>(() => { const d = new Date(); d.setHours(7,0,0,0); return d; });
  const [showGorevOneriSaatPicker, setShowGorevOneriSaatPicker] = useState(false);

  // Paylaşımlar
  type PaylasimGecmisiRow = { paylasildigi_tarih: string; paket_token: string | null; ilanlar: { id: string; baslik: string; fiyat: number; fotograflar: string[] | null; portfoy_no: string | null; durum: string | null } | null };
  type Ziyaret = { paket_token: string | null; ilan_id: string | null; device_id: string; ilk_giris_at: string; son_aktif_at: string; toplam_sure_sn: number; acilis_sayisi: number; user_agent: string | null };
  type Oturum = { paket_token: string | null; ilan_id: string | null; device_id: string; baslama_at: string; son_aktif_at: string; user_agent: string | null };
  const [paylasimAcik, setPaylasimAcik] = useState(false);
  const [paylasimYukleniyor, setPaylasimYukleniyor] = useState(false);
  const [aktifToken, setAktifToken] = useState<{ token: string; expires_at: string } | null>(null);
  const [paylasimGecmisi, setPaylasimGecmisi] = useState<PaylasimGecmisiRow[]>([]);
  const [ekIlanlar, setEkIlanlar] = useState<{ id: string; baslik: string; fiyat: number; fotograflar: string[] | null; portfoy_no: string | null }[]>([]);
  const [ziyaretler, setZiyaretler] = useState<Ziyaret[]>([]);
  const [oturumlari, setOturumlari] = useState<Oturum[]>([]);
  const [timelinePeriod, setTimelinePeriod] = useState<1 | 6 | 24 | 168>(24);
  const [, setTickNow] = useState(0);
  const [tokenUzatModal, setTokenUzatModal] = useState(false);
  const [tokenYeniTarih, setTokenYeniTarih] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; });
  const [tokenUzatPicker, setTokenUzatPicker] = useState<'date' | 'time' | null>(null);

  const fetchMusteri = useCallback(async () => {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_musteri_detay', { mid: id });
    if (rpcErr) { console.error('RPC error:', rpcErr); Alert.alert('Hata', rpcErr.message); setLoading(false); return; }
    const data = rpcData?.musteri ?? null;
    const dKod = rpcData?.default_telefon_kodu || VARSAYILAN_TELEFON_KODU;
    const kData = rpcData?.iletisim ?? [];
    const nData = rpcData?.notlar ?? [];
    const jData = (rpcData?.ozellikler ?? []).map((o: any) => ({ ozellik_id: o.ozellik_id, ozellikler: { ad: o.ad } }));

    if (data) {
      setMusteri(data);
      setAd(data.ad ?? '');
      setSoyad(data.soyad ?? '');
      setTelefonRaw(data.telefon ?? '');

      setVarsayilanKod(dKod);
      const sp = ayirTelefon(data.telefon, dKod);
      setTelKod(sp.kod); setTelNumara(sp.numara.replace(/\D/g, ''));
      setMinOda(data.min_oda ?? '');
      setIstekler((rpcData?.istekler ?? []).map((i: any) => ({
        id: i.id,
        satilikKiralik: (i.satilik_kiralik === 'Satılık' || i.satilik_kiralik === 'Kiralık') ? i.satilik_kiralik : '',
        tipler: i.tip ? i.tip.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        tipler_haric: i.tip_haric ? i.tip_haric.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        butceMin: i.butce_min ? formatButce(String(i.butce_min)) : '',
        butceMax: i.butce_max ? formatButce(String(i.butce_max)) : '',
        konumlar: i.tercih_konum ? i.tercih_konum.split(/\s*\|\s*/).filter(Boolean) : [],
        minOda: i.min_oda ?? '',
        binaYaslari: i.bina_yasi ? i.bina_yasi.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        binaYaslari_haric: i.bina_yasi_haric ? i.bina_yasi_haric.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        ozelIstekler: i.ozellikler ? i.ozellikler.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        ozelIstekler_haric: i.ozellikler_haric ? i.ozellikler_haric.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      })));
      setTakipTarihi(data.takip_tarihi ? tarihFormat(data.takip_tarihi) : '');
      setBinaYaslari(data.bina_yasi ? data.bina_yasi.split(',') : []);
      setEtiket(data.etiketler ?? '');
      setDurum(data.durum ?? 'Aktif');
      setMusteriTipi(data.musteri_tipi ?? 'Bireysel');

      setEkKisiler((kData ?? []).map((k: any) => {
        const sp2 = ayirTelefon(k.telefon, dKod);
        return { id: k.id, ad: k.ad ?? '', kod: sp2.kod, numara: sp2.numara.replace(/\D/g, ''), tip: k.tip ?? 'Eş' };
      }));

      setNotlar(((nData ?? []) as MusteriNot[]).slice().sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime()));

      const { data: gData } = await supabase.from('musteri_gorevler')
        .select('*').eq('musteri_id', id).order('tamamlandi').order('hedef_tarih', { ascending: true, nullsFirst: false });
      setGorevler((gData ?? []) as MusteriGorev[]);

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
    const { data } = await supabase.from('ozellikler').select('*').order('ad');
    if (data) setTumOzellikler(data);
  }, [tumOzellikler.length]);

  const ODALAR_ORDER = ['Stüdyo', '1+0', '1+1', '2+1', '3+1', '3+2', '4+1', '5+'];
  function istekEslesiyor(istek: any, ilan: any): boolean {
    if (!istek.tip && !istek.satilik_kiralik && istek.butce_min == null && istek.butce_max == null && !istek.tercih_konum && !istek.min_oda && !istek.bina_yasi) return false;
    if (istek.satilik_kiralik && ilan.tip !== istek.satilik_kiralik) return false;
    const f = Number(ilan.fiyat);
    if (istek.butce_min != null && f < Number(istek.butce_min)) return false;
    if (istek.butce_max != null && f > Number(istek.butce_max)) return false;
    if (istek.tip) {
      const tipler = istek.tip.split(',').map((t: string) => t.trim()).filter(Boolean);
      if (tipler.length && !tipler.some((t: string) => (ilan.kategori ?? '').toLowerCase().includes(t.toLowerCase()))) return false;
    }
    if (istek.tercih_konum) {
      const konumListesi = istek.tercih_konum.split(/\s*\|\s*/).filter(Boolean);
      const match = konumListesi.some((konum: string) => {
        const [kil, kilce, kmah] = konum.split(' / ').map((p: string) => p.trim());
        if (kmah) {
          if (kil && ilan.konum?.toLowerCase() !== kil.toLowerCase()) return false;
          if (kilce && ilan.ilce?.toLowerCase() !== kilce.toLowerCase()) return false;
          return ilan.mahalle?.toLowerCase().includes(kmah.toLowerCase()) ?? false;
        }
        if (kilce) {
          if (kil && ilan.konum?.toLowerCase() !== kil.toLowerCase()) return false;
          return ilan.ilce?.toLowerCase() === kilce.toLowerCase();
        }
        if (kil) return ilan.konum?.toLowerCase() === kil.toLowerCase();
        return false;
      });
      if (!match) return false;
    }
    if (istek.min_oda && ilan.oda_sayisi) {
      const minIdx = ODALAR_ORDER.indexOf(istek.min_oda);
      const ilanIdx = ODALAR_ORDER.indexOf(ilan.oda_sayisi);
      if (minIdx >= 0 && ilanIdx >= 0 && ilanIdx < minIdx) return false;
    }
    if (istek.bina_yasi) {
      const list = istek.bina_yasi.split(',').map((s: string) => s.trim());
      if (list.length && (!ilan.bina_yasi || !list.includes(ilan.bina_yasi))) return false;
    }
    if (istek.kat_sayisi) {
      const list = istek.kat_sayisi.split(',').map((s: string) => s.trim());
      if (list.length && (!ilan.kat_sayisi || !list.includes(ilan.kat_sayisi))) return false;
    }
    if (istek.bulundugu_kat) {
      const list = istek.bulundugu_kat.split(',').map((s: string) => s.trim());
      if (list.length && (!ilan.bulundugu_kat || !list.includes(ilan.bulundugu_kat))) return false;
    }
    return true;
  }

  const fetchEslesenIlanlar = useCallback(async () => {
    setEslesenYukleniyor(true);
    const [{ data: eslesme }, { data: mIstekler }, { data: ilanlar }] = await Promise.all([
      supabase.from('eslesmeler').select('id, ilan_id, ilanlar(*)').eq('musteri_id', id),
      supabase.from('musteri_istekler').select('*').eq('musteri_id', id),
      supabase.from('ilanlar').select('*').eq('durum', 'Aktif').limit(200),
    ]);

    setElleEslesen((eslesme ?? []).map((e: any) => ({ id: e.id, ilan: e.ilanlar })));

    if (!mIstekler?.length) {
      setEslesen([]);
    } else {
      const filtered = (ilanlar ?? []).filter((ilan: any) =>
        (mIstekler ?? []).some((istek: any) => istekEslesiyor(istek, ilan))
      );
      setEslesen(filtered.slice(0, 20));
    }
    setEslesenYuklendi(true);
    setEslesenYukleniyor(false);
  }, [id]);

  useFocusEffect(useCallback(() => { fetchMusteri(); }, [fetchMusteri]));

  const fetchPaylasim = useCallback(async (silent = false) => {
    if (!silent) setPaylasimYukleniyor(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { if (!silent) setPaylasimYukleniyor(false); return; }
    const [tokenRes, gecmisRes, ziyaretRes, oturumRes] = await Promise.all([
      supabase.from('musteri_tokenler').select('token, expires_at').eq('user_id', session.user.id).eq('musteri_id', id).maybeSingle(),
      supabase.from('musteri_paylasim_gecmisi')
        .select('paylasildigi_tarih, paket_token, ilanlar(id, baslik, fiyat, fotograflar, portfoy_no, durum)')
        .eq('user_id', session.user.id).eq('musteri_id', id)
        .order('paylasildigi_tarih', { ascending: false }),
      supabase.rpc('get_musteri_ziyaretleri', { p_musteri_id: id }),
      supabase.rpc('get_musteri_oturumlari', { p_musteri_id: id }),
    ]);
    setAktifToken(tokenRes.data ? { token: tokenRes.data.token, expires_at: tokenRes.data.expires_at } : null);
    setPaylasimGecmisi((gecmisRes.data ?? []) as any);
    setZiyaretler((ziyaretRes.data ?? []) as any);
    const oturumData = (oturumRes.data ?? []) as { ilan_id: string | null }[];
    setOturumlari(oturumData as any);
    const gecmisIds = new Set(((gecmisRes.data ?? []) as any[]).map(p => p.ilanlar?.id).filter(Boolean));
    const eksikIds = Array.from(new Set(oturumData.map(o => o.ilan_id).filter((x): x is string => !!x && !gecmisIds.has(x))));
    if (eksikIds.length) {
      const { data: ek } = await supabase.from('ilanlar').select('id, baslik, fiyat, fotograflar, portfoy_no').in('id', eksikIds);
      setEkIlanlar((ek ?? []) as any);
    } else {
      setEkIlanlar([]);
    }
    if (!silent) setPaylasimYukleniyor(false);
  }, [id]);

  useEffect(() => {
    if (paylasimAcik) fetchPaylasim();
  }, [paylasimAcik, fetchPaylasim]);

  useEffect(() => {
    if (!paylasimAcik) return;
    const tick = setInterval(() => setTickNow(t => t + 1), 5000);
    const refresh = setInterval(() => { fetchPaylasim(true); }, 10000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [paylasimAcik, fetchPaylasim]);

  async function tokenUzatKaydet() {
    if (!aktifToken) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const yeniIso = tokenYeniTarih.toISOString();
    const { error } = await supabase.from('musteri_tokenler')
      .update({ expires_at: yeniIso })
      .eq('user_id', session.user.id).eq('musteri_id', id);
    if (error) { Alert.alert('Hata', error.message); return; }
    await supabase.from('paylasim_paketleri')
      .update({ expires_at: yeniIso })
      .eq('emlakci_id', session.user.id).eq('musteri_token', aktifToken.token);
    setAktifToken({ ...aktifToken, expires_at: yeniIso });
    setTokenUzatModal(false);
  }

  function tokenDoldur() {
    if (!aktifToken) return;
    Alert.alert('Süreyi Doldur', 'Link süresi hemen doldurulsun mu? Müşteri artık açamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Doldur', style: 'destructive', onPress: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const nowIso = new Date().toISOString();
        const { error } = await supabase.from('musteri_tokenler')
          .update({ expires_at: nowIso })
          .eq('user_id', session.user.id).eq('musteri_id', id);
        if (error) { Alert.alert('Hata', error.message); return; }
        await supabase.from('paylasim_paketleri')
          .update({ expires_at: nowIso })
          .eq('emlakci_id', session.user.id).eq('musteri_token', aktifToken.token);
        setAktifToken({ ...aktifToken, expires_at: nowIso });
      }},
    ]);
  }

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
      takip_tarihi: takipTarihi ? isoFormat(takipTarihi) : null,
      etiketler: etiket.trim() || null,
      durum,
      musteri_tipi: musteriTipi,
    }).eq('id', id);

    if (error) { Alert.alert('Hata', error.message); setSaving(false); return; }

    await supabase.from('musteri_istekler').delete().eq('musteri_id', id);
    const validIstekler = istekler.filter(i => i.tipler.length || i.butceMin || i.butceMax || i.konumlar.length || i.satilikKiralik);
    if (validIstekler.length) {
      const iRows = validIstekler.map(i => ({
        musteri_id: id,
        ...(i.id ? { id: i.id } : {}),
        satilik_kiralik: i.satilikKiralik || null,
        tip: i.tipler.length ? i.tipler.join(',') : null,
        tip_haric: i.tipler_haric.length ? i.tipler_haric.join(',') : null,
        butce_min: i.butceMin ? parseInt(i.butceMin.replace(/\./g, '')) : null,
        butce_max: i.butceMax ? parseInt(i.butceMax.replace(/\./g, '')) : null,
        tercih_konum: i.konumlar.length ? i.konumlar.join(' | ') : null,
        min_oda: i.minOda || null,
        bina_yasi: i.binaYaslari.length ? i.binaYaslari.join(',') : null,
        bina_yasi_haric: i.binaYaslari_haric.length ? i.binaYaslari_haric.join(',') : null,
      }));
      const { data: insertedIstekler, error: iErr } = await supabase.from('musteri_istekler').insert(iRows).select('id');
      if (iErr) { Alert.alert('İstek kaydı hatası', iErr.message); setSaving(false); return; }
      if (insertedIstekler) {
        const ozRows = insertedIstekler.flatMap((ins, idx) => [
          ...(validIstekler[idx].ozelIstekler ?? []).map(oid => ({ musteri_istek_id: ins.id, ozellik_id: oid, haric: false })),
          ...(validIstekler[idx].ozelIstekler_haric ?? []).map(oid => ({ musteri_istek_id: ins.id, ozellik_id: oid, haric: true })),
        ]);
        if (ozRows.length) await supabase.from('musteri_istek_ozellikler').insert(ozRows);
      }
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
    setMusteriFiltre(istekler.length > 0);
    setIlanModal(true);
  }

  function ilanMusteriUyuyor(ilan: Ilan): boolean {
    if (!istekler.length) return true;
    return istekler.some(istek => {
      const f = Number(ilan.fiyat);
      const bMin = istek.butceMin ? parseInt(istek.butceMin.replace(/\./g, '')) : null;
      const bMax = istek.butceMax ? parseInt(istek.butceMax.replace(/\./g, '')) : null;
      if (bMin != null && f < bMin) return false;
      if (bMax != null && f > bMax) return false;
      if (istek.satilikKiralik && ilan.tip !== istek.satilikKiralik) return false;
      if (istek.tipler.length && !istek.tipler.some(t => (ilan.kategori ?? '').toLowerCase().includes(t.toLowerCase()))) return false;
      return true;
    });
  }

  function musteriOzetStr(): string {
    if (!istekler.length) return '';
    const parts: string[] = [];
    const birlesik = { tipler: new Set<string>(), butceMinler: [] as number[], butceMaxler: [] as number[] };
    for (const i of istekler) {
      i.tipler.forEach(t => birlesik.tipler.add(t));
      if (i.butceMin) birlesik.butceMinler.push(parseInt(i.butceMin.replace(/\./g, '')));
      if (i.butceMax) birlesik.butceMaxler.push(parseInt(i.butceMax.replace(/\./g, '')));
    }
    if (birlesik.tipler.size) parts.push([...birlesik.tipler].join('/'));
    if (birlesik.butceMinler.length || birlesik.butceMaxler.length) {
      const mn = birlesik.butceMinler.length ? `min ₺${Math.min(...birlesik.butceMinler).toLocaleString('tr-TR')}` : '';
      const mx = birlesik.butceMaxler.length ? `max ₺${Math.max(...birlesik.butceMaxler).toLocaleString('tr-TR')}` : '';
      parts.push([mn, mx].filter(Boolean).join(' – '));
    }
    return parts.join(' · ');
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
    const expiresAt = new Date(Date.now() + (parseInt(linkSaat) || 1) * 60 * 60 * 1000).toISOString();
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
    await supabase.from('musteri_paylasim_gecmisi').insert(
      linkSecimIds.map(ilanId => ({ user_id: session.user.id, musteri_id: id, ilan_id: ilanId }))
    );
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
    const icerik = notIcerik.trim();
    if (notEditId) {
      const { error } = await supabase.from('musteri_notlar').update({ icerik, tarih: tarihIso }).eq('id', notEditId);
      if (error) { Alert.alert('Hata', error.message); return; }
    } else {
      const { error } = await supabase.from('musteri_notlar').insert({ musteri_id: id, icerik, tarih: tarihIso });
      if (error) { Alert.alert('Hata', error.message); return; }
      // Yeni not → taahhüt analizi (geçici kapatıldı)
      // const { data: { session } } = await supabase.auth.getSession();
      // if (session) {
      //   fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/not-analiz`, {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      //     body: JSON.stringify({ musteri_id: id, not_icerik: icerik }),
      //   }).then(async (res) => {
      //     if (!res.ok) return;
      //     const d = await res.json();
      //     if (d.gorev && d.baslik) {
      //       const defaultSaat = new Date(); defaultSaat.setHours(7, 0, 0, 0);
      //       setGorevOneriSaat(defaultSaat);
      //       setGorevOneriModal({ baslik: d.baslik, tarih: d.tarih ?? null, rowId: d.rowId ?? null });
      //     }
      //   }).catch(() => {});
      // }
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

  async function refreshGorevler() {
    const { data } = await supabase.from('musteri_gorevler')
      .select('*').eq('musteri_id', id).order('tamamlandi').order('hedef_tarih', { ascending: true, nullsFirst: false });
    setGorevler((data ?? []) as MusteriGorev[]);
  }

  function gorevEkleAc() {
    setGorevEditId(null);
    setGorevBaslik('');
    setGorevAciklama('');
    setGorevHedefTarih(null);
    setGorevEkle(true);
  }

  function gorevDuzenleAc(g: MusteriGorev) {
    setGorevEditId(g.id);
    setGorevBaslik(g.baslik);
    setGorevAciklama(g.aciklama ?? '');
    const existing = g.hedef_tarih ? new Date(g.hedef_tarih) : null;
    setGorevHedefTarih(existing);
    if (existing && (existing.getUTCHours() !== 0 || existing.getUTCMinutes() !== 0)) {
      setGorevHedefSaat(existing);
    } else {
      setGorevHedefSaat(null);
    }
    setGorevEkle(true);
  }

  async function handleGorevKaydet() {
    if (!gorevBaslik.trim()) return;
    let hedefDate: Date | null = gorevHedefTarih ? new Date(gorevHedefTarih) : null;
    if (hedefDate && gorevHedefSaat) {
      hedefDate.setHours(gorevHedefSaat.getHours(), gorevHedefSaat.getMinutes(), 0, 0);
    }
    const payload = {
      musteri_id: id,
      baslik: gorevBaslik.trim(),
      aciklama: gorevAciklama.trim() || null,
      hedef_tarih: hedefDate ? hedefDate.toISOString() : null,
    };
    if (gorevEditId) {
      const { error } = await supabase.from('musteri_gorevler').update(payload).eq('id', gorevEditId);
      if (error) { Alert.alert('Hata', error.message); return; }
    } else {
      const { error } = await supabase.from('musteri_gorevler').insert(payload);
      if (error) { Alert.alert('Hata', error.message); return; }
    }
    setGorevEkle(false);
    setGorevEditId(null);
    setGorevBaslik('');
    setGorevAciklama('');
    setGorevHedefTarih(null);
    setGorevHedefSaat(null);
    refreshGorevler();
  }

  async function handleGorevTamamla(g: MusteriGorev) {
    await supabase.from('musteri_gorevler').update({ tamamlandi: !g.tamamlandi }).eq('id', g.id);
    setGorevler(prev => prev.map(x => x.id === g.id ? { ...x, tamamlandi: !x.tamamlandi } : x));
  }

  async function handleGorevSil(gorevId: string) {
    Alert.alert('Görevi Sil', 'Bu görev silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await supabase.from('musteri_gorevler').delete().eq('id', gorevId);
        setGorevler(prev => prev.filter(g => g.id !== gorevId));
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
                backgroundColor: durum === 'Aktif' ? 'rgba(34,197,94,0.18)' : durum === 'Beklemede' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)'
              }]}>
                <Text style={[styles.durumBadgeText, {
                  color: durum === 'Aktif' ? '#166534' : durum === 'Beklemede' ? '#854d0e' : '#fca5a5'
                }]}>{durum}</Text>
              </View>
              {etiket ? <View style={styles.etiketBadge}><Text style={styles.etiketBadgeText}>#{etiket}</Text></View> : null}
              {musteriTipi && musteriTipi !== 'Bireysel' ? <View style={{ backgroundColor: Colors.surfaceContainerHigh, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ fontSize: 11, fontWeight: '700', color: Colors.onSurface }}>{musteriTipi}</Text></View> : null}
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
                      keyboardType="number-pad"
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
                  <TouchableOpacity onPress={() => setIstekler(p => [...p, { satilikKiralik: '', tipler: [], tipler_haric: [], butceMin: '', butceMax: '', konumlar: [], minOda: '', binaYaslari: [], binaYaslari_haric: [], ozelIstekler: [], ozelIstekler_haric: [] }])}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.primaryFixed }}>
                    <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700' }}>+ İstek Ekle</Text>
                  </TouchableOpacity>
                </View>
                {istekler.map((istek, idx) => (
                  <View key={istek.id ?? idx} style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: 12, gap: 10, marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant }}>İstek {idx + 1}</Text>
                      {istekler.length > 1 && (
                        <TouchableOpacity onPress={() => setIstekler(p => p.filter((_, i) => i !== idx))}>
                          <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '700' }}>× Kaldır</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.chipRow}>
                      {(['Satılık', 'Kiralık'] as const).map(s => {
                        const sec = istek.satilikKiralik === s;
                        return (
                          <TouchableOpacity key={s} style={[styles.chip, sec && styles.chipActive]}
                            onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, satilikKiralik: x.satilikKiralik === s ? '' : s } : x))}>
                            <Text style={[styles.chipText, sec && styles.chipTextActive]}>{s}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={styles.chipRow}>
                      {EMLAK_TIPLERI.map(t => {
                        const secili = istek.tipler.includes(t);
                        const haric = istek.tipler_haric.includes(t);
                        return (
                          <TouchableOpacity key={t}
                            style={[styles.chip, secili && styles.chipActive, haric && styles.chipHaric]}
                            onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, tipler: secili ? x.tipler.filter(tt => tt !== t) : [...x.tipler, t], tipler_haric: x.tipler_haric.filter(tt => tt !== t) } : x))}
                            onLongPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, tipler: x.tipler.filter(tt => tt !== t), tipler_haric: haric ? x.tipler_haric.filter(tt => tt !== t) : [...x.tipler_haric, t] } : x))}
                            delayLongPress={500}>
                            <Text style={[styles.chipText, secili && styles.chipTextActive, haric && styles.chipHaricText]}>{t}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput style={[styles.input, { flex: 1, backgroundColor: Colors.surfaceContainerLow }]} placeholder="Min ₺" placeholderTextColor={Colors.outlineVariant} keyboardType="numeric"
                        value={istek.butceMin} onChangeText={v => setIstekler(p => p.map((x, i) => i === idx ? { ...x, butceMin: formatButce(v) } : x))} />
                      <TextInput style={[styles.input, { flex: 1, backgroundColor: Colors.surfaceContainerLow }]} placeholder="Max ₺" placeholderTextColor={Colors.outlineVariant} keyboardType="numeric"
                        value={istek.butceMax} onChangeText={v => setIstekler(p => p.map((x, i) => i === idx ? { ...x, butceMax: formatButce(v) } : x))} />
                    </View>
                    <TouchableOpacity style={[styles.konumBox, istek.konumlar.length > 0 && styles.konumBoxAktif]}
                      onPress={() => { setActiveIstekIdx(idx); setKonumSearch(''); setFilterPage('il'); }}>
                      <Text style={[styles.konumBoxText, istek.konumlar.length > 0 && styles.konumBoxTextAktif]} numberOfLines={1}>
                        {istek.konumlar.length > 0 ? `${istek.konumlar.length} konum seçildi` : 'Konum Seç'}
                      </Text>
                      <Text style={styles.konumBoxChevron}>▾</Text>
                    </TouchableOpacity>
                    {/* Min Oda */}
                    <View style={styles.inputContainer}>
                      <Text style={styles.label}>Min Oda</Text>
                      <View style={styles.chipRow}>
                        {ODALAR.map(o => {
                          const secili = istek.minOda === o;
                          return (
                            <TouchableOpacity key={o} style={[styles.chip, secili && styles.chipActive]}
                              onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, minOda: x.minOda === o ? '' : o } : x))}>
                              <Text style={[styles.chipText, secili && styles.chipTextActive]}>{o}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                    {/* Bina Yaşı */}
                    <View style={styles.inputContainer}>
                      <Text style={styles.label}>Bina Yaşı</Text>
                      <View style={styles.chipRow}>
                        {BINA_YASLARI.map(y => {
                          const secili = istek.binaYaslari.includes(y);
                          const haric = istek.binaYaslari_haric.includes(y);
                          return (
                            <TouchableOpacity key={y}
                              style={[styles.chip, secili && styles.chipActive, haric && styles.chipHaric]}
                              onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, binaYaslari: secili ? x.binaYaslari.filter(b => b !== y) : [...x.binaYaslari, y], binaYaslari_haric: x.binaYaslari_haric.filter(b => b !== y) } : x))}
                              onLongPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, binaYaslari: x.binaYaslari.filter(b => b !== y), binaYaslari_haric: haric ? x.binaYaslari_haric.filter(b => b !== y) : [...x.binaYaslari_haric, y] } : x))}
                              delayLongPress={500}>
                              <Text style={[styles.chipText, secili && styles.chipTextActive, haric && styles.chipHaricText]}>{y}</Text>
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
                            const secili = istek.ozelIstekler.includes(oz.id);
                            const haric = istek.ozelIstekler_haric.includes(oz.id);
                            return (
                              <TouchableOpacity key={oz.id}
                                style={[styles.chip, secili && styles.chipActive, haric && styles.chipHaric]}
                                onPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, ozelIstekler: secili ? x.ozelIstekler.filter(id => id !== oz.id) : [...x.ozelIstekler, oz.id], ozelIstekler_haric: x.ozelIstekler_haric.filter(id => id !== oz.id) } : x))}
                                onLongPress={() => setIstekler(p => p.map((x, i) => i === idx ? { ...x, ozelIstekler: x.ozelIstekler.filter(id => id !== oz.id), ozelIstekler_haric: haric ? x.ozelIstekler_haric.filter(id => id !== oz.id) : [...x.ozelIstekler_haric, oz.id] } : x))}
                                delayLongPress={500}>
                                <Text style={[styles.chipText, secili && styles.chipTextActive, haric && styles.chipHaricText]}>{oz.ad}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                ))}
                {istekler.length === 0 && (
                  <TouchableOpacity onPress={() => setIstekler([{ satilikKiralik: '', tipler: [], tipler_haric: [], butceMin: '', butceMax: '', konumlar: [], minOda: '', binaYaslari: [], binaYaslari_haric: [], ozelIstekler: [], ozelIstekler_haric: [] }])}
                    style={{ padding: 12, borderRadius: Radius.lg, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>+ İlk isteği ekle</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.inputContainer}>
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
                          <Text style={{ fontSize: 18, color: '#fcd34d', fontWeight: '700' }}>⋯</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.notIcerik}>{n.icerik}</Text>
                    </View>
                  ))
                )}
              </View>

              {/* Görevler (edit modunda da göster) */}
              <GorevlerBox
                gorevler={gorevler}
                gorevEkle={gorevEkle}
                gorevBaslik={gorevBaslik}
                gorevAciklama={gorevAciklama}
                gorevHedefTarih={gorevHedefTarih}
                gorevHedefSaat={gorevHedefSaat}
                gorevEditId={gorevEditId}
                showGorevPicker={showGorevPicker}
                showGorevSaatPicker={showGorevSaatPicker}
                setGorevBaslik={setGorevBaslik}
                setGorevAciklama={setGorevAciklama}
                setGorevHedefTarih={setGorevHedefTarih}
                setGorevHedefSaat={setGorevHedefSaat}
                setShowGorevPicker={setShowGorevPicker}
                setShowGorevSaatPicker={setShowGorevSaatPicker}
                onEkleAc={gorevEkleAc}
                onKaydet={handleGorevKaydet}
                onIptal={() => { setGorevEkle(false); setGorevEditId(null); setGorevBaslik(''); setGorevAciklama(''); setGorevHedefTarih(null); setGorevHedefSaat(null); }}
                onTamamla={handleGorevTamamla}
                onDuzenle={gorevDuzenleAc}
                onSil={handleGorevSil}
              />

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

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Müşteri Tipi</Text>
                <View style={styles.durumRow}>
                  {musteriTipleri.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.durumBtn, musteriTipi === t && styles.durumBtnAktif]}
                      onPress={() => setMusteriTipi(t)}
                    >
                      <Text style={[styles.durumBtnText, musteriTipi === t && styles.durumBtnTextAktif]}>{t}</Text>
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

                {/* İstekler */}
                {istekler.length > 0 && (
                  <View style={[styles.infoBox, { gap: 10 }]}>
                    <Text style={[styles.sectionTitle, { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }]}>İstekler</Text>
                    {istekler.map((istek, idx) => (
                      <View key={istek.id ?? idx} style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: 12, gap: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant }}>İstek {idx + 1}</Text>
                        {(istek.butceMin || istek.butceMax) ? (
                          <Text style={{ fontSize: 13, color: Colors.onSurface }}>💰 ₺{istek.butceMin || '?'} – ₺{istek.butceMax || '?'}</Text>
                        ) : null}
                        {istek.tipler.length > 0 ? (
                          <Text style={{ fontSize: 13, color: Colors.onSurface }}>🏠 {istek.tipler.join(', ')}</Text>
                        ) : null}
                        {istek.konumlar.map((k, i) => (
                          <Text key={i} style={{ fontSize: 13, color: Colors.onSurface }}>📍 {k}</Text>
                        ))}
                        {istek.minOda ? <Text style={{ fontSize: 13, color: Colors.onSurface }}>🛏 Min {istek.minOda}</Text> : null}
                        {istek.binaYaslari.length > 0 ? <Text style={{ fontSize: 13, color: Colors.onSurface }}>🏗 Bina: {istek.binaYaslari.join(', ')}</Text> : null}
                      </View>
                    ))}
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
                        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setShowInlineTakipPicker(true)}>
                          <Text style={[styles.infoDeger, { color: Colors.primary }]}>📅 {takipTarihi}</Text>
                          <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>✏️</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                )}
                {istekler.length === 0 && (minOda || binaYaslari.length > 0 || ozellikAdlari.length > 0 || takipTarihi) && (
                  <View style={styles.infoBox}>
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
                        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => setShowInlineTakipPicker(true)}>
                          <Text style={[styles.infoDeger, { color: Colors.primary }]}>📅 {takipTarihi}</Text>
                          <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>✏️</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                )}
                {showInlineTakipPicker && (
                  <DateTimePicker
                    value={takipTarihi ? (() => { const [d,m,y] = takipTarihi.split('.'); return new Date(+y, +m-1, +d); })() : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                    locale="tr-TR"
                    onChange={(_, sel) => {
                      setShowInlineTakipPicker(false);
                      if (sel) {
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const yeni = `${pad(sel.getDate())}.${pad(sel.getMonth()+1)}.${sel.getFullYear()}`;
                        setTakipTarihi(yeni);
                        supabase.from('musteriler').update({ takip_tarihi: isoFormat(yeni) }).eq('id', id).then(() => {});
                      }
                    }}
                  />
                )}

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
                              <Text style={{ fontSize: 18, color: '#fcd34d', fontWeight: '700' }}>⋯</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.notIcerik}>{n.icerik}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Görevler */}
                  <GorevlerBox
                    gorevler={gorevler}
                    gorevEkle={gorevEkle}
                    gorevBaslik={gorevBaslik}
                    gorevAciklama={gorevAciklama}
                    gorevHedefTarih={gorevHedefTarih}
                    gorevEditId={gorevEditId}
                    showGorevPicker={showGorevPicker}
                    setGorevBaslik={setGorevBaslik}
                    setGorevAciklama={setGorevAciklama}
                    setGorevHedefTarih={setGorevHedefTarih}
                    setShowGorevPicker={setShowGorevPicker}
                    onEkleAc={gorevEkleAc}
                    onKaydet={handleGorevKaydet}
                    onIptal={() => { setGorevEkle(false); setGorevEditId(null); setGorevBaslik(''); setGorevAciklama(''); setGorevHedefTarih(null); }}
                    onTamamla={handleGorevTamamla}
                    onDuzenle={gorevDuzenleAc}
                    onSil={handleGorevSil}
                  />

                  {/* Paylaşımlar (lazy, collapsible) */}
                  <PaylasimBox
                    acik={paylasimAcik}
                    setAcik={setPaylasimAcik}
                    yukleniyor={paylasimYukleniyor}
                    aktifToken={aktifToken}
                    paylasimGecmisi={paylasimGecmisi}
                    ekIlanlar={ekIlanlar}
                    ziyaretler={ziyaretler}
                    oturumlari={oturumlari}
                    timelinePeriod={timelinePeriod}
                    setTimelinePeriod={setTimelinePeriod}
                    onUzatAc={() => {
                      if (!aktifToken) return;
                      const def = new Date(aktifToken.expires_at);
                      if (def.getTime() < Date.now()) { const d = new Date(); d.setDate(d.getDate() + 1); setTokenYeniTarih(d); }
                      else setTokenYeniTarih(def);
                      setTokenUzatModal(true);
                    }}
                    onDoldur={tokenDoldur}
                    onLinkOlustur={handleLinkModalAc}
                  />

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
                  {/* Sıralama */}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: Spacing.sm, marginBottom: 4 }}>
                    {(['tarih', 'fiyat_artan', 'fiyat_azalan'] as const).map(s => (
                      <TouchableOpacity key={s} onPress={() => setEslesSort(s)} style={{
                        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: eslesSort === s ? '#E53935' : Colors.outlineVariant,
                        backgroundColor: eslesSort === s ? 'rgba(229,57,53,0.18)' : Colors.surfaceContainerLow,
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: eslesSort === s ? '#E53935' : Colors.onSurfaceVariant }}>
                          {s === 'tarih' ? 'Tarih' : s === 'fiyat_artan' ? 'Fiyat ↑' : 'Fiyat ↓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

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
                (eslesSort === 'fiyat_artan'
                  ? [...elleEslesen].sort((a, b) => Number(a.ilan?.fiyat ?? 0) - Number(b.ilan?.fiyat ?? 0))
                  : eslesSort === 'fiyat_azalan'
                  ? [...elleEslesen].sort((a, b) => Number(b.ilan?.fiyat ?? 0) - Number(a.ilan?.fiyat ?? 0))
                  : elleEslesen
                ).map(({ id: eslesmeId, ilan }) => ilan ? (
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
                (eslesSort === 'fiyat_artan'
                  ? [...eslesen].sort((a, b) => Number(a.fiyat) - Number(b.fiyat))
                  : eslesSort === 'fiyat_azalan'
                  ? [...eslesen].sort((a, b) => Number(b.fiyat) - Number(a.fiyat))
                  : eslesen
                )
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
      {activeIstekIdx !== null && filterPage !== 'main' && (
        <Modal visible={true} animationType="slide" transparent onRequestClose={() => { setFilterPage('main'); setActiveIstekIdx(null); setKonumSearch(''); }}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
            <TouchableOpacity style={styles.modalDimmer} onPress={() => { setFilterPage('main'); setActiveIstekIdx(null); setKonumSearch(''); }} />
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
                        <View style={[styles.konumCheckbox, secili && styles.konumCheckboxAktif]}>
                          {secili && <Text style={styles.konumCheckboxTick}>✓</Text>}
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
                        onChangeText={v => setLinkSaat(v.replace(/\D/g, ''))}
                        onBlur={() => { if (!linkSaat || linkSaat === '0') setLinkSaat('1'); }}
                        selectTextOnFocus
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
                {(() => {
                  const cleaned = (musteri?.telefon ?? '').replace(/\D/g, '').replace(/^0/, '');
                  if (!cleaned || !linkUrl) return null;
                  return (
                    <TouchableOpacity onPress={() => Linking.openURL(`whatsapp://send?phone=${cleaned}&text=${encodeURIComponent(linkUrl)}`).catch(() => Linking.openURL(`https://wa.me/${cleaned}?text=${encodeURIComponent(linkUrl)}`))} style={{ backgroundColor: '#25D366', borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: 10 }}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>WhatsApp'ta Gönder</Text>
                    </TouchableOpacity>
                  );
                })()}
                <TouchableOpacity onPress={() => { setLinkUrl(null); setLinkSecimIds([]); setLinkSaat('24'); }}
                  style={{ padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.outline, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>Yeni Link Oluştur</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Token Süre Uzat Modal */}
      <Modal visible={tokenUzatModal} transparent animationType="fade" onRequestClose={() => setTokenUzatModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: 16, padding: 22, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.onSurface, marginBottom: 14 }}>Süreyi Uzat</Text>
            <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant, marginBottom: 8 }}>Yeni bitiş tarihi ve saati</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setTokenUzatPicker('date'); }}
                style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, backgroundColor: Colors.surfaceContainer }}>
                <Text style={{ fontSize: 13, color: Colors.onSurface }}>📅 {(() => { const pad = (n: number) => String(n).padStart(2,'0'); const d = tokenYeniTarih; return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`; })()}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setTokenUzatPicker('time'); }}
                style={{ paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, backgroundColor: Colors.surfaceContainer, minWidth: 100 }}>
                <Text style={{ fontSize: 13, color: Colors.onSurface }}>⏰ {String(tokenYeniTarih.getHours()).padStart(2,'0')}:{String(tokenYeniTarih.getMinutes()).padStart(2,'0')}</Text>
              </TouchableOpacity>
            </View>
            {tokenUzatPicker && (
              <DateTimePicker value={tokenYeniTarih} mode={tokenUzatPicker} is24Hour locale="tr-TR"
                display={Platform.OS === 'ios' ? (tokenUzatPicker === 'date' ? 'inline' : 'spinner') : tokenUzatPicker === 'date' ? 'calendar' : 'default'}
                onChange={(_, sel) => {
                  if (Platform.OS === 'android') { setTokenUzatPicker(null); }
                  if (sel) {
                    const merged = new Date(tokenYeniTarih);
                    if (tokenUzatPicker === 'date') merged.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate());
                    else merged.setHours(sel.getHours(), sel.getMinutes(), 0, 0);
                    setTokenYeniTarih(merged);
                  }
                }} />
            )}
            {Platform.OS === 'ios' && tokenUzatPicker && (
              <TouchableOpacity onPress={() => setTokenUzatPicker(null)} style={{ alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '700' }}>Tamam</Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity onPress={() => setTokenUzatModal(false)}
                style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' }}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={tokenUzatKaydet} style={{ flex: 1, padding: 12, backgroundColor: '#2563eb', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '700' }}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Görev Önerisi Modal */}
      <Modal visible={!!gorevOneriModal} transparent animationType="fade" onRequestClose={() => setGorevOneriModal(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: 16, padding: 22, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 13, color: '#c4b5fd', fontWeight: '700', marginBottom: 6 }}>🤖 Görev Önerisi</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.onSurface, marginBottom: 4 }}>{gorevOneriModal?.baslik}</Text>
            {gorevOneriModal?.tarih && (
              <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant, marginBottom: 12 }}>📅 {new Date(gorevOneriModal.tarih).toLocaleDateString('tr-TR')}</Text>
            )}
            <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant, marginBottom: 6 }}>Hatırlatma saati:</Text>
            {!showGorevOneriSaatPicker ? (
              <TouchableOpacity onPress={() => setShowGorevOneriSaatPicker(true)}
                style={{ padding: 10, borderWidth: 1, borderColor: '#7c3aed', borderRadius: 8, alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#c4b5fd' }}>
                  ⏰ {String(gorevOneriSaat.getHours()).padStart(2,'0')}:{String(gorevOneriSaat.getMinutes()).padStart(2,'0')}
                </Text>
              </TouchableOpacity>
            ) : (
              <DateTimePicker value={gorevOneriSaat} mode="time" is24Hour display="spinner"
                onChange={(_, d) => { setShowGorevOneriSaatPicker(false); if (d) setGorevOneriSaat(d); }} />
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => setGorevOneriModal(null)}
                style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' }}>Hayır</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                if (!gorevOneriModal) return;
                const { data: { user: u } } = await supabase.auth.getUser();
                let hedefTarih: string | null = null;
                if (gorevOneriModal.tarih) {
                  const dt = new Date(gorevOneriModal.tarih);
                  dt.setHours(gorevOneriSaat.getHours(), gorevOneriSaat.getMinutes(), 0, 0);
                  hedefTarih = dt.toISOString();
                }
                await supabase.from('musteri_gorevler').insert({
                  musteri_id: id, user_id: u?.id, baslik: gorevOneriModal.baslik,
                  hedef_tarih: hedefTarih, aciklama: 'Nottan önerildi',
                });
                if (gorevOneriModal.rowId) await supabase.from('asistan_oneriler').delete().eq('id', gorevOneriModal.rowId);
                setGorevOneriModal(null);
                refreshGorevler();
              }} style={{ flex: 1, padding: 12, backgroundColor: '#7c3aed', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '700' }}>Evet, Ekle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <PersistentTabBar />
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

function gorevTarihGoster(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const tarih = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
  return hasTime ? `${tarih} ${pad(d.getHours())}:${pad(d.getMinutes())}` : tarih;
}

function GorevlerBox({
  gorevler, gorevEkle, gorevBaslik, gorevAciklama, gorevHedefTarih, gorevHedefSaat, gorevEditId,
  showGorevPicker, showGorevSaatPicker, setGorevBaslik, setGorevAciklama, setGorevHedefTarih, setGorevHedefSaat, setShowGorevPicker, setShowGorevSaatPicker,
  onEkleAc, onKaydet, onIptal, onTamamla, onDuzenle, onSil,
}: {
  gorevler: MusteriGorev[];
  gorevEkle: boolean;
  gorevBaslik: string;
  gorevAciklama: string;
  gorevHedefTarih: Date | null;
  gorevHedefSaat: Date | null;
  gorevEditId: string | null;
  showGorevPicker: boolean;
  showGorevSaatPicker: boolean;
  setGorevBaslik: (v: string) => void;
  setGorevAciklama: (v: string) => void;
  setGorevHedefTarih: (v: Date | null) => void;
  setGorevHedefSaat: (v: Date | null) => void;
  setShowGorevPicker: (v: boolean) => void;
  setShowGorevSaatPicker: (v: boolean) => void;
  onEkleAc: () => void;
  onKaydet: () => void;
  onIptal: () => void;
  onTamamla: (g: MusteriGorev) => void;
  onDuzenle: (g: MusteriGorev) => void;
  onSil: (id: string) => void;
}) {
  return (
    <View style={gorevStyles.box}>
      <View style={gorevStyles.header}>
        <Text style={gorevStyles.baslik}>✓ Görevler {gorevler.length > 0 ? `(${gorevler.length})` : ''}</Text>
        {!gorevEkle && (
          <TouchableOpacity onPress={onEkleAc} style={gorevStyles.ekleBtn}>
            <Text style={gorevStyles.ekleBtnText}>+ Görev Ekle</Text>
          </TouchableOpacity>
        )}
      </View>

      {gorevEkle && (
        <View style={gorevStyles.form}>
          <TextInput
            style={gorevStyles.input}
            placeholder="Görev başlığı..."
            placeholderTextColor={Colors.outlineVariant}
            value={gorevBaslik}
            onChangeText={setGorevBaslik}
          />
          <TextInput
            style={[gorevStyles.input, { minHeight: 48, marginTop: 6 }]}
            placeholder="Açıklama (isteğe bağlı)..."
            placeholderTextColor={Colors.outlineVariant}
            value={gorevAciklama}
            onChangeText={setGorevAciklama}
            multiline
            textAlignVertical="top"
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowGorevPicker(true); }} style={[gorevStyles.input, { flex: 1, minWidth: 120, justifyContent: 'center' }]}>
              <Text style={{ fontSize: 13, color: gorevHedefTarih ? Colors.onSurface : Colors.outlineVariant }}>
                {gorevHedefTarih ? `📅 ${gorevTarihGoster(gorevHedefTarih.toISOString()).split(' ')[0]}` : '📅 Tarih'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowGorevSaatPicker(true); }} style={[gorevStyles.input, { minWidth: 90, justifyContent: 'center' }]}>
              <Text style={{ fontSize: 13, color: gorevHedefSaat ? Colors.onSurface : Colors.outlineVariant }}>
                {gorevHedefSaat ? `⏰ ${String(gorevHedefSaat.getHours()).padStart(2,'0')}:${String(gorevHedefSaat.getMinutes()).padStart(2,'0')}` : '⏰ Saat'}
              </Text>
            </TouchableOpacity>
            {(gorevHedefTarih || gorevHedefSaat) && (
              <TouchableOpacity onPress={() => { setGorevHedefTarih(null); setGorevHedefSaat(null); }}>
                <Text style={{ fontSize: 12, color: Colors.error }}>Temizle</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onKaydet} style={[gorevStyles.kaydetBtn, !gorevBaslik.trim() && { opacity: 0.5 }]} disabled={!gorevBaslik.trim()}>
              <Text style={gorevStyles.kaydetBtnText}>{gorevEditId ? 'Güncelle' : 'Kaydet'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onIptal} style={gorevStyles.iptalBtn}>
              <Text style={gorevStyles.iptalBtnText}>İptal</Text>
            </TouchableOpacity>
          </View>
          {showGorevPicker && (
            <DateTimePicker
              value={gorevHedefTarih ?? new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
              locale="tr-TR"
              onChange={(_, sel) => {
                setShowGorevPicker(Platform.OS === 'ios');
                if (sel) setGorevHedefTarih(sel);
              }}
            />
          )}
          {Platform.OS === 'ios' && showGorevPicker && (
            <TouchableOpacity onPress={() => setShowGorevPicker(false)} style={[gorevStyles.kaydetBtn, { marginTop: 8, alignSelf: 'flex-start' }]}>
              <Text style={gorevStyles.kaydetBtnText}>Tamam</Text>
            </TouchableOpacity>
          )}
          {showGorevSaatPicker && (
            <DateTimePicker
              value={gorevHedefSaat ?? new Date()}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              is24Hour
              onChange={(_, sel) => {
                setShowGorevSaatPicker(Platform.OS === 'ios');
                if (sel) setGorevHedefSaat(sel);
              }}
            />
          )}
          {Platform.OS === 'ios' && showGorevSaatPicker && (
            <TouchableOpacity onPress={() => setShowGorevSaatPicker(false)} style={[gorevStyles.kaydetBtn, { marginTop: 8, alignSelf: 'flex-start' }]}>
              <Text style={gorevStyles.kaydetBtnText}>Tamam</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {gorevler.length === 0 && !gorevEkle ? (
        <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontStyle: 'italic' }}>Henüz görev yok.</Text>
      ) : (
        gorevler.map(g => (
          <View key={g.id} style={[gorevStyles.satir, g.tamamlandi && gorevStyles.satirTamamlandi]}>
            <TouchableOpacity onPress={() => onTamamla(g)} style={gorevStyles.checkbox} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <View style={[gorevStyles.checkboxBox, g.tamamlandi && gorevStyles.checkboxBoxOn]}>
                {g.tamamlandi ? <Text style={gorevStyles.checkboxTick}>✓</Text> : null}
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[gorevStyles.satirBaslik, g.tamamlandi && gorevStyles.satirBaslikTamamlandi]}>{g.baslik}</Text>
              {g.aciklama ? <Text style={gorevStyles.satirAciklama}>{g.aciklama}</Text> : null}
              {g.hedef_tarih ? <Text style={gorevStyles.satirTarih}>📅 {gorevTarihGoster(g.hedef_tarih)}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => Alert.alert('Görev', '', [
              { text: 'Düzenle', onPress: () => onDuzenle(g) },
              { text: 'Sil', style: 'destructive', onPress: () => onSil(g.id) },
              { text: 'İptal', style: 'cancel' },
            ])} style={gorevStyles.menuBtn}>
              <Text style={{ fontSize: 18, color: '#86efac', fontWeight: '700' }}>⋯</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

type PaylasimGecmisiItem = { paylasildigi_tarih: string; paket_token: string | null; ilanlar: { id: string; baslik: string; fiyat: number; fotograflar: string[] | null; portfoy_no: string | null; durum: string | null } | null };
type ZiyaretItem = { paket_token: string | null; ilan_id: string | null; device_id: string; ilk_giris_at: string; son_aktif_at: string; toplam_sure_sn: number; acilis_sayisi: number; user_agent: string | null };
type OturumItem = { paket_token: string | null; ilan_id: string | null; device_id: string; baslama_at: string; son_aktif_at: string; user_agent: string | null };

function PaylasimBox({
  acik, setAcik, yukleniyor, aktifToken, paylasimGecmisi, ekIlanlar, ziyaretler, oturumlari,
  timelinePeriod, setTimelinePeriod, onUzatAc, onDoldur, onLinkOlustur,
}: {
  acik: boolean;
  setAcik: (v: boolean) => void;
  yukleniyor: boolean;
  aktifToken: { token: string; expires_at: string } | null;
  paylasimGecmisi: PaylasimGecmisiItem[];
  ekIlanlar: { id: string; baslik: string; fiyat: number; fotograflar: string[] | null; portfoy_no: string | null }[];
  ziyaretler: ZiyaretItem[];
  oturumlari: OturumItem[];
  timelinePeriod: 1 | 6 | 24 | 168;
  setTimelinePeriod: (v: 1 | 6 | 24 | 168) => void;
  onUzatAc: () => void;
  onDoldur: () => void;
  onLinkOlustur: () => void;
}) {
  return (
    <View style={paylasimStyles.box}>
      <TouchableOpacity onPress={() => setAcik(!acik)} style={paylasimStyles.header}>
        <Text style={paylasimStyles.baslik}>📊 Paylaşımlar {paylasimGecmisi.length > 0 ? `(${paylasimGecmisi.length})` : ''}</Text>
        <Text style={paylasimStyles.headerOk}>{acik ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {!acik ? null : yukleniyor ? (
        <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
      ) : (
        <View style={{ gap: 12 }}>
          {/* Aktif Token */}
          {aktifToken ? (() => {
            const ks = kalanSure(aktifToken.expires_at);
            return (
              <View style={[paylasimStyles.tokenKart, { borderColor: ks.dolmus ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)', backgroundColor: ks.dolmus ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 20 }}>{ks.dolmus ? '⌛' : '🔗'}</Text>
                  <View style={{ flex: 1, minWidth: 160, gap: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: ks.dolmus ? '#fca5a5' : '#86efac' }}>{ks.dolmus ? 'Link Süresi Doldu' : 'Aktif Link'}</Text>
                    <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>{paylasimTarihKisa(aktifToken.expires_at)} {ks.dolmus ? '' : `— ${ks.text}`}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  <TouchableOpacity onPress={onUzatAc} style={paylasimStyles.tokenBtnPrimary}>
                    <Text style={paylasimStyles.tokenBtnPrimaryText}>Süreyi Uzat</Text>
                  </TouchableOpacity>
                  {!ks.dolmus && (
                    <TouchableOpacity onPress={onDoldur} style={paylasimStyles.tokenBtnDanger}>
                      <Text style={paylasimStyles.tokenBtnDangerText}>Süreyi Doldur</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })() : (
            <View style={[paylasimStyles.tokenKart, { borderColor: Colors.outlineVariant, backgroundColor: Colors.surfaceContainerLow }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 18 }}>🔗</Text>
                <Text style={{ flex: 1, fontSize: 12, color: Colors.onSurfaceVariant, minWidth: 160 }}>Bu müşteriye henüz link gönderilmedi.</Text>
                <TouchableOpacity onPress={onLinkOlustur} style={paylasimStyles.tokenBtnPrimary}>
                  <Text style={paylasimStyles.tokenBtnPrimaryText}>Link Oluştur</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Zaman Çizelgesi */}
          {oturumlari.length > 0 && <TimelineChart oturumlari={oturumlari} paylasimGecmisi={paylasimGecmisi} ekIlanlar={ekIlanlar} timelinePeriod={timelinePeriod} setTimelinePeriod={setTimelinePeriod} />}

          {/* Geçmiş */}
          <View>
            <Text style={paylasimStyles.bolumBaslik}>Paylaşım Geçmişi {paylasimGecmisi.length > 0 ? `(${paylasimGecmisi.length})` : ''}</Text>
            {paylasimGecmisi.length === 0 ? (
              <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant, fontStyle: 'italic', marginTop: 6 }}>Henüz ilan paylaşılmadı.</Text>
            ) : (
              <PaylasimListesi paylasimGecmisi={paylasimGecmisi} ziyaretler={ziyaretler} />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function TimelineChart({ oturumlari, paylasimGecmisi, ekIlanlar, timelinePeriod, setTimelinePeriod }: {
  oturumlari: OturumItem[];
  paylasimGecmisi: PaylasimGecmisiItem[];
  ekIlanlar: { id: string; baslik: string; fiyat: number; fotograflar: string[] | null; portfoy_no: string | null }[];
  timelinePeriod: 1 | 6 | 24 | 168;
  setTimelinePeriod: (v: 1 | 6 | 24 | 168) => void;
}) {
  const ilanMap = new Map<string, { baslik: string; portfoy: string | null; fiyat: number; foto: string | null }>();
  paylasimGecmisi.forEach(p => {
    if (p.ilanlar) ilanMap.set(p.ilanlar.id, {
      baslik: p.ilanlar.baslik, portfoy: p.ilanlar.portfoy_no, fiyat: p.ilanlar.fiyat,
      foto: p.ilanlar.fotograflar?.[0] ?? null,
    });
  });
  ekIlanlar.forEach(e => {
    if (!ilanMap.has(e.id)) ilanMap.set(e.id, {
      baslik: e.baslik, portfoy: e.portfoy_no, fiyat: e.fiyat,
      foto: e.fotograflar?.[0] ?? null,
    });
  });
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
  const colorFor = (key: string) => {
    let h = 0;
    for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
    return palette[Math.abs(h) % palette.length];
  };
  const nowMs = Date.now();
  const periodMs = timelinePeriod * 3600 * 1000;
  const filterStart = nowMs - periodMs;
  const sortedAll = [...oturumlari].sort((a, b) => new Date(a.baslama_at).getTime() - new Date(b.baslama_at).getTime());
  const sorted = sortedAll.filter(s => new Date(s.son_aktif_at).getTime() >= filterStart && new Date(s.baslama_at).getTime() <= nowMs);

  // X-axis: tight fit to data (boş saatleri gösterme)
  let minT: number, maxT: number;
  if (sorted.length === 0) {
    minT = filterStart;
    maxT = nowMs;
  } else {
    const dataStart = Math.min(...sorted.map(s => new Date(s.baslama_at).getTime()));
    const dataEnd = Math.max(...sorted.map(s => new Date(s.son_aktif_at).getTime()));
    const hasActive = sorted.some(s => sonAktifText(s.son_aktif_at).canli);
    const displayEnd = hasActive ? Math.max(dataEnd, nowMs) : dataEnd;
    const span = Math.max(displayEnd - dataStart, 5 * 60_000);
    const buffer = Math.max(span * 0.05, 60_000);
    minT = dataStart - buffer;
    maxT = displayEnd + buffer;
  }
  const range = maxT - minT;

  const screenW = Dimensions.get('window').width;
  const chartW = Math.max(screenW - 48, 600);
  const CARD_W = 160;
  const LANE_MIN_MS = Math.max(60_000, range * (CARD_W / chartW));

  const laneEnds: number[] = [];
  const sessionLanes: number[] = sorted.map(s => {
    const sStart = Math.max(new Date(s.baslama_at).getTime(), minT);
    const sEnd = Math.min(new Date(s.son_aktif_at).getTime(), maxT);
    const visualEnd = Math.max(sEnd, sStart + LANE_MIN_MS);
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= sStart) { laneEnds[i] = visualEnd; return i; }
    }
    laneEnds.push(visualEnd);
    return laneEnds.length - 1;
  });
  const laneCount = Math.max(1, laneEnds.length);

  const tickCount = timelinePeriod === 1 ? 6 : timelinePeriod === 6 ? 6 : timelinePeriod === 24 ? 8 : 7;
  const ticks: number[] = [];
  for (let i = 0; i <= tickCount; i++) ticks.push(minT + (range * i) / tickCount);

  const CARD_H = 56;
  const CONNECTOR_H = 14;
  const BAR_H = 16;
  const cardAreaH = laneCount * (CARD_H + 4);
  const chartH = cardAreaH + CONNECTOR_H + BAR_H + 4;

  return (
    <View style={paylasimStyles.timelineKart}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <Text style={paylasimStyles.bolumBaslik}>📊 Zaman Çizelgesi</Text>
        <View style={paylasimStyles.periodGroup}>
          {([[1, '1 sa'], [6, '6 sa'], [24, '24 sa'], [168, '7 gün']] as const).map(([h, label]) => (
            <TouchableOpacity key={h} onPress={() => setTimelinePeriod(h)} style={[paylasimStyles.periodChip, timelinePeriod === h && paylasimStyles.periodChipActive]}>
              <Text style={[paylasimStyles.periodChipText, timelinePeriod === h && paylasimStyles.periodChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={{ fontSize: 10, color: Colors.outline, marginBottom: 6 }}>🔄 10 sn'de bir güncellenir</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View style={{ width: chartW, paddingTop: 30, paddingBottom: 18 }}>
          {/* Üst tick label */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 }}>
            {ticks.map((t, i) => {
              const l = saatLabel(t);
              return (
                <View key={i} style={{ position: 'absolute', left: ((t - minT) / range) * chartW - 22, width: 44, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: Colors.onSurfaceVariant, fontWeight: '700' }}>{l.time}</Text>
                  <Text style={{ fontSize: 9, color: Colors.outline, fontWeight: '500' }}>{l.date}</Text>
                </View>
              );
            })}
          </View>

          {/* Chart */}
          <View style={{ position: 'relative', height: chartH, backgroundColor: Colors.surfaceContainerLow, borderRadius: 6, borderWidth: 1, borderColor: Colors.outlineVariant }}>
            {/* Tick lines */}
            {ticks.map((t, i) => (
              <View key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: ((t - minT) / range) * chartW, width: 1, backgroundColor: i === 0 || i === ticks.length - 1 ? Colors.outlineVariant : 'rgba(255,255,255,0.06)' }} />
            ))}
            {/* Şimdi çizgisi */}
            {nowMs >= minT && nowMs <= maxT && (
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: ((nowMs - minT) / range) * chartW - 1, width: 2, backgroundColor: '#22c55e' }} />
            )}
            {/* Sessions: kart üstte, çizgi ile altta bar'a bağlanır */}
            {sorted.map((s, idx) => {
              const sStartRaw = new Date(s.baslama_at).getTime();
              const sEndRaw = new Date(s.son_aktif_at).getTime();
              const sStart = Math.max(sStartRaw, minT);
              const sEnd = Math.min(sEndRaw, maxT);
              const sa = sonAktifText(s.son_aktif_at);
              const key = s.paket_token ?? s.ilan_id ?? 'unknown';
              const ilan = s.ilan_id ? ilanMap.get(s.ilan_id) : null;
              const label = ilan ? ilan.baslik : (s.paket_token ? '📋 Liste' : 'Bilinmeyen');
              const sureSn = Math.max(1, Math.floor((sEndRaw - sStartRaw) / 1000));
              const leftPx = ((sStart - minT) / range) * chartW;
              const realWidthPx = ((sEnd - sStart) / range) * chartW;
              const barWidthPx = Math.max(realWidthPx, 3);
              const lane = sessionLanes[idx];
              const cardTop = lane * (CARD_H + 4);
              const cardBottom = cardTop + CARD_H;
              const barTop = cardAreaH + CONNECTOR_H;
              const color = colorFor(key);
              return (
                <Fragment key={idx}>
                  {/* Kart */}
                  <View style={{
                    position: 'absolute', left: leftPx, width: CARD_W, top: cardTop, height: CARD_H,
                    backgroundColor: Colors.surface, borderWidth: 2, borderColor: color, borderRadius: 6,
                    overflow: 'hidden', flexDirection: 'row', zIndex: 2,
                    ...(sa.canli ? { shadowColor: '#22c55e', shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 4 } : {}),
                  }}>
                    {ilan?.foto ? (
                      <R2Image source={ilan.foto} style={{ width: 44, height: '100%' } as any} resizeMode="cover" size="sm" />
                    ) : (
                      <View style={{ width: 44, height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceContainerHigh }}>
                        <Text style={{ fontSize: 18 }}>{s.paket_token ? '📋' : '🏠'}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, paddingHorizontal: 5, paddingVertical: 3, justifyContent: 'center' }}>
                      <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '700', color }}>
                        {sa.canli ? '🟢 ' : ''}{cihazKisa(s.user_agent)} · {formatSure(sureSn)}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: Colors.onSurface }}>{label}</Text>
                      {ilan ? <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '700', color: Colors.primary }}>₺{ilan.fiyat.toLocaleString('tr-TR')}</Text> : null}
                    </View>
                  </View>
                  {/* Bağlantı çizgisi */}
                  <View style={{ position: 'absolute', left: leftPx - 1, top: cardBottom, width: 2, height: barTop - cardBottom, backgroundColor: color, zIndex: 1 }} />
                  {/* Bar */}
                  <View style={{ position: 'absolute', left: leftPx, top: barTop, width: barWidthPx, height: BAR_H, backgroundColor: color, borderRadius: 3, zIndex: 2 }} />
                </Fragment>
              );
            })}
            {sorted.length === 0 && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: Colors.outline, fontSize: 12 }}>Bu zaman aralığında oturum yok</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 10, color: Colors.outline }}>● = şimdi</Text>
        <Text style={{ fontSize: 10, color: Colors.outline }}>🟢 = aktif oturum</Text>
      </View>
    </View>
  );
}

function PaylasimListesi({ paylasimGecmisi, ziyaretler }: { paylasimGecmisi: PaylasimGecmisiItem[]; ziyaretler: ZiyaretItem[] }) {
  const groups: Array<{ key: string; type: 'single' | 'paket'; date: string; items: PaylasimGecmisiItem[] }> = [];
  const seen = new Map<string, number>();
  paylasimGecmisi.forEach((p, i) => {
    if (p.paket_token) {
      const existingIdx = seen.get(p.paket_token);
      if (existingIdx !== undefined) {
        groups[existingIdx].items.push(p);
      } else {
        seen.set(p.paket_token, groups.length);
        groups.push({ key: `paket-${p.paket_token}`, type: 'paket', date: p.paylasildigi_tarih, items: [p] });
      }
    } else {
      groups.push({ key: `single-${i}`, type: 'single', date: p.paylasildigi_tarih, items: [p] });
    }
  });

  return (
    <View style={{ gap: 6, marginTop: 6 }}>
      {groups.map(g => {
        if (g.type === 'single') {
          const p = g.items[0];
          const ilan = p.ilanlar;
          if (!ilan) return null;
          const ilanZ = ziyaretler.filter(z => z.ilan_id === ilan.id && !z.paket_token);
          const canliN = ilanZ.filter(z => sonAktifText(z.son_aktif_at).canli).length;
          return (
            <TouchableOpacity key={g.key} onPress={() => router.push(`/ilan/${ilan.id}` as any)} style={paylasimStyles.gecmisKartSingle}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {ilan.fotograflar?.[0] ? (
                  <R2Image source={ilan.fotograflar[0]} style={{ width: 56, height: 46, borderRadius: 6 } as any} resizeMode="cover" size="sm" />
                ) : (
                  <View style={{ width: 56, height: 46, borderRadius: 6, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' }}><Text>🏠</Text></View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                    <View style={paylasimStyles.chipBlue}><Text style={paylasimStyles.chipBlueText}>🏠 Tek İlan</Text></View>
                    {ilan.portfoy_no ? <View style={paylasimStyles.chipRed}><Text style={paylasimStyles.chipRedText}>#{ilan.portfoy_no}</Text></View> : null}
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: Colors.onSurface }}>{ilan.baslik}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>📅 {paylasimTarihGoster(p.paylasildigi_tarih)}</Text>
                    <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '700' }}>₺{ilan.fiyat.toLocaleString('tr-TR')}</Text>
                    {ilan.durum && ilan.durum !== 'Aktif' ? <Text style={{ fontSize: 9, color: '#fca5a5', backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, fontWeight: '700' }}>{ilan.durum}</Text> : null}
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {ilanZ.length > 0 ? (
                  <>
                    <View style={paylasimStyles.chipBlue}><Text style={paylasimStyles.chipBlueText}>👁️ {ilanZ.length} cihaz açtı</Text></View>
                    {canliN > 0 ? <View style={paylasimStyles.chipGreen}><Text style={paylasimStyles.chipGreenText}>🟢 {canliN} şu an bakıyor</Text></View> : null}
                  </>
                ) : (
                  <View style={paylasimStyles.chipGray}><Text style={paylasimStyles.chipGrayText}>Henüz açılmadı</Text></View>
                )}
              </View>
              {ilanZ.length > 0 && (
                <View style={paylasimStyles.cihazListe}>
                  {ilanZ.map(z => {
                    const sa = sonAktifText(z.son_aktif_at);
                    return (
                      <View key={z.device_id} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.onSurface }}>{cihazAdi(z.user_agent)}</Text>
                        <Text style={{ fontSize: 11, color: sa.canli ? '#86efac' : Colors.onSurfaceVariant, fontWeight: sa.canli ? '700' : '400' }}>{sa.canli ? '🟢 ' : ''}{sa.text}</Text>
                        <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>· Toplam {formatSure(z.toplam_sure_sn)}</Text>
                        {z.acilis_sayisi > 1 ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>· {z.acilis_sayisi} oturum</Text> : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </TouchableOpacity>
          );
        }
        // Paket
        const gPaketToken = g.items[0].paket_token;
        const paketIlanIds = new Set(g.items.map(p => p.ilanlar?.id).filter(Boolean) as string[]);
        const byDevice = new Map<string, typeof ziyaretler[number]>();
        ziyaretler.forEach(z => {
          const matchesPaket = z.paket_token === gPaketToken;
          const matchesIlan = z.ilan_id ? paketIlanIds.has(z.ilan_id) : false;
          if (!matchesPaket && !matchesIlan) return;
          const existing = byDevice.get(z.device_id);
          if (!existing) {
            byDevice.set(z.device_id, { ...z });
          } else {
            existing.toplam_sure_sn += z.toplam_sure_sn;
            existing.acilis_sayisi = Math.max(existing.acilis_sayisi, z.acilis_sayisi);
            if (new Date(z.son_aktif_at).getTime() > new Date(existing.son_aktif_at).getTime()) {
              existing.son_aktif_at = z.son_aktif_at;
              existing.user_agent = z.user_agent;
            }
          }
        });
        const paketZ = Array.from(byDevice.values());
        const canliN = paketZ.filter(z => sonAktifText(z.son_aktif_at).canli).length;
        return (
          <View key={g.key} style={paylasimStyles.gecmisKartPaket}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <View style={paylasimStyles.chipAmber}><Text style={paylasimStyles.chipAmberText}>📋 Liste — {g.items.length} ilan</Text></View>
              <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>📅 {paylasimTarihGoster(g.date)}</Text>
              {paketZ.length > 0 ? (
                <>
                  <View style={paylasimStyles.chipBlue}><Text style={paylasimStyles.chipBlueText}>👁️ {paketZ.length} cihaz açtı</Text></View>
                  {canliN > 0 ? <View style={paylasimStyles.chipGreen}><Text style={paylasimStyles.chipGreenText}>🟢 {canliN} şu an bakıyor</Text></View> : null}
                </>
              ) : (
                <View style={paylasimStyles.chipGray}><Text style={paylasimStyles.chipGrayText}>Henüz açılmadı</Text></View>
              )}
            </View>
            {paketZ.length > 0 && (
              <View style={paylasimStyles.cihazListe}>
                {paketZ.map(z => {
                  const sa = sonAktifText(z.son_aktif_at);
                  return (
                    <View key={z.device_id} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.onSurface }}>{cihazAdi(z.user_agent)}</Text>
                      <Text style={{ fontSize: 11, color: sa.canli ? '#86efac' : Colors.onSurfaceVariant, fontWeight: sa.canli ? '700' : '400' }}>{sa.canli ? '🟢 ' : ''}{sa.text}</Text>
                      <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>· Toplam {formatSure(z.toplam_sure_sn)}</Text>
                      {z.acilis_sayisi > 1 ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>· {z.acilis_sayisi} oturum</Text> : null}
                    </View>
                  );
                })}
              </View>
            )}
            <View style={{ borderLeftWidth: 2, borderLeftColor: 'rgba(245,158,11,0.5)', paddingLeft: 8, gap: 8, marginTop: 4 }}>
              {g.items.map((p, i) => {
                const ilan = p.ilanlar;
                if (!ilan) return null;
                const perIlan = ziyaretler.filter(z => z.ilan_id === ilan.id && z.paket_token === gPaketToken);
                const perIlanCanli = perIlan.filter(z => sonAktifText(z.son_aktif_at).canli).length;
                return (
                  <View key={`${g.key}-${ilan.id}-${i}`} style={{ gap: 4 }}>
                    <TouchableOpacity onPress={() => router.push(`/ilan/${ilan.id}` as any)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      {ilan.fotograflar?.[0] ? (
                        <R2Image source={ilan.fotograflar[0]} style={{ width: 40, height: 32, borderRadius: 4 } as any} resizeMode="cover" size="sm" />
                      ) : (
                        <View style={{ width: 40, height: 32, borderRadius: 4, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 12 }}>🏠</Text></View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          {ilan.portfoy_no ? <View style={paylasimStyles.chipRedSmall}><Text style={paylasimStyles.chipRedTextSmall}>#{ilan.portfoy_no}</Text></View> : null}
                          <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, fontWeight: '600', color: Colors.onSurface }}>{ilan.baslik}</Text>
                          {perIlan.length > 0 ? (
                            <View style={paylasimStyles.chipBlue}><Text style={paylasimStyles.chipBlueText}>👁️ {perIlan.length}{perIlanCanli > 0 ? ` · 🟢 ${perIlanCanli}` : ''}</Text></View>
                          ) : null}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '700' }}>₺{ilan.fiyat.toLocaleString('tr-TR')}</Text>
                          {ilan.durum && ilan.durum !== 'Aktif' ? <Text style={{ fontSize: 9, color: '#fca5a5', backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, fontWeight: '700' }}>{ilan.durum}</Text> : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                    {perIlan.length > 0 && (
                      <View style={{ marginLeft: 48, padding: 6, backgroundColor: Colors.surfaceContainer, borderRadius: 5, gap: 2 }}>
                        {perIlan.map(z => {
                          const sa = sonAktifText(z.son_aktif_at);
                          return (
                            <View key={`${ilan.id}-${z.device_id}`} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.onSurface }}>{cihazAdi(z.user_agent)}</Text>
                              <Text style={{ fontSize: 10, color: sa.canli ? '#86efac' : Colors.onSurfaceVariant, fontWeight: sa.canli ? '700' : '400' }}>{sa.canli ? '🟢 ' : ''}{sa.text}</Text>
                              <Text style={{ fontSize: 10, color: Colors.onSurfaceVariant }}>· {formatSure(z.toplam_sure_sn)}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const paylasimStyles = StyleSheet.create({
  box: { backgroundColor: 'rgba(59,130,246,0.10)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.4)', borderRadius: Radius.lg, padding: 14, marginTop: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  baslik: { fontSize: 13, fontWeight: '700', color: '#93c5fd', letterSpacing: 0.3 },
  headerOk: { fontSize: 12, color: '#93c5fd' },
  bolumBaslik: { fontSize: 13, fontWeight: '700', color: Colors.onSurface },
  tokenKart: { borderWidth: 1, borderRadius: 10, padding: 12 },
  tokenBtnPrimary: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#2563eb', borderRadius: 6 },
  tokenBtnPrimaryText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  tokenBtnDanger: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.1)' },
  tokenBtnDangerText: { fontSize: 12, color: '#fca5a5', fontWeight: '700' },
  timelineKart: { backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 10, padding: 10 },
  periodGroup: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerHigh, padding: 3, borderRadius: 7, gap: 2 },
  periodChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5 },
  periodChipActive: { backgroundColor: Colors.surfaceContainerHighest },
  periodChipText: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant },
  periodChipTextActive: { color: Colors.onSurface },
  gecmisKartSingle: { backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 10, padding: 10 },
  gecmisKartPaket: { backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)', borderRadius: 10, padding: 10 },
  chipBlue: { backgroundColor: 'rgba(59,130,246,0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chipBlueText: { fontSize: 10, fontWeight: '700', color: '#93c5fd' },
  chipGreen: { backgroundColor: 'rgba(34,197,94,0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chipGreenText: { fontSize: 10, fontWeight: '700', color: '#86efac' },
  chipRed: { backgroundColor: 'rgba(229,57,53,0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chipRedText: { fontSize: 10, fontWeight: '700', color: '#fca5a5' },
  chipRedSmall: { backgroundColor: 'rgba(229,57,53,0.18)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  chipRedTextSmall: { fontSize: 9, fontWeight: '700', color: '#fca5a5' },
  chipAmber: { backgroundColor: 'rgba(245,158,11,0.18)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  chipAmberText: { fontSize: 11, fontWeight: '700', color: '#fcd34d' },
  chipGray: { backgroundColor: Colors.surfaceContainerHigh, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chipGrayText: { fontSize: 10, color: Colors.onSurfaceVariant },
  cihazListe: { backgroundColor: Colors.surfaceContainer, padding: 8, borderRadius: 6, gap: 3, marginTop: 6 },
});

const gorevStyles = StyleSheet.create({
  box: { backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(134,239,172,0.5)', borderRadius: Radius.lg, padding: 14, marginTop: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  baslik: { fontSize: 13, fontWeight: '700', color: '#86efac', letterSpacing: 0.3 },
  ekleBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#16a34a', borderRadius: Radius.sm },
  ekleBtnText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  form: { marginBottom: 8 },
  input: { backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: 'rgba(134,239,172,0.5)', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: Colors.onSurface },
  kaydetBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#16a34a', borderRadius: Radius.sm },
  kaydetBtnText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  iptalBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.sm },
  iptalBtnText: { fontSize: 12, color: Colors.onSurfaceVariant },
  satir: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(34,197,94,0.4)' },
  satirTamamlandi: { opacity: 0.6 },
  checkbox: { paddingTop: 2 },
  checkboxBox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: '#86efac', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  checkboxBoxOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 15 },
  satirBaslik: { fontSize: 13, fontWeight: '600', color: Colors.onSurface },
  satirBaslikTamamlandi: { textDecorationLine: 'line-through', color: Colors.onSurfaceVariant },
  satirAciklama: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  satirTarih: { fontSize: 11, color: '#16a34a', marginTop: 3 },
  menuBtn: { paddingHorizontal: 6 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 32 },

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
  silBtn: { backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: Radius.full, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
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
  zatenBadge: { backgroundColor: 'rgba(234,179,8,0.18)', borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  zatenBadgeText: { fontSize: 10, color: '#fcd34d', fontWeight: '700' },
  iptalBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' },
  iptalBtnText: { fontSize: 14, color: '#ef4444' },
  ilanFoto: { width: 64, height: 64 },
  ilanFotoPlaceholder: { width: 64, height: 64, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  ilanBaslik: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  ilanKonum: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  ilanFiyat: { fontSize: 14, fontWeight: '700', color: Colors.primary, paddingRight: Spacing.md },

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

  emptyBox: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center' },
  emptyText: { color: Colors.onSurfaceVariant, fontSize: 14 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outline },
  chipActive: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  chipHaric: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: '#ef4444' },
  chipText: { fontSize: 12, color: Colors.onSurfaceVariant, fontWeight: '500' },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },
  chipHaricText: { color: '#fca5a5', fontWeight: '600', textDecorationLine: 'line-through' },

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
  konumBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent' },
  konumBoxAktif: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  konumBoxText: { fontSize: 13, color: Colors.onSurfaceVariant, flex: 1 },
  konumBoxTextAktif: { color: Colors.primary, fontWeight: '600' },
  konumBoxChevron: { fontSize: 14, color: Colors.onSurfaceVariant },
  listeGrupBaslik: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant, paddingHorizontal: Spacing.xl, paddingVertical: 6, backgroundColor: Colors.surfaceContainerLow, textTransform: 'uppercase', letterSpacing: 0.5 },
  konumCheckbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: Colors.outlineVariant, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  konumCheckboxAktif: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  konumCheckboxTick: { color: '#fff', fontSize: 12, fontWeight: '700' },

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

  etiketInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, paddingHorizontal: Spacing.md, width: 80 },
  etiketHash: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginRight: 1 },
  etiketInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: Colors.onSurface },
  etiketBadge: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  etiketBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

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
