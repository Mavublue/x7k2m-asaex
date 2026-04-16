import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Image, ActivityIndicator, Modal, FlatList,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const POPUP_W = 290;
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import R2Image from '../../components/R2Image';
import { Ilan } from '../../types';
import { TURKIYE, IL_LISTESI, MAHALLELER } from '../../constants/turkiye';

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
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(map);
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

const ODALAR = ['Stüdyo', '1+0', '1+1', '2+1', '3+1', '3+2', '4+1', '4+2', '5+1', '5+2', '6+1', '7+'];
const KATEGORILER = ['Daire', 'Villa', 'Arsa', 'İşyeri', 'Müstakil Ev', 'Rezidans'];

type FiltreState = {
  tip: string;
  durum: string;
  kategoriler: string[];
  filterIl: string[];
  filterIlce: string[];
  filterMahalle: string[];
  fiyatMin: string;
  fiyatMax: string;
  odalar: string[];
  ozellikler: string[];
};

const BOS_FILTRE: FiltreState = {
  tip: 'Tümü', durum: 'Aktif',
  kategoriler: [], filterIl: [], filterIlce: [], filterMahalle: [],
  fiyatMin: '', fiyatMax: '', odalar: [], ozellikler: [],
};

function aktifFiltreSayisi(f: FiltreState) {
  let n = 0;
  if (f.tip !== 'Tümü') n++;
  if (f.durum !== 'Aktif') n++;
  if (f.kategoriler.length) n++;
  if (f.filterIl.length || f.filterIlce.length || f.filterMahalle.length) n++;
  if (f.fiyatMin || f.fiyatMax) n++;
  if (f.odalar.length) n++;
  if (f.ozellikler.length) n++;
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
  const mapRef = useRef<WebView>(null);
  const [filtrePaneli, setFiltrePaneli] = useState(false);
  const [filtre, setFiltre] = useState<FiltreState>(BOS_FILTRE);
  const [gecici, setGecici] = useState<FiltreState>(BOS_FILTRE);
  const [filterPage, setFilterPage] = useState<'main' | 'il' | 'ilce' | 'mahalle'>('main');
  const [konumSearch, setKonumSearch] = useState('');
  const [tumOzellikler, setTumOzellikler] = useState<{id: string; ad: string}[]>([]);
  const [siralama, setSiralama] = useState<'tarih_yeni' | 'tarih_eski' | 'fiyat_artan' | 'fiyat_azalan'>('tarih_yeni');
  const [siralamaAcik, setSiralamaAcik] = useState(false);
  const siralamaBtnRef = useRef<View>(null);
  const [siralamaBtnPos, setSiralamaBtnPos] = useState({ top: 0, right: 0 });
  const [profilSlug, setProfilSlug] = useState('');
  const [linkKopyalandi, setLinkKopyalandi] = useState(false);
  const [paylasModal, setPaylasModal] = useState(false);
  const [paylasMusteriler, setPaylasMusteriler] = useState<{id:string;ad:string;soyad:string;etiketler:string|null}[]>([]);
  const [paylasMusteri, setPaylasMusteri] = useState('');
  const [paylasMusteriAra, setPaylasMusteriAra] = useState('');
  const [paylasSure, setPaylasSure] = useState('24');
  const [paylasYukleniyor, setPaylasYukleniyor] = useState(false);
  const [paylasLink, setPaylasLink] = useState('');
  const [paylasEtiketAra, setPaylasEtiketAra] = useState('');

  let filteredBoxList: any[] = [];
  if (filterPage === 'il') {
    filteredBoxList = ILLER_LISTESI
      .filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()))
      .map(i => ({ type: 'item', label: i, key: i }));
  } else if (filterPage === 'ilce') {
    gecici.filterIl.forEach(il => {
      const ilceler = (ILLER[il] ?? []).filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()));
      if (ilceler.length > 0) {
        filteredBoxList.push({ type: 'header', label: il });
        ilceler.sort((a,b) => a.localeCompare(b,'tr')).forEach(ilce => {
          filteredBoxList.push({ type: 'item', label: ilce, key: ilce });
        });
      }
    });
  } else if (filterPage === 'mahalle') {
    gecici.filterIl.forEach(il => {
      gecici.filterIlce.forEach(ilce => {
        if ((ILLER[il] ?? []).includes(ilce)) {
          const mahalleler = (((MAHALLELER as any)[il]?.[ilce] ?? []) as string[])
            .filter(m => m.toLowerCase().includes(konumSearch.toLowerCase()));
          if (mahalleler.length > 0) {
            filteredBoxList.push({ type: 'header', label: `${il} - ${ilce}` });
            mahalleler.sort((a,b) => a.localeCompare(b,'tr')).forEach(mah => {
              filteredBoxList.push({ type: 'item', label: mah, key: mah });
            });
          }
        }
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

  async function fetchIlanlar() {
    const { data } = await supabase.from('ilanlar').select('*').order('olusturma_tarihi', { ascending: false });
    if (data) setIlanlar(data);
    setLoading(false);
  }

  function uygula(f: FiltreState) {
    let r = ilanlar;
    if (f.tip !== 'Tümü') r = r.filter(i => i.tip === f.tip);
    if (f.durum === 'Aktif') r = r.filter(i => !i.durum || i.durum === 'Aktif');
    if (f.durum === 'İptal') r = r.filter(i => i.durum === 'İptal');
    if (f.kategoriler.length) r = r.filter(i => f.kategoriler.includes(i.kategori));
    if (f.filterIl.length || f.filterIlce.length || f.filterMahalle.length) {
      r = r.filter(ilan => {
        if (f.filterIl.length > 0 && !f.filterIl.includes(ilan.konum)) return false;
        if (f.filterIlce.length > 0 && (!ilan.ilce || !f.filterIlce.includes(ilan.ilce))) return false;
        if (f.filterMahalle.length > 0 && !f.filterMahalle.some(m => (ilan.mahalle ?? '').toLowerCase().includes(m.toLowerCase()))) return false;
        return true;
      });
    }
    if (f.fiyatMin) r = r.filter(i => i.fiyat >= parseInt(f.fiyatMin.replace(/\./g, '')));
    if (f.fiyatMax) r = r.filter(i => i.fiyat <= parseInt(f.fiyatMax.replace(/\./g, '')));
    if (f.odalar.length) r = r.filter(i => i.oda_sayisi && f.odalar.includes(i.oda_sayisi));
    if (f.ozellikler.length) r = r.filter(i => {
      const ilanOz = ((i as any).ozellikler ?? '').split(',').filter(Boolean);
      return f.ozellikler.every(o => ilanOz.includes(o));
    });
    if (search) r = r.filter(i =>
      i.baslik.toLowerCase().includes(search.toLowerCase()) ||
      i.konum.toLowerCase().includes(search.toLowerCase()) ||
      (i.ilce ?? '').toLowerCase().includes(search.toLowerCase())
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
      kategoriler: g.kategoriler.includes(k)
        ? g.kategoriler.filter(x => x !== k)
        : [...g.kategoriler, k],
    }));
  }

  function toggleOda(o: string) {
    setGecici(g => ({
      ...g,
      odalar: g.odalar.includes(o)
        ? g.odalar.filter(x => x !== o)
        : [...g.odalar, o],
    }));
  }

  function toggleOzellik(o: string) {
    setGecici(g => ({
      ...g,
      ozellikler: g.ozellikler.includes(o) ? g.ozellikler.filter(x => x !== o) : [...g.ozellikler, o],
    }));
  }

  function filtreAc() { setGecici(filtre); setFilterPage('main'); setFiltrePaneli(true); }
  function filtreUygula() { setFiltre(gecici); setFiltrePaneli(false); }
  function filtreSifirla() { setGecici(BOS_FILTRE); }

  function paylasAc() {
    setPaylasModal(true);
    setPaylasLink('');
    setPaylasMusteri('');
    setPaylasMusteriAra('');
    setPaylasEtiketAra('');
    setPaylasSure('24');
    setLinkKopyalandi(false);
    supabase.from('musteriler').select('id,ad,soyad,etiketler').eq('durum','Aktif').order('ad')
      .then(({ data }) => { if (data) setPaylasMusteriler(data); });
  }

  async function paylasOlustur() {
    if (!paylasMusteri) { Alert.alert('Hata', 'Lütfen müşteri seçin.'); return; }
    setPaylasYukleniyor(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPaylasYukleniyor(false); return; }

    const ilanIds = filtered.map(i => i.id);
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    const token = Array.from(arr).map(b => b.toString(36)).join('').slice(0, 8);

    const filtreler = [];
    if (filtre.tip !== 'Tümü') filtreler.push(filtre.tip);
    if (filtre.kategoriler.length) filtreler.push(filtre.kategoriler.join(', '));
    if (filtre.odalar.length) filtreler.push(filtre.odalar.join(', '));
    const baslik = filtreler.length ? filtreler.join(' · ') : 'Tüm Aktif İlanlar';

    const expiresAt = new Date(Date.now() + parseInt(paylasSure) * 60 * 60 * 1000).toISOString();
    const { data: mevcutMt } = await supabase.from('musteri_tokenler')
      .select('token').eq('user_id', user.id).eq('musteri_id', paylasMusteri).single();
    let musteriToken = mevcutMt?.token ?? null;
    if (mevcutMt) {
      await supabase.from('musteri_tokenler').update({ expires_at: expiresAt }).eq('user_id', user.id).eq('musteri_id', paylasMusteri);
    } else {
      const arr2 = new Uint8Array(12);
      crypto.getRandomValues(arr2);
      musteriToken = Array.from(arr2).map(b => b.toString(36).padStart(2,'0')).join('').slice(0,16);
      await supabase.from('musteri_tokenler').insert({ token: musteriToken, user_id: user.id, musteri_id: paylasMusteri, expires_at: expiresAt });
    }

    const { error } = await supabase.from('paylasim_paketleri').insert({
      token, emlakci_id: user.id, ilan_ids: ilanIds, baslik,
      ...(musteriToken ? { musteri_token: musteriToken } : {}),
    });
    if (error) { Alert.alert('Hata', error.message); setPaylasYukleniyor(false); return; }

    const link = `${process.env.EXPO_PUBLIC_WEB_URL}/ozel-ilanlar/${token}`;
    setPaylasLink(link);
    setPaylasYukleniyor(false);
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
        <TouchableOpacity
          style={styles.paylasBtn}
          onPress={paylasAc}
        >
          <Text style={styles.paylasBtnText}>🔗 Paylaş</Text>
        </TouchableOpacity>
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
          {filtre.filterIl.map((il, i) => (
            <TouchableOpacity key={`il-${i}`} style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, filterIl: f.filterIl.filter(x => x !== il) }))}>
              <Text style={styles.etiketText}>📍 {il} ✕</Text>
            </TouchableOpacity>
          ))}
          {filtre.filterIlce.map((ilce, i) => (
            <TouchableOpacity key={`ilce-${i}`} style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, filterIlce: f.filterIlce.filter(x => x !== ilce) }))}>
              <Text style={styles.etiketText}>📍 {ilce} ✕</Text>
            </TouchableOpacity>
          ))}
          {filtre.filterMahalle.map((mah, i) => (
            <TouchableOpacity key={`mah-${i}`} style={styles.etiket} onPress={() => setFiltre(f => ({ ...f, filterMahalle: f.filterMahalle.filter(x => x !== mah) }))}>
              <Text style={styles.etiketText}>📍 {mah} ✕</Text>
            </TouchableOpacity>
          ))}
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
                  const { id, px, py } = JSON.parse(e.nativeEvent.data);
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
            <TouchableOpacity style={styles.floatingYeni} onPress={() => router.push('/ilan/ekle')}>
              <Text style={styles.floatingYeniText}>+</Text>
            </TouchableOpacity>
          </View>

          {seciliIlan && popupPos && (() => {
            const POPUP_H = 96;
            const rawTop = popupPos.y - POPUP_H - 18;
            const top = rawTop > 60 ? rawTop : popupPos.y + 18;
            const left = Math.max(8, Math.min(SCREEN_W - POPUP_W - 8, popupPos.x - POPUP_W / 2));
            return (
              <TouchableOpacity
                style={[styles.mapPopup, { top, left, width: POPUP_W }]}
                onPress={() => router.push(`/ilan/${seciliIlan.id}` as any)}
                activeOpacity={0.92}
              >
                {seciliIlan.fotograflar?.[0] ? (
                  <R2Image source={seciliIlan.fotograflar[0]} style={styles.popupFoto} resizeMode="cover" size="cover" />
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
                <TouchableOpacity style={styles.popupKapat} onPress={() => { setSeciliIlan(null); setPopupPos(null); }}>
                  <Text style={styles.popupKapatText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })()}
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyText}>Filtrelerinize uygun ilan bulunamadı</Text>
              <TouchableOpacity style={styles.sifirlaBtn} onPress={() => { setFiltre(BOS_FILTRE); setSearch(''); }}>
                <Text style={styles.sifirlaText}>Filtreleri Sıfırla</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filtered.map(ilan => <IlanKart key={ilan.id} ilan={ilan} />)
          )}
        </ScrollView>
      )}

      {/* Liste / Harita Toggle */}
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
                  <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                    <FilterSection title="İlan Durumu">
                      <View style={styles.chipRow}>
                        {['Aktif', 'İptal'].map(d => (
                          <TouchableOpacity key={d} style={[styles.chip, gecici.durum === d && styles.chipActive]} onPress={() => setGecici(g => ({ ...g, durum: d }))}>
                            <Text style={[styles.chipText, gecici.durum === d && styles.chipTextActive]}>{d}</Text>
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
                          <TouchableOpacity key={k} style={[styles.chip, gecici.kategoriler.includes(k) && styles.chipActive]} onPress={() => toggleKategori(k)}>
                            <Text style={[styles.chipText, gecici.kategoriler.includes(k) && styles.chipTextActive]}>{k}</Text>
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
                      <View style={styles.chipRow}>
                        {ODALAR.map(o => (
                          <TouchableOpacity key={o} style={[styles.chip, gecici.odalar.includes(o) && styles.chipActive]} onPress={() => toggleOda(o)}>
                            <Text style={[styles.chipText, gecici.odalar.includes(o) && styles.chipTextActive]}>{o}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </FilterSection>

                    {tumOzellikler.length > 0 && (
                      <FilterSection title="Özellikler">
                        <View style={styles.chipRow}>
                          {tumOzellikler.map(oz => (
                            <TouchableOpacity key={oz.id} style={[styles.chip, gecici.ozellikler.includes(oz.ad) && styles.chipActive]} onPress={() => toggleOzellik(oz.ad)}>
                              <Text style={[styles.chipText, gecici.ozellikler.includes(oz.ad) && styles.chipTextActive]}>{oz.ad}</Text>
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

            {/* SAYFA: 3 KUTU SEÇİMİ */}
            {filterPage !== 'main' && (
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
                  <FlatList
                    data={filteredBoxList}
                  keyExtractor={(item, i) => `${filterPage}-${i}-${item.type === 'item' ? item.key : item.label}`}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    if (item.type === 'header') {
                      return <Text style={styles.listeGrupBaslik}>{item.label}</Text>;
                    }
                    const val = item.key;
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
      <Modal visible={paylasModal} animationType="slide" transparent onRequestClose={() => { setPaylasModal(false); setPaylasLink(''); }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => { setPaylasModal(false); setPaylasLink(''); }} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '85%' }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.onSurface }}>🔗 Liste Paylaş</Text>
                <TouchableOpacity onPress={() => { setPaylasModal(false); setPaylasLink(''); }}>
                  <Text style={{ fontSize: 22, color: Colors.onSurfaceVariant }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
                {!paylasLink ? (
                  <>
                    {/* İlan sayısı */}
                    <View style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>{filtered.length} ilan paylaşılacak</Text>
                    </View>

                    {/* Müşteri ara */}
                    <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Müşteri *</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                      <TextInput
                        style={{ flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: Colors.onSurface }}
                        placeholder="İsim ara..."
                        placeholderTextColor={Colors.outlineVariant}
                        value={paylasMusteriAra}
                        onChangeText={v => { setPaylasMusteriAra(v); setPaylasMusteri(''); }}
                      />
                      <TextInput
                        style={{ flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: Colors.onSurface }}
                        placeholder="Etiket ara..."
                        placeholderTextColor={Colors.outlineVariant}
                        value={paylasEtiketAra}
                        onChangeText={v => { setPaylasEtiketAra(v); setPaylasMusteri(''); }}
                      />
                    </View>
                    {(paylasMusteriAra.length > 0 || paylasEtiketAra.length > 0) && (
                      <View style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceContainerLow, borderRadius: 10, maxHeight: 180, marginBottom: 8, overflow: 'hidden' }}>
                        {paylasMusteriler
                          .filter(m => {
                            const isimOk = paylasMusteriAra === '' || `${m.ad} ${m.soyad}`.toLowerCase().includes(paylasMusteriAra.toLowerCase());
                            const etiketOk = paylasEtiketAra === '' || (m.etiketler ?? '').toLowerCase().includes(paylasEtiketAra.toLowerCase());
                            return isimOk && etiketOk;
                          })
                          .map(m => (
                            <TouchableOpacity key={m.id}
                              onPress={() => { setPaylasMusteri(m.id); setPaylasMusteriAra(`${m.ad} ${m.soyad}`); setPaylasEtiketAra(''); }}
                              style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow, backgroundColor: paylasMusteri === m.id ? Colors.primaryFixed : Colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                            >
                              <Text style={{ fontSize: 14, color: paylasMusteri === m.id ? Colors.primary : Colors.onSurface, fontWeight: paylasMusteri === m.id ? '700' : '400' }}>{m.ad} {m.soyad}</Text>
                              {m.etiketler ? (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', flex: 1 }}>
                                  {m.etiketler.split(',').map(e => e.trim()).filter(Boolean).map(e => (
                                    <View key={e} style={{ backgroundColor: Colors.primaryFixed, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 }}>
                                      <Text style={{ fontSize: 10, color: Colors.primary, fontWeight: '600' }}>{e}</Text>
                                    </View>
                                  ))}
                                </View>
                              ) : null}
                            </TouchableOpacity>
                          ))}
                      </View>
                    )}
                    {paylasMusteri && (
                      <Text style={{ fontSize: 12, color: '#3aaa6e', fontWeight: '600', marginBottom: 12 }}>
                        ✓ {paylasMusteriler.find(m=>m.id===paylasMusteri)?.ad} {paylasMusteriler.find(m=>m.id===paylasMusteri)?.soyad} seçildi
                      </Text>
                    )}

                    {/* Süre */}
                    <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ne kadar aktif olsun?</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                      {([['1','1 saat'],['24','1 gün'],['72','3 gün'],['168','7 gün']] as const).map(([val, label]) => (
                        <TouchableOpacity key={val} onPress={() => setPaylasSure(val)}
                          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1.5,
                            borderColor: paylasSure === val ? Colors.primary : Colors.outline,
                            backgroundColor: paylasSure === val ? Colors.primaryFixed : Colors.surface }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: paylasSure === val ? Colors.primary : Colors.onSurfaceVariant }}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity
                      onPress={paylasOlustur}
                      disabled={paylasYukleniyor || !paylasMusteri}
                      style={{ backgroundColor: paylasMusteri ? Colors.primary : Colors.outline, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: paylasYukleniyor ? 0.6 : 1 }}
                    >
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{paylasYukleniyor ? 'Oluşturuluyor...' : 'Link Oluştur'}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600', marginBottom: 16 }}>✓ Link oluşturuldu</Text>
                    <View style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <Text style={{ fontSize: 12, color: Colors.onSurface, lineHeight: 18 }} selectable>{paylasLink}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={async () => {
                        await Clipboard.setStringAsync(paylasLink);
                        setLinkKopyalandi(true);
                        setTimeout(() => setLinkKopyalandi(false), 2000);
                      }}
                      style={{ backgroundColor: linkKopyalandi ? '#3aaa6e' : Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10 }}
                    >
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{linkKopyalandi ? '✓ Kopyalandı!' : 'Kopyala'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setPaylasLink(''); setPaylasMusteri(''); setPaylasMusteriAra(''); }}
                      style={{ borderWidth: 1, borderColor: Colors.outline, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, color: Colors.onSurfaceVariant }}>Yeni Link Oluştur</Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
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

function IlanKart({ ilan }: { ilan: Ilan }) {
  const ilkFoto = ilan.fotograflar?.[0];
  const iptal = ilan.durum === 'İptal';
  return (
    <TouchableOpacity style={[styles.kart, iptal && styles.kartIptal]} onPress={() => router.push(`/ilan/${ilan.id}`)}>
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
        <View style={[styles.tipBadge, { backgroundColor: ilan.tip === 'Satılık' ? 'rgba(0,35,111,0.85)' : 'rgba(253,118,26,0.85)' }]}>
          <Text style={styles.tipBadgeText}>{ilan.tip}</Text>
        </View>
        {iptal && (
          <View style={styles.iptalBadge}>
            <Text style={styles.iptalBadgeText}>İPTAL</Text>
          </View>
        )}
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
  paylasBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: Colors.outline, backgroundColor: Colors.surface },
  paylasBtnAktif: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  paylasBtnText: { fontSize: 12, color: Colors.onSurface, fontWeight: '500' },
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
  chipText: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

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
