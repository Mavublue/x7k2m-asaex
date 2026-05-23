import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Modal, FlatList, SectionList,
  KeyboardAvoidingView, Platform, Dimensions, RefreshControl, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

const { width: SCREEN_W } = Dimensions.get('window');
const POPUP_W = 290;
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase';
import { deleteIlanPhotos } from '../../lib/r2';
import { Colors, Radius, Spacing } from '../../constants/theme';
import R2Image from '../../components/R2Image';
import { Ilan } from '../../types';
import { TURKIYE, IL_LISTESI, getMahalleGruplar } from '../../constants/turkiye';

function normalizeMahalle(m: string): string {
  return m.toLowerCase().replace(/\s*(mahallesi|mah\.?)\s*$/, '').replace(/\s+/g, '').trim();
}

function fmtPin(fiyat: number) {
  if (fiyat >= 1_000_000) return (fiyat / 1_000_000).toFixed(1) + 'M';
  if (fiyat >= 1_000) return Math.round(fiyat / 1_000) + 'K';
  return String(fiyat);
}

function buildMapHtml(ilanlar: Ilan[]) {
  const list = ilanlar.filter(i => i.lat && i.lng);
  if (list.length === 0) return '';
  const markers = list.map(i => ({
    id: i.id, lat: i.lat, lng: i.lng,
    fiyat: fmtPin(i.fiyat), tip: i.tip,
  }));
  const merkez = list.length === 1
    ? `[${list[0].lat}, ${list[0].lng}]`
    : '[39.925, 32.836]';
  const zoom = list.length === 1 ? 13 : 6;
  return `<!DOCTYPE html><html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}body,#map{width:100vw;height:100vh;overflow:hidden}
.pm{background:#6750A4;color:#fff;border-radius:20px;padding:4px 9px;font-weight:700;font-size:11px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff;cursor:pointer}
.pm.k{background:#4e5ba6}.leaflet-control-attribution{font-size:8px}
.marker-cluster-small,.marker-cluster-medium,.marker-cluster-large{background-color:rgba(103,80,164,.25)}
.marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div{background-color:rgba(103,80,164,.85);color:#fff;font-weight:700}</style>
</head>
<body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false}).setView(${merkez},${zoom});
var osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'});var esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'© Esri'});esri.addTo(map);L.control.layers({'Uydu':esri,'Sokak':osm},null,{position:'topright'}).addTo(map);
map.on('click',function(){window.ReactNativeWebView.postMessage(JSON.stringify({close:true}));});
var cluster=L.markerClusterGroup({maxClusterRadius:40});
var ms=${JSON.stringify(markers)},bs=[];
ms.forEach(function(m){
  var icon=L.divIcon({html:'<div class="pm'+(m.tip==='Kiralık'?' k':'')+'">₺'+m.fiyat+'</div>',className:'',iconSize:null,iconAnchor:[28,14]});
  var mk=L.marker([m.lat,m.lng],{icon:icon});
  mk.on('click',function(e){var pt=map.latLngToContainerPoint(e.latlng);window.ReactNativeWebView.postMessage(JSON.stringify({id:m.id,px:pt.x,py:pt.y}));});
  cluster.addLayer(mk);
  bs.push([m.lat,m.lng]);
});
map.addLayer(cluster);
if(bs.length>1)map.fitBounds(bs,{padding:[30,30]});
</script></body></html>`;
}

const ILLER = TURKIYE;
const ILLER_LISTESI = IL_LISTESI;

const ODALAR = ['Stüdyo', '1+0', '1+1', '2+0', '2+1', '2+2', '3+0', '3+1', '3+2', '3+3', '4+0', '4+1', '4+2', '4+3', '4+4', '5+0', '5+1', '5+2', '5+3', '5+4', '6+0', '6+1', '6+2', '6+3', '6+4', '7+0', '7+1', '7+2', '7+3', '7+4', '8+0', '8+1', '8+2', '8+3', '8+4', '9+0', '9+1', '9+2', '9+3', '9+4', '10+0', '10+1', '10+2', '10+3', '10+4', '10+'];

const odaToOdaSayisi = (oda: string): number => {
  if (oda === 'Stüdyo') return 0;
  const m = oda.match(/^(\d+)/);
  return m ? parseInt(m[1]) : -1;
};
const odaIsExpandable = (o: string) => /^\d+\+\d+$/.test(o);
const odaUstuListesi = (base: string): string[] => {
  if (!odaIsExpandable(base)) return [base];
  const baseN = odaToOdaSayisi(base);
  return ODALAR.filter(o => odaToOdaSayisi(o) >= baseN);
};
const KATEGORILER = ['Daire', 'Villa', 'Arsa', 'Tarla', 'İşyeri', 'Otel', 'Müstakil Ev', 'Rezidans'];
const BINA_YASLARI = ['0', '1', '2', '3', '4', '5', '6-10', '11-15', '16-20', '21-25', '+30'];
const KAT_SAYISI_DEGERLERI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '20+'];
const BULUNDUGU_KAT_DEGERLERI = ['Giriş Altı Kot', 'Bodrum Kat', 'Zemin Kat', 'Bahçe Katı', 'Giriş Katı', 'Yüksek Giriş', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20+', 'Çatı Katı', 'Müstakil', 'Villa Tipi'];

type FiltreState = {
  tip: string;
  durum: string;
  musteriGizle: string;
  kategoriler: string[];
  kategoriler_haric: string[];
  filterIl: string[];
  filterIlce: string[];
  filterMahalle: string[];
  fiyatMin: string;
  fiyatMax: string;
  odalar: string[];
  binaYaslari: string[];
  binaYaslari_haric: string[];
  katSayilari: string[];
  bulunduguKatlar: string[];
  bulunduguKatlar_haric: string[];
  ozellikler: string[];
  ozellikler_haric: string[];
};

const BOS_FILTRE: FiltreState = {
  tip: 'Tümü', durum: 'Aktif', musteriGizle: 'Tümü',
  kategoriler: [], kategoriler_haric: [], filterIl: [], filterIlce: [], filterMahalle: [],
  fiyatMin: '', fiyatMax: '', odalar: [],
  binaYaslari: [], binaYaslari_haric: [],
  katSayilari: [],
  bulunduguKatlar: [], bulunduguKatlar_haric: [],
  ozellikler: [], ozellikler_haric: [],
};

function aktifFiltreSayisi(f: FiltreState) {
  let n = 0;
  if (f.tip !== 'Tümü') n++;
  if (f.durum !== 'Aktif') n++;
  if (f.musteriGizle !== 'Tümü') n++;
  if (f.kategoriler.length || f.kategoriler_haric.length) n++;
  if (f.filterIl.length || f.filterIlce.length || f.filterMahalle.length) n++;
  if (f.fiyatMin || f.fiyatMax) n++;
  if (f.odalar.length) n++;
  if (f.binaYaslari.length || f.binaYaslari_haric.length) n++;
  if (f.katSayilari.length) n++;
  if (f.bulunduguKatlar.length || f.bulunduguKatlar_haric.length) n++;
  if (f.ozellikler.length || f.ozellikler_haric.length) n++;
  return n;
}

export default function IlanlarScreen() {
  const insets = useSafeAreaInsets();
  const [ilanlar, setIlanlar] = useState<Ilan[]>([]);
  const [filtered, setFiltered] = useState<Ilan[]>([]);
  const [mapHtml, setMapHtml] = useState('');
  const [gorunum, setGorunum] = useState<'liste' | 'harita'>('liste');
  const [seciliIlan, setSeciliIlan] = useState<Ilan | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef<WebView>(null);
  const [filtrePaneli, setFiltrePaneli] = useState(false);
  const [filtre, setFiltre] = useState<FiltreState>(BOS_FILTRE);
  const [gecici, setGecici] = useState<FiltreState>(BOS_FILTRE);
  const [filterPage, setFilterPage] = useState<'main' | 'il' | 'ilce' | 'mahalle' | 'oda'>('main');
  const [konumSearch, setKonumSearch] = useState('');
  const [tumOzellikler, setTumOzellikler] = useState<{id: string; ad: string}[]>([]);
  const [siralama, setSiralama] = useState<'tarih_yeni' | 'tarih_eski' | 'fiyat_artan' | 'fiyat_azalan'>('tarih_yeni');
  const [siralamaAcik, setSiralamaAcik] = useState(false);
  const siralamaBtnRef = useRef<View>(null);
  const [siralamaBtnPos, setSiralamaBtnPos] = useState({ top: 0, right: 0 });
  const [profilSlug, setProfilSlug] = useState('');
  const [paylasModal, setPaylasModal] = useState(false);
  const [paylasLink, setPaylasLink] = useState('');
  const [paylasYukleniyor, setPaylasYukleniyor] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [paylasMusteriler, setPaylasMusteriler] = useState<{id:string;ad:string;soyad:string;etiketler:string|null}[]>([]);
  const [paylasMusteri, setPaylasMusteri] = useState('');
  const [paylasMusteriAra, setPaylasMusteriAra] = useState('');
  const [paylasSaat, setPaylasSaat] = useState('168');
  const [paylasEtiketAra, setPaylasEtiketAra] = useState('');
  const [paylasHaric, setPaylasHaric] = useState<Set<string>>(new Set());
  const [paylasIlanlar, setPaylasIlanlar] = useState<Ilan[]>([]);
  const [rastgeleModal, setRastgeleModal] = useState(false);

  function rastgeleGit(mod: 'Tümü' | 'Görünür' | 'Görünmez') {
    setRastgeleModal(false);
    const havuz = ilanlar.filter(i => {
      if (i.durum !== 'Aktif') return false;
      if (mod === 'Görünür') return !i.musteri_gizle;
      if (mod === 'Görünmez') return !!i.musteri_gizle;
      return true;
    });
    if (!havuz.length) { Alert.alert('Bulunamadı', 'Bu filtrede aktif ilan yok.'); return; }
    const secilen = havuz[Math.floor(Math.random() * havuz.length)];
    router.push(`/ilan/${secilen.id}`);
  }

  // Toplu seçim
  const [secimModu, setSecimModu] = useState(false);
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set());
  const [topluIslem, setTopluIslem] = useState(false);
  const [ozellikModal, setOzellikModal] = useState<'ekle' | 'cikar' | null>(null);
  const [ozellikSecili, setOzellikSecili] = useState<Set<string>>(new Set());
  const [durumModal, setDurumModal] = useState(false);
  const [katModal, setKatModal] = useState(false);
  const [topluKatSayisi, setTopluKatSayisi] = useState<string>('');
  const [topluBulunduguKat, setTopluBulunduguKat] = useState<string>('');

  type Section = { title: string; showHeader: boolean; data: string[]; key: string };
  let konumSections: Section[] = [];
  const q = konumSearch.toLowerCase();
  if (filterPage === 'il') {
    konumSections = [{
      title: '', showHeader: false, key: 'iller',
      data: ILLER_LISTESI.filter(i => i.toLowerCase().includes(q)),
    }];
  } else if (filterPage === 'ilce') {
    gecici.filterIl.forEach(il => {
      const ilceler = (ILLER[il] ?? []).slice().sort((a,b) => a.localeCompare(b,'tr')).filter(i => i.toLowerCase().includes(q));
      if (ilceler.length > 0) konumSections.push({ title: il, showHeader: gecici.filterIl.length > 1, data: ilceler, key: il });
    });
  } else if (filterPage === 'mahalle') {
    const cokIlce = gecici.filterIl.length > 1 || gecici.filterIlce.length > 1;
    gecici.filterIl.forEach(il => {
      gecici.filterIlce.forEach(ilce => {
        if (!(ILLER[il] ?? []).includes(ilce)) return;
        const gruplar = getMahalleGruplar(il, ilce)
          .map(g => {
            const semtMatch = g.semt && g.semt.toLowerCase().includes(q);
            return { semt: g.semt, mahalleler: semtMatch ? g.mahalleler : g.mahalleler.filter(m => m.toLowerCase().includes(q)) };
          })
          .filter(g => g.mahalleler.length > 0);
        gruplar.forEach((g, gi) => {
          const baseTitle = cokIlce ? `${il} - ${ilce}` : '';
          const title = g.semt ? (baseTitle ? `${baseTitle} • ${g.semt}` : g.semt) : baseTitle;
          konumSections.push({ title, showHeader: !!title, data: g.mahalleler, key: `${il}|${ilce}|${g.semt ?? `__${gi}`}` });
        });
      });
    });
  }

  useEffect(() => {
    supabase.from('ozellikler').select('*').order('olusturma_tarihi').then(({ data }) => {
      if (data) setTumOzellikler(data);
    });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiller').select('slug').eq('id', user.id).single().then(({ data }) => {
          if (data?.slug) setProfilSlug(data.slug);
        });
      }
    });
  }, []);

  useEffect(() => { fetchIlanlar(); }, []);
  useFocusEffect(useCallback(() => { fetchIlanlar(); }, []));

  useEffect(() => { uygula(filtre); }, [search, filtre, ilanlar, siralama]);

  async function onRefresh() {
    setRefreshing(true);
    await fetchIlanlar();
    setRefreshing(false);
  }

  async function fetchIlanlar() {
    const { data } = await supabase.from('ilanlar').select('*, ilan_ozellikler(ozellik_id)').order('olusturma_tarihi', { ascending: false });
    if (data) {
      const mapped = (data as any[]).map(i => ({ ...i, ozellik_ids: (i.ilan_ozellikler ?? []).map((r: any) => r.ozellik_id) }));
      setIlanlar(mapped);
    }
    setLoading(false);
  }

  function uygula(f: FiltreState) {
    let r = ilanlar;
    if (f.tip !== 'Tümü') r = r.filter(i => i.tip === f.tip);
    if (f.durum === 'Aktif') r = r.filter(i => !i.durum || i.durum === 'Aktif');
    else if (f.durum === 'İptal') r = r.filter(i => i.durum === 'İptal');
    if (f.musteriGizle === 'Görünür') r = r.filter(i => !i.musteri_gizle);
    else if (f.musteriGizle === 'Gizli') r = r.filter(i => !!i.musteri_gizle);
    // 'Tümü' = no filter
    if (f.kategoriler.length) r = r.filter(i => {
      const ilanCats = (i.kategori ?? '').split(',').map(s => s.trim()).filter(Boolean);
      return ilanCats.some(c => f.kategoriler.includes(c));
    });
    if (f.kategoriler_haric.length) r = r.filter(i => {
      const ilanCats = (i.kategori ?? '').split(',').map(s => s.trim()).filter(Boolean);
      return !ilanCats.some(c => f.kategoriler_haric.includes(c));
    });
    if (f.filterIl.length || f.filterIlce.length || f.filterMahalle.length) {
      r = r.filter(ilan => {
        if (f.filterIl.length > 0 && !f.filterIl.includes(ilan.konum)) return false;
        if (f.filterIlce.length > 0 && (!ilan.ilce || !f.filterIlce.includes(ilan.ilce))) return false;
        if (f.filterMahalle.length > 0 && !f.filterMahalle.some(m => normalizeMahalle(ilan.mahalle ?? '') === normalizeMahalle(m))) return false;
        return true;
      });
    }
    if (f.fiyatMin) r = r.filter(i => i.fiyat >= parseInt(f.fiyatMin.replace(/\./g, '')));
    if (f.fiyatMax) r = r.filter(i => i.fiyat <= parseInt(f.fiyatMax.replace(/\./g, '')));
    if (f.odalar.length) r = r.filter(i => i.oda_sayisi && f.odalar.includes(i.oda_sayisi));
    if (f.binaYaslari.length) r = r.filter(i => i.bina_yasi && f.binaYaslari.includes(i.bina_yasi));
    if (f.binaYaslari_haric.length) r = r.filter(i => !i.bina_yasi || !f.binaYaslari_haric.includes(i.bina_yasi));
    if (f.katSayilari.length) r = r.filter(i => i.kat_sayisi && f.katSayilari.includes(i.kat_sayisi));
    if (f.bulunduguKatlar.length) r = r.filter(i => i.bulundugu_kat && f.bulunduguKatlar.includes(i.bulundugu_kat));
    if (f.bulunduguKatlar_haric.length) r = r.filter(i => !i.bulundugu_kat || !f.bulunduguKatlar_haric.includes(i.bulundugu_kat));
    if (f.ozellikler.length) r = r.filter(i => {
      const ilanOz: string[] = (i as any).ozellik_ids ?? [];
      return f.ozellikler.every(o => ilanOz.includes(o));
    });
    if (f.ozellikler_haric.length) r = r.filter(i => {
      const ilanOz: string[] = (i as any).ozellik_ids ?? [];
      return !f.ozellikler_haric.some(o => ilanOz.includes(o));
    });
    if (search) r = r.filter(i =>
      i.baslik.toLowerCase().includes(search.toLowerCase()) ||
      i.konum.toLowerCase().includes(search.toLowerCase()) ||
      (i.ilce ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (i.mahalle ?? '').toLowerCase().includes(search.toLowerCase())
    );
    r = [...r].sort((a, b) => {
      if (siralama === 'fiyat_artan') return a.fiyat - b.fiyat;
      if (siralama === 'fiyat_azalan') return b.fiyat - a.fiyat;
      if (siralama === 'tarih_eski') return new Date(a.olusturma_tarihi).getTime() - new Date(b.olusturma_tarihi).getTime();
      return new Date(b.olusturma_tarihi).getTime() - new Date(a.olusturma_tarihi).getTime();
    });
    setFiltered(r);
    setMapHtml(buildMapHtml(r));
  }

  function formatFiyat(val: string) {
    const digits = val.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function toggleKategori(k: string) {
    setGecici(g => ({
      ...g,
      kategoriler: g.kategoriler.includes(k) ? g.kategoriler.filter(x => x !== k) : [...g.kategoriler, k],
      kategoriler_haric: g.kategoriler_haric.filter(x => x !== k),
    }));
  }
  function toggleKategoriHaric(k: string) {
    setGecici(g => ({
      ...g,
      kategoriler: g.kategoriler.filter(x => x !== k),
      kategoriler_haric: g.kategoriler_haric.includes(k) ? g.kategoriler_haric.filter(x => x !== k) : [...g.kategoriler_haric, k],
    }));
  }

  function toggleOda(o: string) {
    const sec = gecici.odalar.includes(o);
    setGecici(g => ({ ...g, odalar: sec ? g.odalar.filter(x => x !== o) : [...g.odalar, o] }));
  }
  function toggleOdaUstu(o: string) {
    const ekle = odaUstuListesi(o);
    if (ekle.length <= 1) return;
    const tumu = ekle.every(x => gecici.odalar.includes(x));
    setGecici(g => ({
      ...g,
      odalar: tumu ? g.odalar.filter(x => !ekle.includes(x)) : Array.from(new Set([...g.odalar, ...ekle])),
    }));
  }

  function toggleOzellik(o: string) {
    setGecici(g => ({
      ...g,
      ozellikler_haric: g.ozellikler_haric.filter(x => x !== o),
      ozellikler: g.ozellikler.includes(o) ? g.ozellikler.filter(x => x !== o) : [...g.ozellikler, o],
    }));
  }
  function toggleOzellikHaric(o: string) {
    setGecici(g => ({
      ...g,
      ozellikler: g.ozellikler.filter(x => x !== o),
      ozellikler_haric: g.ozellikler_haric.includes(o) ? g.ozellikler_haric.filter(x => x !== o) : [...g.ozellikler_haric, o],
    }));
  }
  function toggleBinaYasi(b: string) {
    setGecici(g => ({
      ...g,
      binaYaslari_haric: g.binaYaslari_haric.filter(x => x !== b),
      binaYaslari: g.binaYaslari.includes(b) ? g.binaYaslari.filter(x => x !== b) : [...g.binaYaslari, b],
    }));
  }
  function toggleBinaYasiHaric(b: string) {
    setGecici(g => ({
      ...g,
      binaYaslari: g.binaYaslari.filter(x => x !== b),
      binaYaslari_haric: g.binaYaslari_haric.includes(b) ? g.binaYaslari_haric.filter(x => x !== b) : [...g.binaYaslari_haric, b],
    }));
  }
  function toggleBulunduguKat(k: string) {
    setGecici(g => ({
      ...g,
      bulunduguKatlar_haric: g.bulunduguKatlar_haric.filter(x => x !== k),
      bulunduguKatlar: g.bulunduguKatlar.includes(k) ? g.bulunduguKatlar.filter(x => x !== k) : [...g.bulunduguKatlar, k],
    }));
  }
  function toggleBulunduguKatHaric(k: string) {
    setGecici(g => ({
      ...g,
      bulunduguKatlar: g.bulunduguKatlar.filter(x => x !== k),
      bulunduguKatlar_haric: g.bulunduguKatlar_haric.includes(k) ? g.bulunduguKatlar_haric.filter(x => x !== k) : [...g.bulunduguKatlar_haric, k],
    }));
  }

  function filtreAc() { setGecici(filtre); setFilterPage('main'); setFiltrePaneli(true); }
  function filtreUygula() { setFiltre(gecici); setFiltrePaneli(false); }
  function filtreSifirla() { setGecici(BOS_FILTRE); }

  function handleListePaylas(kaynak: 'filtre' | 'secim' = 'filtre') {
    setPaylasLink(''); setPaylasMusteri(''); setPaylasMusteriAra(''); setKopyalandi(false); setPaylasEtiketAra('');
    setPaylasHaric(new Set());
    setPaylasIlanlar(kaynak === 'secim' ? ilanlar.filter(i => seciliIds.has(i.id)) : filtered);
    supabase.from('musteriler').select('id, ad, soyad, etiketler').eq('durum', 'Aktif').order('ad')
      .then(({ data }) => { if (data) setPaylasMusteriler(data); });
    setPaylasModal(true);
  }

  async function handlePaylasOlustur() {
    if (!paylasMusteri) return;
    setPaylasYukleniyor(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setPaylasYukleniyor(false); return; }

    const ilanIds = paylasIlanlar.filter(i => !paylasHaric.has(i.id)).map(i => i.id);
    if (!ilanIds.length) { Alert.alert('Uyarı', 'En az bir ilan seçmelisin'); setPaylasYukleniyor(false); return; }
    const token = Array.from({ length: 8 }, () => Math.random().toString(36)[2]).join('');
    const saatSayisi = parseInt(paylasSaat);
    const expiresAt = new Date(Date.now() + saatSayisi * 60 * 60 * 1000).toISOString();

    const { data: mevcutMt } = await supabase.from('musteri_tokenler')
      .select('token').eq('user_id', session.user.id).eq('musteri_id', paylasMusteri).single();
    let musteriToken = mevcutMt?.token;
    if (musteriToken) {
      await supabase.from('musteri_tokenler').update({ expires_at: expiresAt })
        .eq('user_id', session.user.id).eq('musteri_id', paylasMusteri);
    } else {
      musteriToken = Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join('');
      await supabase.from('musteri_tokenler').insert({ token: musteriToken, user_id: session.user.id, musteri_id: paylasMusteri, expires_at: expiresAt });
    }

    const { error } = await supabase.from('paylasim_paketleri').insert({
      token, emlakci_id: session.user.id, ilan_ids: ilanIds,
      baslik: 'Filtrelenmiş İlanlar', expires_at: expiresAt, musteri_token: musteriToken,
    });
    if (error) { Alert.alert('Hata', error.message); setPaylasYukleniyor(false); return; }
    setPaylasLink(`${process.env.EXPO_PUBLIC_WEB_URL}/ozel-ilanlar/${token}`);
    setPaylasYukleniyor(false);
  }


  function secimToggle(id: string) {
    setSeciliIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function tumunuSec() {
    if (seciliIds.size === filtered.length) setSeciliIds(new Set());
    else setSeciliIds(new Set(filtered.map(i => i.id)));
  }
  function secimKapat() { setSecimModu(false); setSeciliIds(new Set()); }

  async function topluSil() {
    const ids = Array.from(seciliIds);
    if (!ids.length) return;
    Alert.alert('Toplu Sil', `${ids.length} ilan silinsin mi? Geri alınamaz.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        setTopluIslem(true);
        await Promise.all(ids.map(id => deleteIlanPhotos(id)));
        await supabase.from('ilanlar').delete().in('id', ids);
        setIlanlar(prev => prev.filter(i => !seciliIds.has(i.id)));
        setTopluIslem(false);
        secimKapat();
      }},
    ]);
  }

  async function topluDurum(yeni: 'Aktif' | 'İptal') {
    const ids = Array.from(seciliIds);
    if (!ids.length) return;
    setTopluIslem(true);
    await supabase.from('ilanlar').update({ durum: yeni }).in('id', ids);
    setIlanlar(prev => prev.map(i => seciliIds.has(i.id) ? { ...i, durum: yeni } : i));
    setTopluIslem(false);
    setDurumModal(false);
    secimKapat();
  }

  async function topluKatUygula() {
    const ids = Array.from(seciliIds);
    if (!ids.length) return;
    const payload: any = {};
    if (topluKatSayisi) payload.kat_sayisi = topluKatSayisi === '__bos__' ? null : topluKatSayisi;
    if (topluBulunduguKat) payload.bulundugu_kat = topluBulunduguKat === '__bos__' ? null : topluBulunduguKat;
    if (!Object.keys(payload).length) return;
    setTopluIslem(true);
    await supabase.from('ilanlar').update(payload).in('id', ids);
    setIlanlar(prev => prev.map(i => seciliIds.has(i.id) ? { ...i, ...payload } : i));
    setTopluIslem(false);
    setKatModal(false);
    setTopluKatSayisi('');
    setTopluBulunduguKat('');
    secimKapat();
  }

  async function topluOzellikUygula() {
    const ilanIds = Array.from(seciliIds);
    const ozIds = Array.from(ozellikSecili);
    if (!ilanIds.length || !ozIds.length || !ozellikModal) return;
    setTopluIslem(true);
    if (ozellikModal === 'ekle') {
      const rows = ilanIds.flatMap(ilan_id => ozIds.map(ozellik_id => ({ ilan_id, ozellik_id })));
      await supabase.from('ilan_ozellikler').upsert(rows, { onConflict: 'ilan_id,ozellik_id', ignoreDuplicates: true });
      setIlanlar(prev => prev.map(i => {
        if (!seciliIds.has(i.id)) return i;
        const mevcut: string[] = (i as any).ozellik_ids ?? [];
        return { ...i, ozellik_ids: Array.from(new Set([...mevcut, ...ozIds])) } as any;
      }));
    } else {
      await supabase.from('ilan_ozellikler').delete().in('ilan_id', ilanIds).in('ozellik_id', ozIds);
      setIlanlar(prev => prev.map(i => {
        if (!seciliIds.has(i.id)) return i;
        const mevcut: string[] = (i as any).ozellik_ids ?? [];
        return { ...i, ozellik_ids: mevcut.filter(o => !ozIds.includes(o)) } as any;
      }));
    }
    setTopluIslem(false);
    setOzellikModal(null);
    setOzellikSecili(new Set());
    secimKapat();
  }

  const badge = aktifFiltreSayisi(filtre);
  const [aramaModalAcik, setAramaModalAcik] = useState(false);

  const SearchPill = ({ style }: { style?: any }) => (
    <TouchableOpacity style={[styles.searchPill, style]} onPress={filtreAc} activeOpacity={0.8}>
      <Text style={styles.searchPillIcon}>🔍</Text>
      <Text style={[styles.searchPillText, !search && badge === 0 && { color: Colors.outlineVariant }]} numberOfLines={1}>
        {search || (badge > 0 ? `${badge} filtre aktif` : 'Ara ve filtrele...')}
      </Text>
      {badge > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
    </TouchableOpacity>
  );

  const SonucSatiri = () => (
    <>
      <View style={styles.sonucRow}>
        <Text style={styles.sonucSayisi}>{filtered.length} ilan</Text>
        <View ref={siralamaBtnRef} collapsable={false}>
          <TouchableOpacity style={styles.siralamaBtn} onPress={() => {
            if (siralamaAcik) { setSiralamaAcik(false); return; }
            siralamaBtnRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
              setSiralamaBtnPos({ top: pageY + height + 4, right: Dimensions.get('window').width - pageX - width });
              setSiralamaAcik(true);
            });
          }}>
            <Text style={styles.siralamaBtnText}>
              {siralama === 'tarih_yeni' ? 'En Yeni' : siralama === 'tarih_eski' ? 'En Eski' : siralama === 'fiyat_artan' ? '₺ Artan' : '₺ Azalan'}
            </Text>
            <Text style={styles.siralamaChevron}>{siralamaAcik ? '▲' : '▼'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {(badge > 0 || search) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, paddingBottom: 8 }} contentContainerStyle={styles.etiketler}>
          {search ? (
            <TouchableOpacity style={styles.etiket} onPress={() => setSearch('')}>
              <Text style={styles.etiketText}>🔍 {search} ✕</Text>
            </TouchableOpacity>
          ) : null}
          {(() => {
            const chips: { key: string; label: string; onRemove: () => void }[] = [];
            filtre.filterIl.forEach(il => {
              const ilceler = filtre.filterIlce.filter(ilce => (ILLER[il] ?? []).includes(ilce));
              if (ilceler.length === 0) {
                chips.push({
                  key: `il-${il}`, label: `📍 ${il}`,
                  onRemove: () => setFiltre(f => ({ ...f, filterIl: f.filterIl.filter(x => x !== il), filterIlce: [], filterMahalle: [] })),
                });
                return;
              }
              ilceler.forEach(ilce => {
                const gruplar = getMahalleGruplar(il, ilce);
                const mahallelerInIlce = filtre.filterMahalle.filter(m => gruplar.some(g => g.mahalleler.includes(m)));
                if (mahallelerInIlce.length === 0) {
                  chips.push({
                    key: `ilce-${il}-${ilce}`, label: `📍 ${il} / ${ilce}`,
                    onRemove: () => setFiltre(f => ({ ...f, filterIlce: f.filterIlce.filter(x => x !== ilce), filterMahalle: f.filterMahalle.filter(x => !gruplar.some(g => g.mahalleler.includes(x))) })),
                  });
                } else {
                  mahallelerInIlce.forEach(m => {
                    chips.push({
                      key: `mah-${il}-${ilce}-${m}`, label: `📍 ${il} / ${ilce} / ${m}`,
                      onRemove: () => setFiltre(f => ({ ...f, filterMahalle: f.filterMahalle.filter(x => x !== m) })),
                    });
                  });
                }
              });
            });
            return chips.map(c => (
              <TouchableOpacity key={c.key} style={styles.etiket} onPress={c.onRemove}>
                <Text style={styles.etiketText}>{c.label} ✕</Text>
              </TouchableOpacity>
            ));
          })()}
          {(filtre.fiyatMin || filtre.fiyatMax) ? (
            <TouchableOpacity style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, fiyatMin: '', fiyatMax: '' }))}>
              <Text style={styles.etiketText}>₺ {filtre.fiyatMin || '0'} – {filtre.fiyatMax || '∞'} ✕</Text>
            </TouchableOpacity>
          ) : null}
          {filtre.tip !== 'Tümü' && (
            <TouchableOpacity style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, tip: 'Tümü' }))}>
              <Text style={styles.etiketText}>{filtre.tip} ✕</Text>
            </TouchableOpacity>
          )}
          {filtre.durum !== 'Aktif' && (
            <TouchableOpacity style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, durum: 'Aktif' }))}>
              <Text style={styles.etiketText}>{filtre.durum} ✕</Text>
            </TouchableOpacity>
          )}
          {filtre.musteriGizle !== 'Tümü' && (
            <TouchableOpacity style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, musteriGizle: 'Tümü' }))}>
              <Text style={styles.etiketText}>👁 {filtre.musteriGizle} ✕</Text>
            </TouchableOpacity>
          )}
          {filtre.kategoriler.map(k => (
            <TouchableOpacity key={k} style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, kategoriler: f.kategoriler.filter(x => x !== k) }))}>
              <Text style={styles.etiketText}>{k} ✕</Text>
            </TouchableOpacity>
          ))}
          {filtre.odalar.map(o => (
            <TouchableOpacity key={o} style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, odalar: f.odalar.filter(x => x !== o) }))}>
              <Text style={styles.etiketText}>{o} ✕</Text>
            </TouchableOpacity>
          ))}
          {filtre.binaYaslari.map(b => (
            <TouchableOpacity key={`by-${b}`} style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, binaYaslari: f.binaYaslari.filter(x => x !== b) }))}>
              <Text style={styles.etiketText}>Yaş: {b} ✕</Text>
            </TouchableOpacity>
          ))}
          {filtre.katSayilari.map(k => (
            <TouchableOpacity key={`ks-${k}`} style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, katSayilari: f.katSayilari.filter(x => x !== k) }))}>
              <Text style={styles.etiketText}>Kat Sayısı: {k} ✕</Text>
            </TouchableOpacity>
          ))}
          {filtre.bulunduguKatlar.map(k => (
            <TouchableOpacity key={`bk-${k}`} style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, bulunduguKatlar: f.bulunduguKatlar.filter(x => x !== k) }))}>
              <Text style={styles.etiketText}>Kat: {k} ✕</Text>
            </TouchableOpacity>
          ))}
          {filtre.ozellikler.map(oz => {
            const ad = tumOzellikler.find(t => t.id === oz)?.ad ?? oz;
            return (
              <TouchableOpacity key={oz} style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, ozellikler: f.ozellikler.filter(x => x !== oz) }))}>
                <Text style={styles.etiketText}>✦ {ad} ✕</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.etiketSifirla} onPress={() => { setFiltre(BOS_FILTRE); setSearch(''); }}>
            <Text style={styles.etiketSifirlaText}>Sıfırla</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {gorunum === 'liste' && (
        <>
          <View style={styles.header}>
            <SearchPill style={{ flex: 1 }} />
            <TouchableOpacity style={styles.paylasBtnSmall} onPress={() => setRastgeleModal(true)}>
              <Text style={styles.paylasBtnSmallText}>🎲</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.paylasBtnSmall, secimModu && { backgroundColor: Colors.primary }]} onPress={() => secimModu ? secimKapat() : setSecimModu(true)}>
              <Text style={[styles.paylasBtnSmallText, secimModu && { color: '#fff' }]}>{secimModu ? '✕' : '☑'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.paylasBtnSmall} onPress={() => handleListePaylas('filtre')}>
              <Text style={styles.paylasBtnSmallText}>🔗</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/ilan/ekle')}>
              <Text style={styles.addBtnText}>+ Yeni</Text>
            </TouchableOpacity>
          </View>
          <SonucSatiri />
        </>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : gorunum === 'harita' ? (
        <View style={styles.mapFull}>
          {mapHtml ? (
            <WebView
              ref={mapRef}
              source={{ html: mapHtml }}
              style={{ flex: 1 }}
              onMessage={e => {
                try {
                  const data = JSON.parse(e.nativeEvent.data);
                  if (data.close) { setSeciliIlan(null); setPopupPos(null); return; }
                  const { id, px, py } = data;
                  const bulunan = filtered.find(i => i.id === id);
                  if (bulunan) { setSeciliIlan(bulunan); setPopupPos({ x: px, y: py }); }
                } catch {}
              }}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              mixedContentMode="always"
            />
          ) : (
            <View style={styles.center}>
              <Text style={{ fontSize: 36 }}>🗺️</Text>
              <Text style={{ fontSize: 14, color: Colors.onSurfaceVariant, marginTop: 8 }}>Haritada gösterilecek ilan yok</Text>
            </View>
          )}

          {/* Floating arama çubuğu */}
          <View style={styles.floatingSearchWrap} pointerEvents="box-none">
            <TouchableOpacity style={styles.floatingSearch} onPress={filtreAc} activeOpacity={0.85}>
              <Text style={styles.floatingSearchIcon}>🔍</Text>
              <Text style={[styles.floatingSearchText, !search && badge === 0 && { color: Colors.outlineVariant }]} numberOfLines={1}>
                {search || (badge > 0 ? `${badge} filtre aktif` : 'Ara ve filtrele...')}
              </Text>
              {badge > 0 && (
                <View style={styles.floatingBadge}>
                  <Text style={styles.floatingBadgeText}>{badge}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.floatingYeni, secimModu && { backgroundColor: Colors.primary }]} onPress={() => secimModu ? secimKapat() : setSecimModu(true)}>
              <Text style={[styles.floatingYeniText, secimModu && { color: '#fff' }]}>{secimModu ? '✕' : '☑'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.floatingYeni} onPress={() => router.push('/ilan/ekle')}>
              <Text style={styles.floatingYeniText}>+</Text>
            </TouchableOpacity>
          </View>

          {seciliIlan && popupPos && (() => {
            const POPUP_H = 96;
            const rawTop = popupPos.y - POPUP_H - 18;
            const top = rawTop > 60 ? rawTop : popupPos.y + 18;
            const left = Math.max(8, Math.min(SCREEN_W - POPUP_W - 8, popupPos.x - POPUP_W / 2));
            const popupSecili = seciliIds.has(seciliIlan.id);
            return (
              <TouchableOpacity
                style={[styles.mapPopup, { top, left, width: POPUP_W }, secimModu && popupSecili && { borderWidth: 3, borderColor: Colors.primary }]}
                onPress={() => secimModu ? secimToggle(seciliIlan.id) : router.push(`/ilan/${seciliIlan.id}` as any)}
                activeOpacity={0.92}
              >
                {seciliIlan.fotograflar?.[0] ? (
                  <R2Image source={seciliIlan.fotograflar[0]} style={styles.popupFoto} resizeMode="cover" size="sm" />
                ) : (
                  <View style={[styles.popupFoto, styles.popupFotoPlaceholder]}>
                    <Text style={{ fontSize: 24 }}>🏠</Text>
                  </View>
                )}
                <View style={styles.popupInfo}>
                  <Text style={styles.popupBaslik} numberOfLines={1}>{seciliIlan.baslik}</Text>
                  <Text style={styles.popupKonum} numberOfLines={1}>📍 {seciliIlan.konum}{seciliIlan.ilce ? `, ${seciliIlan.ilce}` : ''}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={styles.popupFiyat}>₺{seciliIlan.fiyat.toLocaleString('tr-TR')}</Text>
                    <View style={styles.popupKategori}><Text style={styles.popupKategoriText}>{seciliIlan.kategori}</Text></View>
                  </View>
                </View>
                {secimModu && (
                  <View style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: popupSecili ? Colors.primary : 'rgba(255,255,255,0.9)', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    {popupSecili && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                  </View>
                )}
                <TouchableOpacity style={styles.popupKapat} onPress={() => { setSeciliIlan(null); setPopupPos(null); }}>
                  <Text style={styles.popupKapatText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })()}
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyText}>Filtrelerinize uygun ilan bulunamadı</Text>
              <TouchableOpacity style={styles.sifirlaBtn} onPress={() => { setFiltre(BOS_FILTRE); setSearch(''); }}>
                <Text style={styles.sifirlaText}>Filtreleri Sıfırla</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filtered.map(ilan => <IlanKart key={ilan.id} ilan={ilan} secimModu={secimModu} secili={seciliIds.has(ilan.id)} onToggle={() => secimToggle(ilan.id)} />)
          )}
        </ScrollView>
      )}

      {/* Liste / Harita Toggle veya Toplu Aksiyon Bar */}
      {secimModu ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: Colors.surfaceContainerLowest, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow }} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingTop: 8, paddingBottom: Spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.onSurface, marginRight: 4 }}>{seciliIds.size} seçili</Text>
          <TouchableOpacity onPress={tumunuSec} style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow, borderRadius: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.onSurface }}>{seciliIds.size === filtered.length ? 'Hiçbiri' : 'Tümü'}</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={!seciliIds.size || topluIslem} onPress={() => setDurumModal(true)} style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow, borderRadius: 8, opacity: seciliIds.size ? 1 : 0.4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.onSurface }}>Durum</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={!seciliIds.size || topluIslem} onPress={() => { setTopluKatSayisi(''); setTopluBulunduguKat(''); setKatModal(true); }} style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow, borderRadius: 8, opacity: seciliIds.size ? 1 : 0.4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.onSurface }}>Kat</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={!seciliIds.size || topluIslem} onPress={() => { setOzellikSecili(new Set()); setOzellikModal('ekle'); }} style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow, borderRadius: 8, opacity: seciliIds.size ? 1 : 0.4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.onSurface }}>+ Özellik</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={!seciliIds.size || topluIslem} onPress={() => { setOzellikSecili(new Set()); setOzellikModal('cikar'); }} style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow, borderRadius: 8, opacity: seciliIds.size ? 1 : 0.4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.onSurface }}>− Özellik</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={!seciliIds.size || topluIslem} onPress={() => handleListePaylas('secim')} style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow, borderRadius: 8, opacity: seciliIds.size ? 1 : 0.4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.onSurface }}>🔗 Paylaş</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={!seciliIds.size || topluIslem} onPress={topluSil} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#E53935', borderRadius: 8, opacity: seciliIds.size ? 1 : 0.4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>🗑 Sil</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={[styles.toggleBar, { paddingBottom: Spacing.sm }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, gorunum === 'liste' && styles.toggleBtnActive]}
            onPress={() => setGorunum('liste')}
          >
            <Text style={[styles.toggleBtnText, gorunum === 'liste' && styles.toggleBtnTextActive]}>☰ Liste</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, gorunum === 'harita' && styles.toggleBtnActive]}
            onPress={() => setGorunum('harita')}
          >
            <Text style={[styles.toggleBtnText, gorunum === 'harita' && styles.toggleBtnTextActive]}>🗺 Harita</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Durum Modal */}
      <Modal visible={durumModal} animationType="fade" transparent onRequestClose={() => setDurumModal(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setDurumModal(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.onSurface, marginBottom: 16 }}>Durum Değiştir ({seciliIds.size} ilan)</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => topluDurum('Aktif')} disabled={topluIslem} style={{ flex: 1, paddingVertical: 14, backgroundColor: 'rgba(58,170,110,0.1)', borderWidth: 1, borderColor: '#3aaa6e', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#3aaa6e' }}>Aktif</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => topluDurum('İptal')} disabled={topluIslem} style={{ flex: 1, paddingVertical: 14, backgroundColor: 'rgba(229,57,53,0.08)', borderWidth: 1, borderColor: '#E53935', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#E53935' }}>İptal</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setDurumModal(false)} style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.outline, borderRadius: 8 }}>
              <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>Vazgeç</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Kat Modal */}
      <Modal visible={katModal} animationType="slide" transparent onRequestClose={() => setKatModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' }}>
            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.onSurface }}>Kat Bilgisi Değiştir ({seciliIds.size} ilan)</Text>
              <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 4 }}>Boş bırakılan alan değiştirilmez. Temizlemek için &quot;Boşalt&quot;.</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.onSurface, marginBottom: 8 }}>Kat Sayısı</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <TouchableOpacity onPress={() => setTopluKatSayisi(topluKatSayisi === '__bos__' ? '' : '__bos__')} style={[styles.chip, topluKatSayisi === '__bos__' && styles.chipActive]}>
                    <Text style={[styles.chipText, topluKatSayisi === '__bos__' && styles.chipTextActive]}>Boşalt</Text>
                  </TouchableOpacity>
                  {KAT_SAYISI_DEGERLERI.map(k => (
                    <TouchableOpacity key={k} onPress={() => setTopluKatSayisi(topluKatSayisi === k ? '' : k)} style={[styles.chip, topluKatSayisi === k && styles.chipActive]}>
                      <Text style={[styles.chipText, topluKatSayisi === k && styles.chipTextActive]}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.onSurface, marginBottom: 8 }}>Bulunduğu Kat</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <TouchableOpacity onPress={() => setTopluBulunduguKat(topluBulunduguKat === '__bos__' ? '' : '__bos__')} style={[styles.chip, topluBulunduguKat === '__bos__' && styles.chipActive]}>
                    <Text style={[styles.chipText, topluBulunduguKat === '__bos__' && styles.chipTextActive]}>Boşalt</Text>
                  </TouchableOpacity>
                  {BULUNDUGU_KAT_DEGERLERI.map(k => (
                    <TouchableOpacity key={k} onPress={() => setTopluBulunduguKat(topluBulunduguKat === k ? '' : k)} style={[styles.chip, topluBulunduguKat === k && styles.chipActive]}>
                      <Text style={[styles.chipText, topluBulunduguKat === k && styles.chipTextActive]}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow }}>
              <TouchableOpacity onPress={() => setKatModal(false)} style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.outline, borderRadius: 8 }}>
                <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '600' }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={topluKatUygula} disabled={(!topluKatSayisi && !topluBulunduguKat) || topluIslem} style={{ flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 8, opacity: (topluKatSayisi || topluBulunduguKat) ? 1 : 0.5 }}>
                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '700' }}>{topluIslem ? 'İşleniyor...' : 'Uygula'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Özellik Modal */}
      <Modal visible={!!ozellikModal} animationType="slide" transparent onRequestClose={() => { setOzellikModal(null); setOzellikSecili(new Set()); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' }}>
            <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.onSurface }}>
                Özellik {ozellikModal === 'ekle' ? 'Ekle' : 'Çıkar'} ({seciliIds.size} ilan)
              </Text>
              <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 4 }}>
                {ozellikModal === 'ekle' ? 'Eklenecek özellikleri seçin' : 'Çıkarılacak özellikleri seçin'}
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {tumOzellikler.map(oz => {
                const sec = ozellikSecili.has(oz.id);
                return (
                  <TouchableOpacity key={oz.id} onPress={() => {
                    setOzellikSecili(prev => {
                      const next = new Set(prev);
                      if (next.has(oz.id)) next.delete(oz.id); else next.add(oz.id);
                      return next;
                    });
                  }} style={[styles.chip, sec && styles.chipActive]}>
                    <Text style={[styles.chipText, sec && styles.chipTextActive]}>{oz.ad}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow }}>
              <TouchableOpacity onPress={() => { setOzellikModal(null); setOzellikSecili(new Set()); }} style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.outline, borderRadius: 8 }}>
                <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '600' }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={topluOzellikUygula} disabled={!ozellikSecili.size || topluIslem} style={{ flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 8, opacity: ozellikSecili.size ? 1 : 0.5 }}>
                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '700' }}>{topluIslem ? 'İşleniyor...' : 'Uygula'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* FİLTRE MODALİ — tek modal, sayfa değiştirme ile il/ilçe seçimi */}
      <Modal visible={filtrePaneli} animationType="slide" transparent onRequestClose={() => {
        if (filterPage !== 'main') setFilterPage('main');
        else setFiltrePaneli(false);
      }}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDimmer} onPress={() => {
            if (filterPage !== 'main') setFilterPage('main');
            else setFiltrePaneli(false);
          }} />
          <View style={styles.modalPanel}>

            {/* SAYFA: ANA FİLTRELER */}
            {filterPage === 'main' && (
              <>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => setFiltrePaneli(false)}>
                    <Text style={styles.modalKapat}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalBaslik}>Ara ve Filtrele</Text>
                  <TouchableOpacity onPress={() => { filtreSifirla(); setSearch(''); }}>
                    <Text style={styles.modalSifirla}>Sıfırla</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm }}>
                  <TextInput
                    style={styles.modalSearchInput}
                    placeholder="Başlık, il, ilçe ara..."
                    placeholderTextColor={Colors.outlineVariant}
                    value={search}
                    onChangeText={setSearch}
                  />
                </View>

                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                    <FilterSection title="İlan Durumu">
                      <View style={styles.chipRow}>
                        {['Tümü', 'Aktif', 'İptal'].map(d => (
                          <TouchableOpacity key={d} style={[styles.chip, gecici.durum === d && styles.chipActive]} onPress={() => setGecici(g => ({ ...g, durum: d }))}>
                            <Text style={[styles.chipText, gecici.durum === d && styles.chipTextActive]}>{d}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </FilterSection>

                    <FilterSection title="Müşteri Görünürlüğü">
                      <View style={styles.chipRow}>
                        {['Tümü', 'Görünür', 'Gizli'].map(g => (
                          <TouchableOpacity key={g} style={[styles.chip, gecici.musteriGizle === g && styles.chipActive]} onPress={() => setGecici(prev => ({ ...prev, musteriGizle: g }))}>
                            <Text style={[styles.chipText, gecici.musteriGizle === g && styles.chipTextActive]}>{g}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </FilterSection>

                    <FilterSection title="Satış Tipi">
                      <View style={styles.chipRow}>
                        {['Tümü', 'Satılık', 'Kiralık'].map(t => (
                          <TouchableOpacity key={t} style={[styles.chip, gecici.tip === t && styles.chipActive]} onPress={() => setGecici(g => ({ ...g, tip: t }))}>
                            <Text style={[styles.chipText, gecici.tip === t && styles.chipTextActive]}>{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </FilterSection>

                    <FilterSection title="Emlak Tipi">
                      <View style={styles.chipRow}>
                        {KATEGORILER.map(k => (
                          <TouchableOpacity key={k}
                            style={[styles.chip, gecici.kategoriler.includes(k) && styles.chipActive, gecici.kategoriler_haric.includes(k) && styles.chipHaric]}
                            onPress={() => toggleKategori(k)} onLongPress={() => toggleKategoriHaric(k)} delayLongPress={500}>
                            <Text style={[styles.chipText, gecici.kategoriler.includes(k) && styles.chipTextActive, gecici.kategoriler_haric.includes(k) && styles.chipHaricText]}>{k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </FilterSection>

                    <FilterSection title="Konum">
                      <View style={{ flexDirection: 'column', gap: 12 }}>
                        {/* İl Kutusu */}
                        <TouchableOpacity
                          style={[styles.konumBox, gecici.filterIl.length > 0 && styles.konumBoxAktif]}
                          onPress={() => { setKonumSearch(''); setFilterPage('il'); }}
                        >
                          <Text style={[styles.konumBoxText, gecici.filterIl.length > 0 && styles.konumBoxTextAktif]} numberOfLines={1}>
                            {gecici.filterIl.length > 0 ? `${gecici.filterIl.length} İl Seçildi` : 'İl Seçin'}
                          </Text>
                          {gecici.filterIl.length > 0
                            ? <TouchableOpacity onPress={() => setGecici(g => ({ ...g, filterIl: [], filterIlce: [], filterMahalle: [] }))} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                                <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                              </TouchableOpacity>
                            : <Text style={styles.konumBoxChevron}>▾</Text>
                          }
                        </TouchableOpacity>

                        {/* İlçe Kutusu */}
                        <TouchableOpacity
                          style={[styles.konumBox, gecici.filterIlce.length > 0 && styles.konumBoxAktif, gecici.filterIl.length === 0 && styles.konumBoxDisabled]}
                          onPress={() => { if (gecici.filterIl.length === 0) return; setKonumSearch(''); setFilterPage('ilce'); }}
                          activeOpacity={gecici.filterIl.length > 0 ? 0.7 : 1}
                        >
                          <Text style={[styles.konumBoxText, gecici.filterIlce.length > 0 && styles.konumBoxTextAktif, gecici.filterIl.length === 0 && { color: Colors.outlineVariant }]} numberOfLines={1}>
                            {gecici.filterIlce.length > 0 ? `${gecici.filterIlce.length} İlçe Seçildi` : 'İlçe Seçin'}
                          </Text>
                          {gecici.filterIlce.length > 0
                            ? <TouchableOpacity onPress={() => setGecici(g => ({ ...g, filterIlce: [], filterMahalle: [] }))} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                                <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                              </TouchableOpacity>
                            : <Text style={[styles.konumBoxChevron, gecici.filterIl.length === 0 && { color: Colors.outlineVariant }]}>▾</Text>
                          }
                        </TouchableOpacity>

                        {/* Mahalle Kutusu */}
                        <TouchableOpacity
                          style={[styles.konumBox, gecici.filterMahalle.length > 0 && styles.konumBoxAktif, gecici.filterIlce.length === 0 && styles.konumBoxDisabled]}
                          onPress={() => { if (gecici.filterIlce.length === 0) return; setKonumSearch(''); setFilterPage('mahalle'); }}
                          activeOpacity={gecici.filterIlce.length > 0 ? 0.7 : 1}
                        >
                          <Text style={[styles.konumBoxText, gecici.filterMahalle.length > 0 && styles.konumBoxTextAktif, gecici.filterIlce.length === 0 && { color: Colors.outlineVariant }]} numberOfLines={1}>
                            {gecici.filterMahalle.length > 0 ? `${gecici.filterMahalle.length} Mahalle Seçildi` : 'Mahalle Seçin'}
                          </Text>
                          {gecici.filterMahalle.length > 0
                            ? <TouchableOpacity onPress={() => setGecici(g => ({ ...g, filterMahalle: [] }))} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                                <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                              </TouchableOpacity>
                            : <Text style={[styles.konumBoxChevron, gecici.filterIlce.length === 0 && { color: Colors.outlineVariant }]}>▾</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </FilterSection>

                    <FilterSection title="Fiyat Aralığı (₺)">
                      <View style={styles.fiyatRow}>
                        <TextInput
                          style={styles.fiyatInput}
                          placeholder="Min"
                          placeholderTextColor={Colors.outlineVariant}
                          value={gecici.fiyatMin}
                          onChangeText={v => setGecici(g => ({ ...g, fiyatMin: formatFiyat(v) }))}
                          keyboardType="numeric"
                        />
                        <Text style={styles.fiyatAyrac}>—</Text>
                        <TextInput
                          style={styles.fiyatInput}
                          placeholder="Max"
                          placeholderTextColor={Colors.outlineVariant}
                          value={gecici.fiyatMax}
                          onChangeText={v => setGecici(g => ({ ...g, fiyatMax: formatFiyat(v) }))}
                          keyboardType="numeric"
                        />
                      </View>
                    </FilterSection>

                    <FilterSection title="Oda Sayısı">
                      <TouchableOpacity
                        style={[styles.konumBox, gecici.odalar.length > 0 && styles.konumBoxAktif]}
                        onPress={() => setFilterPage('oda')}
                      >
                        <Text style={[styles.konumBoxText, gecici.odalar.length > 0 && styles.konumBoxTextAktif]} numberOfLines={1}>
                          {gecici.odalar.length > 0 ? `${gecici.odalar.length} Oda Seçildi` : 'Oda Seçin'}
                        </Text>
                        {gecici.odalar.length > 0
                          ? <TouchableOpacity onPress={() => setGecici(g => ({ ...g, odalar: [] }))} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                              <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                            </TouchableOpacity>
                          : <Text style={styles.konumBoxChevron}>▾</Text>
                        }
                      </TouchableOpacity>
                    </FilterSection>

                    <FilterSection title="Bina Yaşı">
                      <View style={styles.chipRow}>
                        {BINA_YASLARI.map(b => (
                          <TouchableOpacity key={b}
                            style={[styles.chip, gecici.binaYaslari.includes(b) && styles.chipActive, gecici.binaYaslari_haric.includes(b) && styles.chipHaric]}
                            onPress={() => toggleBinaYasi(b)} onLongPress={() => toggleBinaYasiHaric(b)} delayLongPress={500}>
                            <Text style={[styles.chipText, gecici.binaYaslari.includes(b) && styles.chipTextActive, gecici.binaYaslari_haric.includes(b) && styles.chipHaricText]}>{b}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </FilterSection>

                    <FilterSection title="Kat Sayısı">
                      <View style={styles.chipRow}>
                        {KAT_SAYISI_DEGERLERI.map(k => (
                          <TouchableOpacity key={k} style={[styles.chip, gecici.katSayilari.includes(k) && styles.chipActive]}
                            onPress={() => setGecici(g => ({ ...g, katSayilari: g.katSayilari.includes(k) ? g.katSayilari.filter(x => x !== k) : [...g.katSayilari, k] }))}>
                            <Text style={[styles.chipText, gecici.katSayilari.includes(k) && styles.chipTextActive]}>{k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </FilterSection>

                    <FilterSection title="Bulunduğu Kat">
                      <View style={styles.chipRow}>
                        {BULUNDUGU_KAT_DEGERLERI.map(k => (
                          <TouchableOpacity key={k}
                            style={[styles.chip, gecici.bulunduguKatlar.includes(k) && styles.chipActive, gecici.bulunduguKatlar_haric.includes(k) && styles.chipHaric]}
                            onPress={() => toggleBulunduguKat(k)} onLongPress={() => toggleBulunduguKatHaric(k)} delayLongPress={500}>
                            <Text style={[styles.chipText, gecici.bulunduguKatlar.includes(k) && styles.chipTextActive, gecici.bulunduguKatlar_haric.includes(k) && styles.chipHaricText]}>{k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </FilterSection>

                    {tumOzellikler.length > 0 && (
                      <FilterSection title="Özellikler">
                        <View style={styles.chipRow}>
                          {tumOzellikler.map(oz => (
                            <TouchableOpacity key={oz.id}
                              style={[styles.chip, gecici.ozellikler.includes(oz.id) && styles.chipActive, gecici.ozellikler_haric.includes(oz.id) && styles.chipHaric]}
                              onPress={() => toggleOzellik(oz.id)} onLongPress={() => toggleOzellikHaric(oz.id)} delayLongPress={500}>
                              <Text style={[styles.chipText, gecici.ozellikler.includes(oz.id) && styles.chipTextActive, gecici.ozellikler_haric.includes(oz.id) && styles.chipHaricText]}>{oz.ad}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </FilterSection>
                    )}

                  </ScrollView>
                </KeyboardAvoidingView>

                <View style={styles.modalFooter}>
                  <TouchableOpacity style={styles.uygulaBtn} onPress={filtreUygula}>
                    <Text style={styles.uygulaBtnText}>Uygula</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* SAYFA: ODA SEÇİMİ */}
            {filterPage === 'oda' && (
              <>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => setFilterPage('main')}>
                    <Text style={styles.modalKapat}>←</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalBaslik}>Oda Seçin</Text>
                  <TouchableOpacity onPress={() => setFilterPage('main')}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>Tamam</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={ODALAR}
                  keyExtractor={(item) => item}
                  renderItem={({ item: o }) => {
                    const sec = gecici.odalar.includes(o);
                    const expandable = odaIsExpandable(o);
                    const ustuList = expandable ? odaUstuListesi(o) : [];
                    const ustuTumu = expandable && ustuList.length > 1 && ustuList.every(x => gecici.odalar.includes(x));
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant }}>
                        <TouchableOpacity
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, borderRadius: 6, backgroundColor: sec ? Colors.primaryFixed : 'transparent' }}
                          onPress={() => toggleOda(o)}
                        >
                          <View style={[styles.checkbox, sec && styles.checkboxAktif, { marginRight: 10 }]}>
                            {sec && <Text style={styles.checkboxTick}>✓</Text>}
                          </View>
                          <Text style={[styles.modalItemText, sec && { color: Colors.primary, fontWeight: '600' }]}>{o}</Text>
                        </TouchableOpacity>
                        {expandable && ustuList.length > 1 && (
                          <TouchableOpacity
                            onPress={() => toggleOdaUstu(o)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: ustuTumu ? Colors.primary : Colors.outlineVariant, backgroundColor: ustuTumu ? Colors.primary : '#f3f4f6' }}
                          >
                            <Text style={{ fontSize: 10, color: ustuTumu ? '#fff' : Colors.outline }}>↑</Text>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: ustuTumu ? '#fff' : Colors.outline }}>{o} ve üstü</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  }}
                />
              </>
            )}

            {/* SAYFA: 3 KUTU SEÇİMİ */}
            {(filterPage === 'il' || filterPage === 'ilce' || filterPage === 'mahalle') && (
              <>
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
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                  <TextInput style={styles.modalSearch} placeholder="Ara..." placeholderTextColor={Colors.outlineVariant} value={konumSearch} onChangeText={setKonumSearch} />
                  <SectionList
                    sections={konumSections}
                    keyExtractor={(item, i) => `${filterPage}-${item}-${i}`}
                    keyboardShouldPersistTaps="handled"
                    stickySectionHeadersEnabled
                    renderSectionHeader={({ section }: any) => section.showHeader ? (
                      <Text style={styles.listeGrupBaslik}>{section.title}</Text>
                    ) : null}
                    ListEmptyComponent={<Text style={{ padding: 20, fontSize: 13, color: Colors.outline, textAlign: 'center' }}>Sonuç yok</Text>}
                    renderItem={({ item }) => {
                      const val = item;
                      const secili =
                        filterPage === 'il' ? gecici.filterIl.includes(val) :
                        filterPage === 'ilce' ? gecici.filterIlce.includes(val) :
                        gecici.filterMahalle.includes(val);
                      return (
                        <TouchableOpacity
                          style={[styles.modalItem, secili && { backgroundColor: Colors.primaryFixed }]}
                          onPress={() => {
                            if (filterPage === 'il') {
                              setGecici(g => ({
                                ...g,
                                filterIl: secili ? g.filterIl.filter(x => x !== val) : [...g.filterIl, val],
                                filterIlce: [], filterMahalle: []
                              }));
                            } else if (filterPage === 'ilce') {
                              setGecici(g => ({
                                ...g,
                                filterIlce: secili ? g.filterIlce.filter(x => x !== val) : [...g.filterIlce, val],
                                filterMahalle: []
                              }));
                            } else {
                              setGecici(g => ({
                                ...g,
                                filterMahalle: secili ? g.filterMahalle.filter(x => x !== val) : [...g.filterMahalle, val]
                              }));
                            }
                          }}
                        >
                          <View style={[styles.checkbox, secili && styles.checkboxAktif, { marginRight: 10 }]}>
                            {secili && <Text style={styles.checkboxTick}>✓</Text>}
                          </View>
                          <Text style={[styles.modalItemText, secili && { color: Colors.primary, fontWeight: '600' }, { flex: 1 }]}>{val}</Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                </KeyboardAvoidingView>
              </>
            )}

          </View>
        </View>
      </Modal>

      {/* PAYLAŞ MODALİ */}

      {/* PAYLAŞ MODALİ */}
      <Modal visible={paylasModal} animationType="slide" transparent onRequestClose={() => setPaylasModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalDimmer} onPress={() => setPaylasModal(false)} />
            <View style={[styles.modalPanel, { maxHeight: '80%' }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setPaylasModal(false)}>
                  <Text style={styles.modalKapat}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalBaslik}>🔗 Liste Paylaş</Text>
                <View style={{ width: 40 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {!paylasLink ? (
                  <>
                    {/* İlan seçimi */}
                    <View style={{ gap: Spacing.sm }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.filterSectionTitle}>İlanlar ({paylasIlanlar.length - paylasHaric.size} / {paylasIlanlar.length})</Text>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <TouchableOpacity onPress={() => setPaylasHaric(new Set())}>
                            <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>Tümü</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setPaylasHaric(new Set(paylasIlanlar.map(i => i.id)))}>
                            <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant, fontWeight: '600' }}>Hiçbiri</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.surfaceContainerLow, maxHeight: 220 }}>
                        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                          {paylasIlanlar.map(i => {
                            const haric = paylasHaric.has(i.id);
                            return (
                              <TouchableOpacity key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.md, backgroundColor: haric ? Colors.surfaceContainerLow : Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow }}
                                onPress={() => {
                                  setPaylasHaric(prev => {
                                    const next = new Set(prev);
                                    if (next.has(i.id)) next.delete(i.id); else next.add(i.id);
                                    return next;
                                  });
                                }}>
                                <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: haric ? Colors.outline : Colors.primary, backgroundColor: haric ? 'transparent' : Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                                  {!haric && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 14 }}>✓</Text>}
                                </View>
                                {i.fotograflar?.[0] ? (
                                  <R2Image source={i.fotograflar[0]} size="sm" style={{ width: 40, height: 40, borderRadius: 6, opacity: haric ? 0.5 : 1, backgroundColor: Colors.surfaceContainerLow }} />
                                ) : (
                                  <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center', opacity: haric ? 0.5 : 1 }}>
                                    <Text style={{ fontSize: 14 }}>🏠</Text>
                                  </View>
                                )}
                                <View style={{ flex: 1, opacity: haric ? 0.5 : 1 }}>
                                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: Colors.onSurface, textDecorationLine: haric ? 'line-through' : 'none' }}>{i.baslik}</Text>
                                  <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>₺{i.fiyat.toLocaleString('tr-TR')} · {i.tip}{i.ilce ? ` · ${i.ilce}` : ''}</Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    </View>

                    {/* Müşteri seç */}
                    <View style={{ gap: Spacing.sm }}>
                      <Text style={styles.filterSectionTitle}>Müşteri</Text>
                      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                        <TextInput
                          style={[styles.modalSearchInput, { flex: 1 }]}
                          placeholder="İsim ara..."
                          placeholderTextColor={Colors.outlineVariant}
                          value={paylasMusteriAra}
                          onChangeText={t => { setPaylasMusteriAra(t); setPaylasMusteri(''); }}
                        />
                        <TextInput
                          style={[styles.modalSearchInput, { width: 100 }]}
                          placeholder="Etiket..."
                          placeholderTextColor={Colors.outlineVariant}
                          value={paylasEtiketAra}
                          onChangeText={t => { setPaylasEtiketAra(t); setPaylasMusteri(''); }}
                        />
                      </View>
                      {(paylasMusteriAra.length > 0 || paylasEtiketAra.length > 0) && (
                        <View style={{ borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.surfaceContainerLow }}>
                          {paylasMusteriler.filter(m => {
                            const isimUygun = !paylasMusteriAra || `${m.ad}${m.soyad ? ` ${m.soyad}` : ''}`.toLowerCase().includes(paylasMusteriAra.toLowerCase());
                            const etiketUygun = !paylasEtiketAra || (m.etiketler ?? '').toLowerCase().includes(paylasEtiketAra.toLowerCase());
                            return isimUygun && etiketUygun;
                          }).map(m => (
                            <TouchableOpacity key={m.id} style={{ padding: Spacing.md, backgroundColor: paylasMusteri === m.id ? Colors.primaryFixed : Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow }}
                              onPress={() => { setPaylasMusteri(m.id); setPaylasMusteriAra(`${m.ad}${m.soyad ? ` ${m.soyad}` : ''}`); setPaylasEtiketAra(''); }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <Text style={{ fontSize: 14, color: paylasMusteri === m.id ? Colors.primary : Colors.onSurface, fontWeight: paylasMusteri === m.id ? '700' : '400' }}>{m.ad}{m.soyad ? ` ${m.soyad}` : ''}</Text>
                                {m.etiketler ? <Text style={{ fontSize: 10, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: Colors.primaryFixed, color: Colors.primary, fontWeight: '600' }}>{m.etiketler.split(',')[0].trim()}</Text> : null}
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      {paylasMusteri && <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>✓ {paylasMusteriAra} seçildi</Text>}
                    </View>

                    {/* Süre */}
                    <View style={{ gap: Spacing.sm }}>
                      <Text style={styles.filterSectionTitle}>Süre</Text>
                      <View style={styles.chipRow}>
                        {[{s:'1',l:'1 saat'},{s:'24',l:'1 gün'},{s:'72',l:'3 gün'},{s:'168',l:'7 gün'}].map(({s,l}) => (
                          <TouchableOpacity key={s} style={[styles.chip, paylasSaat === s && styles.chipActive]} onPress={() => setPaylasSaat(s)}>
                            <Text style={[styles.chipText, paylasSaat === s && styles.chipTextActive]}>{l}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        style={styles.modalSearchInput}
                        placeholder="Özel saat girin (örn. 48)"
                        placeholderTextColor={Colors.outlineVariant}
                        value={['1','24','72','168'].includes(paylasSaat) ? '' : paylasSaat}
                        onChangeText={v => { const d = v.replace(/\D/g, ''); if (d) setPaylasSaat(d); else setPaylasSaat('168'); }}
                        keyboardType="numeric"
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.uygulaBtn, (!paylasMusteri || paylasYukleniyor || paylasIlanlar.length - paylasHaric.size === 0) && { opacity: 0.5 }]}
                      onPress={handlePaylasOlustur}
                      disabled={!paylasMusteri || paylasYukleniyor || paylasIlanlar.length - paylasHaric.size === 0}
                    >
                      <Text style={styles.uygulaBtnText}>{paylasYukleniyor ? 'Oluşturuluyor...' : 'Link Oluştur'}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '600' }}>✓ Link oluşturuldu</Text>
                    <View style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: Spacing.lg }}>
                      <Text style={{ fontSize: 12, color: Colors.onSurface }}>{paylasLink}</Text>
                    </View>
                    <TouchableOpacity style={[styles.uygulaBtn, kopyalandi && { backgroundColor: '#16a34a' }]}
                      onPress={async () => { await Clipboard.setStringAsync(paylasLink); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000); }}>
                      <Text style={styles.uygulaBtnText}>{kopyalandi ? '✓ Kopyalandı!' : 'Kopyala'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.outline, paddingVertical: 14, alignItems: 'center' }}
                      onPress={() => { setPaylasLink(''); setPaylasMusteri(''); setPaylasMusteriAra(''); }}>
                      <Text style={{ fontSize: 14, color: Colors.onSurfaceVariant }}>Yeni Link Oluştur</Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {siralamaAcik && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setSiralamaAcik(false)} activeOpacity={1} />
          <View style={[styles.siralamaDropdown, { position: 'absolute', top: siralamaBtnPos.top, right: siralamaBtnPos.right, zIndex: 9999 }]}>
            {([
              { key: 'tarih_yeni', label: 'En Yeni' },
              { key: 'tarih_eski', label: 'En Eski' },
              { key: 'fiyat_artan', label: '₺ Artan' },
              { key: 'fiyat_azalan', label: '₺ Azalan' },
            ] as const).map(s => (
              <TouchableOpacity
                key={s.key}
                style={[styles.siralamaItem, siralama === s.key && styles.siralamaItemActive]}
                onPress={() => { setSiralama(s.key); setSiralamaAcik(false); }}
              >
                <Text style={[styles.siralamaItemText, siralama === s.key && styles.siralamaItemTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Rastgele Modal */}
      <Modal visible={rastgeleModal} transparent animationType="fade" onRequestClose={() => setRastgeleModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setRastgeleModal(false)}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: 260, gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.onSurface, marginBottom: 4, textAlign: 'center' }}>🎲 Rastgele İlan</Text>
            {(['Tümü', 'Görünür', 'Görünmez'] as const).map(mod => (
              <TouchableOpacity
                key={mod}
                onPress={() => rastgeleGit(mod)}
                style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: 10, padding: 14, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.onSurface }}>
                  {mod === 'Görünür' ? '👁 Görünür' : mod === 'Görünmez' ? '🚫 Görünmez' : '🎲 Tümü'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function IlanKart({ ilan, secimModu, secili, onToggle }: { ilan: Ilan; secimModu?: boolean; secili?: boolean; onToggle?: () => void }) {
  const ilkFoto = ilan.fotograflar?.[0];
  const iptal = ilan.durum === 'İptal';
  return (
    <TouchableOpacity
      style={[styles.kart, !ilan.musteri_gizle && styles.kartAcik, iptal && styles.kartIptal, secimModu && secili && { borderWidth: 4, borderColor: Colors.primary }]}
      onPress={() => secimModu ? onToggle?.() : router.push(`/ilan/${ilan.id}`)}
    >
      {ilkFoto ? (
        <R2Image source={ilkFoto} style={[styles.image, iptal && styles.imageIptal]} resizeMode="cover" size="sm" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>🏠</Text>
        </View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.22)', 'rgba(0,0,0,0.62)']}
        locations={[0, 0.45, 1]}
        style={styles.gradientOverlay}
      />

      {/* Top badges */}
      <View style={styles.topRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {secimModu && (
            <View style={{ width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: secili ? Colors.primary : '#fff', backgroundColor: secili ? Colors.primary : 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
              {secili && <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>✓</Text>}
            </View>
          )}
          <View style={[styles.tipBadge, { backgroundColor: ilan.tip === 'Satılık' ? 'rgba(0,35,111,0.85)' : 'rgba(253,118,26,0.85)' }]}>
            <Text style={styles.tipBadgeText}>{ilan.tip}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {ilan.musteri_gizle && (
            <View style={styles.gizliBadge}>
              <Text style={styles.gizliBadgeText}>👁 Gizli</Text>
            </View>
          )}
          {iptal && (
            <View style={styles.iptalBadge}>
              <Text style={styles.iptalBadgeText}>İPTAL</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom overlay content */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop}>
          <Text style={styles.overlayFiyat}>₺{ilan.fiyat.toLocaleString('tr-TR')}</Text>
        </View>
        <Text style={styles.overlayBaslik} numberOfLines={1}>{ilan.baslik}</Text>
        <View style={styles.overlayMeta}>
          <Text style={styles.overlayKonum} numberOfLines={1}>📍 {ilan.konum}{ilan.ilce ? `, ${ilan.ilce}` : ''}</Text>
          <View style={styles.overlaySpecs}>
            {ilan.metrekare && <Text style={styles.overlaySpec}>{ilan.metrekare} m²</Text>}
            {ilan.oda_sayisi && <Text style={styles.overlaySpec}>{ilan.oda_sayisi}</Text>}
            <Text style={styles.overlaySpec}>{ilan.kategori}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md, paddingBottom: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  title: { fontSize: 24, fontWeight: '700', color: Colors.onSurface },
  subtitle: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  addBtn: { backgroundColor: Colors.secondaryContainer, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  paylasBtnSmall: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  paylasBtnSmallText: { fontSize: 18 },

  searchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchPillIcon: { fontSize: 14 },
  searchPillText: { flex: 1, fontSize: 13, color: Colors.onSurface },
  modalSearchInput: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 11,
    fontSize: 14, color: Colors.onSurface,
  },
  badge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: Colors.primary, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  tabsWrapper: { flexShrink: 0, marginBottom: Spacing.sm },
  tabs: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, alignItems: 'center', paddingVertical: 6 },
  tab: { borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow },
  tabActive: { backgroundColor: Colors.primaryFixed },
  tabText: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },
  tabIptal: { backgroundColor: '#fee2e2' },
  tabIptalText: { color: '#991b1b', fontWeight: '600' },

  etiketler: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xs, gap: 6, flexDirection: 'row', alignItems: 'flex-start' },
  etiket: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: Colors.primaryFixed },
  etiketText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  etiketSifirla: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: Colors.surfaceContainerLow },
  etiketSifirlaText: { fontSize: 11, color: Colors.onSurfaceVariant, fontWeight: '500' },

  mapFull: { flex: 1 },

  floatingSearchWrap: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 10 },
  floatingSearch: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 11, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  floatingSearchIcon: { fontSize: 15 },
  floatingSearchText: { flex: 1, fontSize: 14, color: Colors.onSurface },
  floatingBadge: { backgroundColor: Colors.primary, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  floatingBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  floatingYeni: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
  floatingYeniText: { color: '#fff', fontSize: 24, fontWeight: '300', lineHeight: 28 },

  aramaModalContainer: { flex: 1, backgroundColor: Colors.surface },
  aramaModalSearchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  aramaModalSearch: { flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },
  aramaModalKapat: { fontSize: 15, fontWeight: '600', color: Colors.primary, paddingHorizontal: 4 },
  aramaModalFiltreSatir: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  aramaModalFiltreBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  aramaModalFiltreBtnText: { fontSize: 14, color: Colors.onSurface, fontWeight: '500' },
  aramaModalSifirla: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  aramaModalSonuc: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  mapPopup: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: Radius.xl,
    flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  popupFoto: { width: 88, height: 88 },
  popupFotoPlaceholder: { backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  popupInfo: { flex: 1, padding: Spacing.md },
  popupBaslik: { fontSize: 13, fontWeight: '700', color: Colors.onSurface },
  popupKonum: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2 },
  popupFiyat: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  popupKategori: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  popupKategoriText: { fontSize: 10, color: Colors.primary, fontWeight: '600' },
  popupKapat: { padding: Spacing.md },
  popupKapatText: { fontSize: 16, color: Colors.onSurfaceVariant },
  sonucRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.xl, marginBottom: 2, marginTop: -2 },
  sonucSayisi: { fontSize: 12, color: Colors.onSurfaceVariant, flex: 1 },
  siralamaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: Colors.outline, backgroundColor: Colors.surface },
  siralamaBtnText: { fontSize: 12, color: Colors.onSurface, fontWeight: '500' },
  siralamaChevron: { fontSize: 9, color: Colors.onSurfaceVariant },
  siralamaDropdown: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.outline, minWidth: 110, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 8 },
  siralamaItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  siralamaItemActive: { backgroundColor: Colors.primaryFixed },
  siralamaItemText: { fontSize: 13, color: Colors.onSurface },
  siralamaItemTextActive: { color: Colors.primary, fontWeight: '700' },
  toggleBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceContainerLow,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 9, borderRadius: Radius.full,
    alignItems: 'center', backgroundColor: Colors.surfaceContainerLow,
  },
  toggleBtnActive: { backgroundColor: Colors.primary },
  toggleBtnText: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  toggleBtnTextActive: { color: '#fff' },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 15, color: Colors.onSurfaceVariant, textAlign: 'center' },
  sifirlaBtn: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  sifirlaText: { color: Colors.primary, fontWeight: '600' },

  // 3 Kutulu Konum Filtresi
  konumBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  konumBoxAktif: { backgroundColor: Colors.primaryFixed, borderWidth: 1, borderColor: Colors.primary },
  konumBoxDisabled: { opacity: 0.6 },
  konumBoxText: { fontSize: 13, color: Colors.onSurfaceVariant, flex: 1 },
  konumBoxTextAktif: { color: Colors.primary, fontWeight: '600' },
  konumBoxSil: { fontSize: 12, color: Colors.primary, paddingLeft: 4 },
  konumBoxChevron: { fontSize: 16, color: Colors.onSurfaceVariant },

  modalItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  modalItemText: { fontSize: 15, color: Colors.onSurface },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center' },
  checkboxAktif: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick: { fontSize: 14, color: '#fff', fontWeight: '700' },

  listeGrupBaslik: {
    fontSize: 12, fontWeight: '700', color: Colors.primary,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: 4,
    backgroundColor: Colors.primaryFixed,
  },

  kart: {
    height: 240, borderRadius: Radius.xxl, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
  kartIptal: { opacity: 0.65 },
  kartAcik: { borderWidth: 4, borderColor: '#3aaa6e' },
  image: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  imageIptal: { opacity: 0.6 },
  imagePlaceholder: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  imagePlaceholderText: { fontSize: 56 },

  gradientOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 110 },

  topRow: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tipBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  tipBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  iptalBadge: { backgroundColor: 'rgba(153,27,27,0.85)', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  iptalBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  gizliBadge: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  gizliBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, paddingBottom: 16 },
  overlayTop: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 2 },
  overlayFiyat: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  overlayBaslik: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.92)', marginBottom: 6 },
  overlayMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overlayKonum: { fontSize: 11, color: 'rgba(255,255,255,0.75)', flex: 1, marginRight: 8 },
  overlaySpecs: { flexDirection: 'row', gap: 6 },
  overlaySpec: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },

  // Filtre Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalDimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalPanel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '88%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  modalKapat: { fontSize: 18, color: Colors.onSurface, width: 40 },
  modalBaslik: { fontSize: 17, fontWeight: '700', color: Colors.onSurface },
  modalSifirla: { fontSize: 14, color: Colors.primary, fontWeight: '600', width: 60, textAlign: 'right' },
  modalScroll: { padding: Spacing.xl, gap: Spacing.xl, paddingBottom: 8 },
  modalFooter: { padding: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow },
  uygulaBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingVertical: 16, alignItems: 'center' },
  uygulaBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  filterSection: { gap: Spacing.md },
  filterSectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.onSurface, letterSpacing: 0.5 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow },
  chipActive: { backgroundColor: Colors.primary },
  chipHaric: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#ef4444' },
  chipText: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  chipHaricText: { color: '#dc2626', fontWeight: '600', textDecorationLine: 'line-through' },

  secimBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
  },
  secimBtnText: { fontSize: 15, color: Colors.onSurface },
  placeholder: { color: Colors.outlineVariant },
  secimOk: { fontSize: 18, color: Colors.onSurfaceVariant },
  temizle: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: Spacing.sm, textAlign: 'right' },
  konumChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primaryFixed, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, marginBottom: 6 },
  konumChipText: { fontSize: 14, color: Colors.primary, flex: 1 },
  konumChipSil: { fontSize: 14, color: Colors.primary, paddingLeft: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center' },
  checkboxAktif: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '700' },
  listeNav: { fontSize: 22, color: Colors.onSurfaceVariant, paddingHorizontal: Spacing.md },

  fiyatRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fiyatInput: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12,
    fontSize: 14, color: Colors.onSurface,
  },
  fiyatAyrac: { fontSize: 16, color: Colors.onSurfaceVariant },

  modalSearch: {
    backgroundColor: Colors.surfaceContainerLow, margin: Spacing.lg, marginTop: 0,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10,
    fontSize: 14, color: Colors.onSurface,
  },
  listeItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  listeItemText: { fontSize: 15, color: Colors.onSurface },
  listeCheck: { fontSize: 16, color: Colors.primary },
});
