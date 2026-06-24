import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator, Alert,
  FlatList, Dimensions, Linking, Modal, TextInput, Platform, KeyboardAvoidingView, Keyboard, Animated,
} from 'react-native';
import { PanGestureHandler, PinchGestureHandler, TapGestureHandler, State } from 'react-native-gesture-handler';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { deleteIlanPhotos, copyIlanFiles } from '../../lib/r2';
import { setDownloadProgress } from '../../lib/downloadProgress';
import { renderSosyalMetin, type SosyalProfil } from '../../lib/sosyalMedya';

const R2_BASE = process.env.EXPO_PUBLIC_R2_PUBLIC_URL!;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase';
import { cacheGet, cacheSet } from '../../lib/cache';
import { Colors, Radius, Spacing } from '../../constants/theme';
import R2Image from '../../components/R2Image';
import SatildiAfisModal from '../../components/SatildiAfisModal';
import KolajModal from '../../components/KolajModal';
import PersistentTabBar from '../../components/PersistentTabBar';
import { Ilan } from '../../types';

function ZoomableImage({ uri, onZoomChange }: { uri: string; onZoomChange: (z: boolean) => void }) {
  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const doubleTapRef = useRef(null);

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);
  const lastScale = useRef(1);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [zoomed, setZoomed] = useState(false);

  const setZoom = (z: boolean) => { setZoomed(z); onZoomChange(z); };

  const reset = () => {
    lastScale.current = 1;
    pinchScale.setValue(1);
    pan.flattenOffset();
    Animated.parallel([
      Animated.spring(baseScale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
    ]).start();
    setZoom(false);
  };

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  const onPinchState = (e: any) => {
    if (e.nativeEvent.state === State.ACTIVE) onZoomChange(true);
    if (e.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= e.nativeEvent.scale;
      pinchScale.setValue(1);
      if (lastScale.current < 1.05) {
        reset();
      } else {
        if (lastScale.current > 4) lastScale.current = 4;
        baseScale.setValue(lastScale.current);
        setZoom(true);
      }
    }
  };

  const onPanEvent = Animated.event([{ nativeEvent: { translationX: pan.x, translationY: pan.y } }], { useNativeDriver: true });
  const onPanState = (e: any) => {
    if (e.nativeEvent.oldState === State.ACTIVE) pan.extractOffset();
  };

  const onDoubleTap = (e: any) => {
    if (e.nativeEvent.state === State.ACTIVE) {
      if (zoomed) {
        reset();
      } else {
        lastScale.current = 2.5;
        Animated.spring(baseScale, { toValue: 2.5, useNativeDriver: true }).start();
        setZoom(true);
      }
    }
  };

  return (
    <TapGestureHandler ref={doubleTapRef} numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
      <Animated.View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
        <PinchGestureHandler ref={pinchRef} simultaneousHandlers={panRef} onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchState}>
          <Animated.View style={{ flex: 1, width: '100%' }}>
            <PanGestureHandler ref={panRef} enabled={zoomed} simultaneousHandlers={pinchRef} minPointers={1} maxPointers={2} onGestureEvent={onPanEvent} onHandlerStateChange={onPanState}>
              <Animated.View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] }}>
                <R2Image source={uri} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.75 }} resizeMode="contain" />
              </Animated.View>
            </PanGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      </Animated.View>
    </TapGestureHandler>
  );
}

function FullscreenGaleri({ fotos, initialIdx, onClose, listRef, thumbRef }: {
  fotos: string[]; initialIdx: number; onClose: () => void;
  listRef: React.RefObject<FlatList<string> | null>;
  thumbRef: React.RefObject<ScrollView | null>;
}) {
  const [idx, setIdx] = useState(initialIdx);
  const [zoomed, setZoomed] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;
  const THUMB_W = 64 + 6;

  useEffect(() => {
    setIdx(initialIdx);
    translateY.setValue(0);
  }, [initialIdx]);

  useEffect(() => {
    const targetX = idx * THUMB_W - (SCREEN_WIDTH / 2 - 32);
    thumbRef.current?.scrollTo({ x: Math.max(0, targetX), animated: true });
  }, [idx]);

  const onPanEvent = Animated.event([{ nativeEvent: { translationY: translateY } }], { useNativeDriver: true });
  const onPanStateChange = (e: any) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      const dy = e.nativeEvent.translationY;
      const vy = e.nativeEvent.velocityY;
      if (dy > 120 || vy > 800) {
        Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 180, useNativeDriver: true }).start(onClose);
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      }
    }
  };

  const handleZoom = (z: boolean) => {
    setZoomed(z);
    if (z) translateY.setValue(0);
  };

  const bgOpacity = translateY.interpolate({ inputRange: [0, SCREEN_HEIGHT], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#000', opacity: bgOpacity }} />
      <PanGestureHandler enabled={!zoomed} maxPointers={1} onGestureEvent={onPanEvent} onHandlerStateChange={onPanStateChange} activeOffsetY={15} failOffsetX={[-20, 20]}>
        <Animated.View style={{ flex: 1, transform: [{ translateY }] }}>
          <TouchableOpacity style={{ position: 'absolute', top: 48, right: 20, zIndex: 10, padding: 8 }} onPress={onClose}>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>✕</Text>
          </TouchableOpacity>
          <View style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center', zIndex: 5 }}>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 }}>{idx + 1} / {fotos.length}</Text>
          </View>
          <FlatList
            ref={listRef}
            data={fotos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={initialIdx}
            scrollEnabled={!zoomed}
            getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
            keyExtractor={(_, i) => i.toString()}
            onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
            renderItem={({ item }) => (
              <ZoomableImage uri={item} onZoomChange={handleZoom} />
            )}
          />
          <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, height: 72, backgroundColor: 'rgba(0,0,0,0.35)', paddingVertical: 6 }}>
            <ScrollView ref={thumbRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center', gap: 6 }}>
              {fotos.map((f, i) => (
                <TouchableOpacity key={i} onPress={() => { setIdx(i); listRef.current?.scrollToIndex({ index: i, animated: false }); }}
                  style={{ width: 64, height: 56, borderRadius: 6, overflow: 'hidden', borderWidth: 2, borderColor: i === idx ? '#fff' : 'transparent', opacity: i === idx ? 1 : 0.55 }}>
                  <R2Image source={f} style={{ width: '100%', height: '100%' }} resizeMode="cover" size="sm" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

function buildDetayMapHtml(lat: number, lng: number, emoji: string = '🏠') {
  return `<!DOCTYPE html><html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}body,#map{width:100vw;height:100vh;overflow:hidden}.leaflet-control-attribution{font-size:8px}</style>
</head>
<body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true,maxZoom:18}).setView([${lat},${lng}],14);
var osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OSM'});var esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,attribution:'© Esri'});esri.addTo(map);L.control.layers({'Uydu':esri,'Sokak':osm},null,{position:'topright'}).addTo(map);
var icon=L.divIcon({html:'<div style="font-size:30px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">${emoji}</div>',className:'',iconSize:[32,32],iconAnchor:[16,28]});
L.marker([${lat},${lng}],{icon:icon}).addTo(map);
</script></body></html>`;
}

export default function IlanDetayScreen() {
  const { id, paylas: paylasMusteriId } = useLocalSearchParams<{ id: string; paylas?: string }>();
  const [ilan, setIlan] = useState<Ilan | null>(null);
  const [loading, setLoading] = useState(true);
  const [aktifFoto, setAktifFoto] = useState(0);
  const [aciklamaTab, setAciklamaTab] = useState<'not' | 'musteri'>('not');
  const [telefon, setTelefon] = useState('');
  const [eslesModal, setEslesModal] = useState(false);
  const [musteriler, setMusteriler] = useState<any[]>([]);
  const [musteriSearch, setMusteriSearch] = useState('');
  const [eslesYukleniyor, setEslesYukleniyor] = useState(false);
  const [menuModal, setMenuModal] = useState(false);
  const [otomatikModal, setOtomatikModal] = useState(false);
  const [linkModal, setLinkModal] = useState(false);
  const [linkSaat, setLinkSaat] = useState('24');
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkYukleniyor, setLinkYukleniyor] = useState(false);
  const [linkKopyalandi, setLinkKopyalandi] = useState(false);
  const [linkMusteriler, setLinkMusteriler] = useState<any[]>([]);
  const [linkMusteriAra, setLinkMusteriAra] = useState('');
  const [linkEtiketAra, setLinkEtiketAra] = useState('');
  const [linkSeciliMusteri, setLinkSeciliMusteri] = useState<string>('');
  const [linkEtiket, setLinkEtiket] = useState('');
  const flatListRef = useRef<any>(null);
  const thumbScrollRef = useRef<ScrollView>(null);
  const [fullscreenIdx, setFullscreenIdx] = useState<number | null>(null);
  const fullscreenListRef = useRef<FlatList<string>>(null);
  const fullscreenThumbRef = useRef<ScrollView>(null);
  const [otomatikMusteriler, setOtomatikMusteriler] = useState<any[]>([]);
  const [sosyalModal, setSosyalModal] = useState(false);
  const [sosyalMetin, setSosyalMetin] = useState('');
  const [sosyalKaydediliyor, setSosyalKaydediliyor] = useState(false);
  const [sosyalKopyalandi, setSosyalKopyalandi] = useState(false);
  const [cogaltiyor, setCogaltiyor] = useState(false);
  const [sosyalProfil, setSosyalProfil] = useState<SosyalProfil | null>(null);
  const [ozellikAdlari, setOzellikAdlari] = useState<string[]>([]);
  const [satildiModal, setSatildiModal] = useState(false);
  const [kolajModal, setKolajModal] = useState(false);

  const fetchIlan = useCallback(() => {
    cacheGet<Ilan>(`ilan_${id}`).then(cached => {
      if (cached) { setIlan(cached); setLoading(false); }
    });
    supabase.from('ilanlar').select('*').eq('id', id).single().then(({ data }) => {
      if (data) { setIlan(data); cacheSet(`ilan_${id}`, data); }
      setLoading(false);
    });
    supabase.from('ilan_ozellikler')
      .select('ozellikler(ad)')
      .eq('ilan_id', id)
      .then(({ data }) => {
        if (data) setOzellikAdlari(data.map((r: any) => r.ozellikler?.ad).filter(Boolean));
      });
  }, [id]);

  useEffect(() => {
    const THUMB_CELL = 56 + 8;
    const targetX = aktifFoto * THUMB_CELL - (SCREEN_WIDTH / 2 - 28);
    thumbScrollRef.current?.scrollTo({ x: Math.max(0, targetX), animated: true });
  }, [aktifFoto]);

  useEffect(() => {
    if (paylasMusteriId) linkModalAc(paylasMusteriId);
  }, [paylasMusteriId]);

  useEffect(() => {
    fetchIlan();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiller').select('ad, soyad, telefon, sosyal_medya_sablonu').eq('id', user.id).single().then(({ data }) => {
          if (data) {
            if (data.telefon) setTelefon(data.telefon);
            setSosyalProfil(data as SosyalProfil);
          }
        });
      }
    });
  }, [id]);
  useFocusEffect(fetchIlan);

  function generateSosyalMetin(i: typeof ilan): string {
    if (!i) return '';
    return renderSosyalMetin(i, ozellikAdlari, sosyalProfil);
  }

  async function handleCogalt() {
    if (!ilan) return;
    setMenuModal(false);
    setCogaltiyor(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setCogaltiyor(false); return; }
    const newId = crypto.randomUUID();
    const { baslik, tip, kategori, fiyat, konum, ilce, mahalle, metrekare, brut_metrekare,
      oda_sayisi, banyo_sayisi, bina_yasi, kat_sayisi, bulundugu_kat, aciklama,
      musteri_aciklamasi, musteri_gizle, fotograflar, gizli_fotograflar,
      lat, lng, musteri_lat, musteri_lng, durum } = ilan;
    const [{ data: profil }, { data: tumIlanlar }] = await Promise.all([
      supabase.from('profiller').select('portfoy_prefix').eq('id', session.user.id).single(),
      supabase.from('ilanlar').select('portfoy_no').eq('user_id', session.user.id),
    ]);
    const prefix = ((profil as any)?.portfoy_prefix ?? '').toUpperCase();
    const nums = new Set((tumIlanlar ?? []).map((i: any) => parseInt((i.portfoy_no ?? '').replace(/\D/g, ''), 10)).filter((n: number) => n > 0));
    let n = 1000; while (nums.has(n)) n++;
    const portfoy_no = prefix ? `${prefix}-${n}` : String(n);
    let yeniFotograflar = fotograflar ?? [];
    let yeniGizliFotograflar = gizli_fotograflar ?? [];
    if (yeniFotograflar.length) {
      try {
        const kopyalar = await copyIlanFiles(id as string, newId, yeniFotograflar);
        const eskiYeni = new Map(yeniFotograflar.map((k: string, i: number) => [k, kopyalar[i]]));
        yeniGizliFotograflar = (yeniGizliFotograflar ?? []).map((k: string) => eskiYeni.get(k) ?? k);
        yeniFotograflar = kopyalar;
      } catch (e) {
        console.error('R2 kopyalama hatası:', e);
        Alert.alert('Hata', 'Fotoğraflar kopyalanamadı, çoğaltma iptal edildi. Tekrar deneyin.');
        setCogaltiyor(false);
        return;
      }
    }
    const { error } = await supabase.from('ilanlar').insert({
      id: newId, user_id: session.user.id, portfoy_no,
      baslik, tip, kategori, fiyat, konum, ilce, mahalle, metrekare, brut_metrekare,
      oda_sayisi, banyo_sayisi, bina_yasi, kat_sayisi, bulundugu_kat, aciklama,
      musteri_aciklamasi, musteri_gizle, fotograflar: yeniFotograflar, gizli_fotograflar: yeniGizliFotograflar,
      lat, lng, musteri_lat, musteri_lng, durum,
    });
    if (error) { Alert.alert('Hata', error.message); setCogaltiyor(false); return; }
    const { data: ozellikler } = await supabase.from('ilan_ozellikler').select('ozellik_id').eq('ilan_id', id);
    if (ozellikler?.length) {
      await supabase.from('ilan_ozellikler').insert(ozellikler.map(o => ({ ilan_id: newId, ozellik_id: o.ozellik_id })));
    }
    setCogaltiyor(false);
    router.push(`/ilan/duzenle/${newId}` as any);
  }

  function sosyalModalAc() {
    setMenuModal(false);
    const otomatik = generateSosyalMetin(ilan);
    setSosyalMetin(ilan?.sosyal_medya_metni ?? otomatik);
    setSosyalModal(true);
  }

  async function sosyalKaydet() {
    const otomatik = generateSosyalMetin(ilan);
    setSosyalKaydediliyor(true);
    const deger = sosyalMetin.trim() === otomatik.trim() ? null : sosyalMetin;
    await supabase.from('ilanlar').update({ sosyal_medya_metni: deger }).eq('id', id);
    if (ilan) setIlan({ ...ilan, sosyal_medya_metni: deger });
    setSosyalKaydediliyor(false);
    setSosyalModal(false);
  }

  async function sosyalKopyala() {
    await Clipboard.setStringAsync(sosyalMetin);
    setSosyalKopyalandi(true);
    setTimeout(() => setSosyalKopyalandi(false), 2000);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!ilan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><Text>İlan bulunamadı</Text></View>
      </SafeAreaView>
    );
  }

  async function fotografIndir(key: string, index: number) {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Fotoğraf kaydetmek için galeri iznine ihtiyaç var.');
      return;
    }
    try {
      const dotIdx = key.lastIndexOf('.');
      const lgKey = key.slice(0, dotIdx) + '_lg.jpg';
      const url = `${R2_BASE}/${lgKey}`;
      setDownloadProgress({ current: 1, total: 1 });
      const localUri = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory) + `ilan_${id}_${index + 1}.jpg`;
      const result = await FileSystem.downloadAsync(url, localUri);
      if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
      await MediaLibrary.saveToLibraryAsync(result.uri);
      setDownloadProgress(null);
      Alert.alert('İndirildi', `Fotoğraf ${index + 1} galeriye kaydedildi.`);
    } catch (e: any) {
      setDownloadProgress(null);
      Alert.alert('Hata', e?.message ?? 'Fotoğraf indirilemedi.');
    }
  }

  async function tumFotograflariIndir() {
    const fotograflar = ilan?.fotograflar ?? [];
    if (fotograflar.length === 0) return;
    setMenuModal(false);
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Fotoğraf kaydetmek için galeri iznine ihtiyaç var.');
      return;
    }
    let basarili = 0;
    let ilkHata = '';
    setDownloadProgress({ current: 0, total: fotograflar.length });
    for (let i = 0; i < fotograflar.length; i++) {
      try {
        const dotIdx = fotograflar[i].lastIndexOf('.');
        const lgKey = fotograflar[i].slice(0, dotIdx) + '_lg.jpg';
        const url = `${R2_BASE}/${lgKey}`;
        const localUri = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory) + `ilan_${id}_${i + 1}.jpg`;
        const result = await FileSystem.downloadAsync(url, localUri);
        if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
        await MediaLibrary.saveToLibraryAsync(result.uri);
        basarili++;
      } catch (e: any) {
        if (!ilkHata) ilkHata = e?.message ?? String(e);
      }
      setDownloadProgress({ current: i + 1, total: fotograflar.length });
    }
    setDownloadProgress(null);
    Alert.alert('Tamamlandı', `${basarili}/${fotograflar.length} fotoğraf kaydedildi.${ilkHata ? `\n\nHata: ${ilkHata}` : ''}`);
  }

  function eslesenMi(m: any): boolean {
    if (!m.butce_min && !m.butce_max && !m.tercih_tip && !m.tercih_konum) return false;
    const fiyat = Number(ilan!.fiyat);
    if (m.butce_min != null && fiyat < Number(m.butce_min)) return false;
    if (m.butce_max != null && fiyat > Number(m.butce_max)) return false;
    if (m.tercih_tip) {
      const tipler = m.tercih_tip.split(',').map((t: string) => t.trim());
      if (tipler.length > 0) {
        const ilanCats = (ilan!.kategori ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
        if (!ilanCats.some((c: string) => tipler.includes(c))) return false;
      }
    }
    if (m.tercih_konum) {
      const konumlar = m.tercih_konum.split(/\s*\|\s*/).map((s: string) => s.trim()).filter(Boolean);
      const eslesti = konumlar.some((konum: string) => {
        const [il, ilce, mah] = konum.split(' / ').map((p: string) => p.trim());
        if (mah) {
          if (il && ilan!.konum?.toLowerCase() !== il.toLowerCase()) return false;
          if (ilce && ilan!.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
          if (!ilan!.mahalle?.toLowerCase().includes(mah.toLowerCase())) return false;
          return true;
        }
        if (ilce) {
          if (il && ilan!.konum?.toLowerCase() !== il.toLowerCase()) return false;
          if (ilan!.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
          return true;
        }
        if (il) return ilan!.konum?.toLowerCase() === il.toLowerCase();
        return false;
      });
      if (!eslesti) return false;
    }
    return true;
  }

  async function linkModalAc(presetMusteriId?: string) {
    setLinkSeciliMusteri(presetMusteriId ?? '');
    setLinkMusteriAra('');
    setLinkEtiketAra('');
    setLinkEtiket('');
    setLinkUrl(null);
    setLinkSaat('24');
    const { data } = await supabase.from('musteriler').select('id, ad, soyad, telefon, durum, etiketler, musteri_iletisim(ad, telefon, tip), musteri_istekler(butce_min, butce_max)').eq('durum', 'Aktif').order('ad');
    if (data) {
      setLinkMusteriler(data as any);
      if (presetMusteriId) {
        const m = (data as any[]).find(x => x.id === presetMusteriId);
        if (m) setLinkMusteriAra(`${m.ad ?? ''} ${m.soyad ?? ''}`.trim());
      }
    }
    setLinkModal(true);
  }

  async function linkOlustur() {
    if (!linkSeciliMusteri) { Alert.alert('Hata', 'Lütfen bir müşteri seçin.'); return; }
    const saatSayisi = parseInt(linkSaat);
    if (!saatSayisi || saatSayisi < 1 || saatSayisi > 168) {
      Alert.alert('Hata', 'Geçerli bir saat girin (1-168).');
      return;
    }
    setLinkYukleniyor(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLinkYukleniyor(false); return; }

    const [{ data: ilanData }, { data: profilData }] = await Promise.all([
      supabase.from('ilanlar').select('slug').eq('id', id).single(),
      supabase.from('profiller').select('slug').eq('id', session.user.id).single(),
    ]);

    const expiresAt = new Date(Date.now() + saatSayisi * 60 * 60 * 1000).toISOString();
    let token: string;
    const genel = (linkMusteriler.find((m: any) => m.id === linkSeciliMusteri)?.ad ?? '').trim().toLowerCase() === 'genel';

    if (genel) {
      // Genel: tek-ilan paylaşımı da bağımsız bir paket olsun ki Paylaşımlar
      // listesinde ayrı satır + süre uzat/iptal + cihaz takibi olsun.
      token = Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join('');
      const paketToken = Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join('');
      const { error } = await supabase.from('paylasim_paketleri').insert({
        token: paketToken, baslik: linkEtiket.trim() || null, ilan_ids: [id],
        emlakci_id: session.user.id, musteri_id: linkSeciliMusteri, musteri_token: token, expires_at: expiresAt,
      });
      if (error) { Alert.alert('Hata', error.message); setLinkYukleniyor(false); return; }
    } else {
      const { data: mevcutToken } = await supabase
        .from('musteri_tokenler')
        .select('token')
        .eq('user_id', session.user.id)
        .eq('musteri_id', linkSeciliMusteri)
        .single();

      if (mevcutToken) {
        token = mevcutToken.token;
        await supabase.from('musteri_tokenler')
          .update({ expires_at: expiresAt })
          .eq('user_id', session.user.id)
          .eq('musteri_id', linkSeciliMusteri);
      } else {
        token = Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join('');
        const { error } = await supabase.from('musteri_tokenler').insert({
          token,
          user_id: session.user.id,
          musteri_id: linkSeciliMusteri,
          expires_at: expiresAt,
        });
        if (error) { Alert.alert('Hata', error.message); setLinkYukleniyor(false); return; }
      }
    }

    await supabase.from('musteri_paylasim_gecmisi').insert({
      user_id: session.user.id, musteri_id: linkSeciliMusteri, ilan_id: id,
    });

    setLinkUrl(`${process.env.EXPO_PUBLIC_WEB_URL}/${profilData?.slug}/${ilanData?.slug}?t=${token}`);
    setLinkYukleniyor(false);
  }

  async function linkKopyala() {
    if (!linkUrl) return;
    await Clipboard.setStringAsync(linkUrl);
    setLinkKopyalandi(true);
    setTimeout(() => setLinkKopyalandi(false), 2000);
  }

  async function otomatikEslesAc() {
    setMenuModal(false);
    const { data } = await supabase.from('musteriler').select('id, ad, soyad, telefon, durum, etiketler, butce_min, butce_max, tercih_tip, tercih_konum').order('ad');
    setOtomatikMusteriler((data ?? []).filter(m => eslesenMi(m)));
    setOtomatikModal(true);
  }

  async function eslesModalAc() {
    setMusteriSearch('');
    setEslesModal(true);
    const { data } = await supabase.from('musteriler').select('id, ad, soyad, telefon, durum, etiketler, butce_min, butce_max, tercih_tip, tercih_konum').order('ad');
    if (data) setMusteriler(data);
  }

  async function handleEsles(musteriId: string, musteriAd: string) {
    setEslesYukleniyor(true);
    const { error } = await supabase.from('eslesmeler').insert({
      musteri_id: musteriId,
      ilan_id: id,
      durum: 'Yeni',
    });
    setEslesYukleniyor(false);
    setEslesModal(false);
    if (error) {
      Alert.alert('Hata', error.message);
    } else {
      Alert.alert('Eşleşme Oluşturuldu', `${musteriAd} ile eşleştirildi.`);
    }
  }

  const fotograflar = ilan.fotograflar ?? [];

  const detaylar = [
    { label: 'Portföy No', deger: ilan.portfoy_no },
    { label: 'Tip', deger: ilan.tip },
    { label: 'Kategori', deger: ilan.kategori },
    { label: 'Oda Sayısı', deger: ilan.oda_sayisi },
    { label: 'Banyo Sayısı', deger: (ilan as any).banyo_sayisi ?? null },
    { label: 'Metrekare', deger: ilan.metrekare ? `${ilan.metrekare} m²` : null },
    { label: 'Kat Sayısı', deger: (ilan as any).kat_sayisi ?? null },
    { label: 'Bulunduğu Kat', deger: (ilan as any).bulundugu_kat ?? null },
    { label: 'Konum', deger: ilan.konum },
    { label: 'İlçe', deger: ilan.ilce },
  ].filter(d => d.deger);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{ilan.baslik}</Text>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuModal(true)}>
          <Text style={styles.menuBtnText}>⋯</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Fotoğraf Galerisi */}
        <View style={styles.galeriContainer}>
          {fotograflar.length > 0 ? (
            <>
              <FlatList
                ref={flatListRef}
                data={fotograflar}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => i.toString()}
                getItemLayout={(_, index) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * index,
                  index,
                })}
                onMomentumScrollEnd={e => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  setAktifFoto(index);
                }}
                renderItem={({ item }) => {
                  const gizli = (ilan.gizli_fotograflar ?? []).includes(item);
                  return (
                    <TouchableOpacity activeOpacity={0.95} onPress={() => setFullscreenIdx(aktifFoto)}>
                      <R2Image source={item} style={styles.anaFoto} resizeMode="cover" />
                      {gizli && (
                        <View style={styles.gizliBadge}>
                          <Text style={styles.gizliBadgeText}>🚫 Müşteriye gizli</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
              {fotograflar.length > 1 && (
                <View style={styles.thumbRowWrap}>
                  <ScrollView ref={thumbScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                    {fotograflar.map((f, i) => {
                      const gizli = (ilan.gizli_fotograflar ?? []).includes(f);
                      return (
                      <TouchableOpacity key={i} onPress={() => {
                          setAktifFoto(i);
                          flatListRef.current?.scrollToIndex({ index: i, animated: true });
                        }} onLongPress={() => fotografIndir(f, i)}>
                        <View>
                          <R2Image source={f} style={[styles.thumb, aktifFoto === i && styles.thumbAktif]} resizeMode="cover" size="sm" />
                          {gizli && (
                            <View style={styles.thumbGizli}>
                              <Text style={styles.thumbGizliText}>🚫</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </>
          ) : (
            <View style={[styles.anaFoto, styles.fotoPlaceholder]}>
              <Text style={styles.fotoPlaceholderEmoji}>🏠</Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          {/* Fiyat & Başlık */}
          <View style={styles.fiyatSection}>
            <Text style={styles.fiyat}>₺{ilan.fiyat.toLocaleString('tr-TR')}</Text>
            <View style={[styles.tipBadge, { backgroundColor: ilan.tip === 'Satılık' ? Colors.primary : Colors.secondaryContainer }]}>
              <Text style={styles.tipBadgeText}>{ilan.tip}</Text>
            </View>
          </View>
          <Text style={styles.baslik}>{ilan.baslik}</Text>
          <Text style={styles.konum}>📍 {[ilan.konum, ilan.ilce, ilan.mahalle].filter(Boolean).join(', ')}</Text>

          {/* Özellikler Grid */}
          <View style={styles.ozelliklerGrid}>
            {ilan.metrekare && (
              <View style={styles.ozellikKart}>
                <Text style={styles.ozellikEmoji}>📐</Text>
                <Text style={styles.ozellikDeger}>{ilan.metrekare}</Text>
                <Text style={styles.ozellikLabel}>Net m²</Text>
              </View>
            )}
            {ilan.brut_metrekare && (
              <View style={styles.ozellikKart}>
                <Text style={styles.ozellikEmoji}>📐</Text>
                <Text style={styles.ozellikDeger}>{ilan.brut_metrekare}</Text>
                <Text style={styles.ozellikLabel}>Brüt m²</Text>
              </View>
            )}
            {ilan.oda_sayisi && (
              <View style={styles.ozellikKart}>
                <Text style={styles.ozellikEmoji}>🚪</Text>
                <Text style={styles.ozellikDeger}>{ilan.oda_sayisi}</Text>
                <Text style={styles.ozellikLabel}>Oda</Text>
              </View>
            )}
            {(ilan as any).banyo_sayisi && (
              <View style={styles.ozellikKart}>
                <Text style={styles.ozellikEmoji}>🛁</Text>
                <Text style={styles.ozellikDeger}>{(ilan as any).banyo_sayisi}</Text>
                <Text style={styles.ozellikLabel}>Banyo</Text>
              </View>
            )}
            <View style={styles.ozellikKart}>
              <Text style={styles.ozellikEmoji}>🏷️</Text>
              <Text style={styles.ozellikDeger}>{ilan.kategori}</Text>
              <Text style={styles.ozellikLabel}>Tip</Text>
            </View>
          </View>

          {/* Açıklama */}
          {(ilan.aciklama || ilan.musteri_aciklamasi) && (
            <View style={styles.section}>
              <View style={styles.aciklamaTabRow}>
                <TouchableOpacity
                  style={[styles.aciklamaTab, aciklamaTab === 'not' && styles.aciklamaTabAktif]}
                  onPress={() => setAciklamaTab('not')}
                >
                  <Text style={[styles.aciklamaTabText, aciklamaTab === 'not' && styles.aciklamaTabTextAktif]}>Notlarım</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.aciklamaTab, aciklamaTab === 'musteri' && styles.aciklamaTabAktif]}
                  onPress={() => setAciklamaTab('musteri')}
                >
                  <Text style={[styles.aciklamaTabText, aciklamaTab === 'musteri' && styles.aciklamaTabTextAktif]}>Müşteriye</Text>
                </TouchableOpacity>
              </View>
              {aciklamaTab === 'not' ? (
                ilan.aciklama
                  ? <Text style={styles.aciklama}>{ilan.aciklama}</Text>
                  : <Text style={styles.aciklamaYok}>Not eklenmemiş</Text>
              ) : (
                ilan.musteri_aciklamasi
                  ? <Text style={styles.aciklama}>{ilan.musteri_aciklamasi}</Text>
                  : <Text style={styles.aciklamaYok}>Müşteri açıklaması eklenmemiş</Text>
              )}
            </View>
          )}

          {/* Detaylar */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detaylar</Text>
            {detaylar.map((d, i) => (
              <View key={i} style={[styles.detayRow, i < detaylar.length - 1 && styles.detayBorder]}>
                <Text style={styles.detayLabel}>{d.label}</Text>
                <Text style={styles.detayDeger}>{d.deger}</Text>
              </View>
            ))}
          </View>

          {/* Harita - Birebir Konum (Emlakçı) */}
          {ilan.lat && ilan.lng ? (
            <View style={styles.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Birebir Konum</Text>
                <TouchableOpacity
                  style={styles.haritaBtn}
                  onPress={() => {
                    const label = encodeURIComponent([ilan.konum, ilan.ilce].filter(Boolean).join(', '));
                    const url = Platform.OS === 'ios'
                      ? `maps:0,0?q=${label}@${ilan.lat},${ilan.lng}`
                      : `geo:${ilan.lat},${ilan.lng}?q=${ilan.lat},${ilan.lng}(${label})`;
                    Linking.openURL(url).catch(() =>
                      Linking.openURL(`https://www.google.com/maps?q=${ilan.lat},${ilan.lng}`)
                    );
                  }}
                >
                  <Text style={styles.haritaBtnText}>🗺 Haritada Aç</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant, marginBottom: Spacing.md }}>Emlakçı konumu — müşteriye gösterilmez</Text>
              <View style={styles.mapBox}>
                <WebView
                  source={{ html: buildDetayMapHtml(ilan.lat, ilan.lng, '🏠') }}
                  style={styles.mapView}
                  javaScriptEnabled
                  domStorageEnabled
                  originWhitelist={['*']}
                  mixedContentMode="always"
                  scrollEnabled
                />
              </View>
            </View>
          ) : null}

          {/* Harita - Müşteri Konumu */}
          {ilan.musteri_lat && ilan.musteri_lng ? (
            <View style={styles.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Müşteri Konumu</Text>
                <TouchableOpacity
                  style={styles.haritaBtn}
                  onPress={() => {
                    const label = encodeURIComponent([ilan.konum, ilan.ilce].filter(Boolean).join(', '));
                    const url = Platform.OS === 'ios'
                      ? `maps:0,0?q=${label}@${ilan.musteri_lat},${ilan.musteri_lng}`
                      : `geo:${ilan.musteri_lat},${ilan.musteri_lng}?q=${ilan.musteri_lat},${ilan.musteri_lng}(${label})`;
                    Linking.openURL(url).catch(() =>
                      Linking.openURL(`https://www.google.com/maps?q=${ilan.musteri_lat},${ilan.musteri_lng}`)
                    );
                  }}
                >
                  <Text style={styles.haritaBtnText}>🗺 Haritada Aç</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant, marginBottom: Spacing.md }}>Müşteriye gösterilen tahmini konum</Text>
              <View style={styles.mapBox}>
                <WebView
                  source={{ html: buildDetayMapHtml(ilan.musteri_lat, ilan.musteri_lng, '📍') }}
                  style={styles.mapView}
                  javaScriptEnabled
                  domStorageEnabled
                  originWhitelist={['*']}
                  mixedContentMode="always"
                  scrollEnabled
                />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Alt Butonlar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.iletisimBtn} onPress={() => {
          if (telefon) {
            Linking.openURL(`tel:${telefon}`);
          } else {
            Alert.alert('Telefon Yok', 'Profil bilgilerinizde telefon numarası kayıtlı değil.');
          }
        }}>
          <Text style={styles.iletisimText}>📞 İletişim</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.eslesBtn} onPress={eslesModalAc}>
          <Text style={styles.eslesBtnText}>🤝 Müşteri Eşleştir</Text>
        </TouchableOpacity>
      </View>

      {/* Müşteri Eşleştir Modalı */}
      <Modal visible={eslesModal} animationType="slide" transparent onRequestClose={() => setEslesModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalDimmer} onPress={() => { Keyboard.dismiss(); setEslesModal(false); }} />
          <View style={styles.modalPanel}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEslesModal(false)}>
                <Text style={styles.modalKapat}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalBaslik}>Müşteri Seç</Text>
              <View style={{ width: 32 }} />
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="Müşteri ara..."
              placeholderTextColor={Colors.outlineVariant}
              value={musteriSearch}
              onChangeText={setMusteriSearch}
            />
            <FlatList
              data={musteriler.filter(m => {
                const q = musteriSearch.toLowerCase();
                return `${m.ad ?? ''} ${m.soyad ?? ''}`.toLowerCase().includes(q) ||
                  (m.etiketler && `#${m.etiketler}`.toLowerCase().includes(q));
              })}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.musteriItem}
                  onPress={() => {
                    if (eslesenMi(item)) {
                      Alert.alert('Eşleştirilemez', 'Bu müşteri bu ilan ile zaten otomatik eşleşiyor.');
                      return;
                    }
                    Alert.alert(
                      'Eşleştir',
                      `${[item.ad, item.soyad].filter(Boolean).join(' ')} ile eşleştirilsin mi?`,
                      [
                        { text: 'İptal', style: 'cancel' },
                        { text: 'Eşleştir', onPress: () => handleEsles(item.id, [item.ad, item.soyad].filter(Boolean).join(' ')) },
                      ]
                    );
                  }}
                  disabled={eslesYukleniyor}
                >
                  <View style={styles.musteriAvatar}>
                    <Text style={styles.musteriAvatarText}>{item.ad?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.musteriAd}>{[item.ad, item.soyad].filter(Boolean).join(' ')}</Text>
                    {item.telefon && <Text style={styles.musteriTelefon}>{item.telefon}</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {item.etiketler ? <View style={styles.etiketBadge}><Text style={styles.etiketBadgeText}>#{item.etiketler}</Text></View> : null}
                    <View style={[styles.durumBadge, {
                      backgroundColor: item.durum === 'Aktif' ? 'rgba(34,197,94,0.18)' : item.durum === 'Beklemede' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)'
                    }]}>
                      <Text style={[styles.durumBadgeText, {
                        color: item.durum === 'Aktif' ? '#166534' : item.durum === 'Beklemede' ? '#854d0e' : '#fca5a5'
                      }]}>{item.durum}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>Müşteri bulunamadı</Text>
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* 3 Nokta Menüsü */}
      <Modal visible={menuModal} animationType="fade" transparent onRequestClose={() => setMenuModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDimmer} onPress={() => setMenuModal(false)} />
          <View style={styles.menuPanel}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuModal(false); router.push(`/ilan/duzenle/${id}` as any); }}>
              <Text style={styles.menuItemText}>✏️  Düzenle</Text>
            </TouchableOpacity>
            <View style={styles.menuSep} />
            <TouchableOpacity style={styles.menuItem} onPress={handleCogalt} disabled={cogaltiyor}>
              <Text style={styles.menuItemText}>{cogaltiyor ? '⧉  Çoğaltılıyor...' : '⧉  Çoğalt'}</Text>
            </TouchableOpacity>
            <View style={styles.menuSep} />
            {fotograflar.length > 0 && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={tumFotograflariIndir}>
                  <Text style={styles.menuItemText}>⬇️  Fotoğrafları İndir ({fotograflar.length})</Text>
                </TouchableOpacity>
                <View style={styles.menuSep} />
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={sosyalModalAc}>
              <Text style={styles.menuItemText}>📱  Sosyal Medya Metni</Text>
            </TouchableOpacity>
            <View style={styles.menuSep} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuModal(false); setSatildiModal(true); }}>
              <Text style={styles.menuItemText}>🏷  Satıldı Afişi</Text>
            </TouchableOpacity>
            <View style={styles.menuSep} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuModal(false); setKolajModal(true); }}>
              <Text style={styles.menuItemText}>🖼  Kolaj</Text>
            </TouchableOpacity>
            <View style={styles.menuSep} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuModal(false); linkModalAc(); }}>
              <Text style={styles.menuItemText}>🔗  Link Paylaş</Text>
            </TouchableOpacity>
            <View style={styles.menuSep} />
            <TouchableOpacity style={styles.menuItem} onPress={otomatikEslesAc}>
              <Text style={styles.menuItemText}>🎯  Otomatik Eşleşen Müşteriler</Text>
            </TouchableOpacity>
            <View style={styles.menuSep} />
            <TouchableOpacity style={styles.menuItem} onPress={() => {
              setMenuModal(false);
              Alert.alert('İlanı Sil', 'Bu ilanı silmek istediğinize emin misiniz?', [
                { text: 'İptal', style: 'cancel' },
                { text: 'Sil', style: 'destructive', onPress: async () => {
                  await deleteIlanPhotos(id as string);
                  await supabase.from('ilanlar').delete().eq('id', id);
                  router.replace('/(tabs)/ilanlar');
                }},
              ]);
            }}>
              <Text style={[styles.menuItemText, styles.menuItemSil]}>🗑️  Sil</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Link Paylaş Modalı */}
      <Modal visible={linkModal} animationType="slide" transparent onRequestClose={() => setLinkModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalDimmer} onPress={() => setLinkModal(false)} />
            <View style={[styles.modalPanel, { height: '85%' }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setLinkModal(false)}>
                  <Text style={styles.modalKapat}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalBaslik}>🔗 Link Paylaş</Text>
                <View style={{ width: 32 }} />
              </View>

              {!linkUrl ? (
                <ScrollView style={{ flex: 1, padding: 16 }} keyboardShouldPersistTaps="handled">
                  {/* Müşteri seç */}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.onSurface, marginBottom: 6 }}>Müşteri Seç</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                    <TextInput
                      value={linkMusteriAra}
                      onChangeText={t => { setLinkMusteriAra(t); setLinkSeciliMusteri(''); }}
                      placeholder="İsim ara..."
                      placeholderTextColor={Colors.onSurfaceVariant}
                      style={{ flex: 1, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, padding: 10, fontSize: 13, color: Colors.onSurface }}
                    />
                    <TextInput
                      value={linkEtiketAra}
                      onChangeText={t => { setLinkEtiketAra(t); setLinkSeciliMusteri(''); }}
                      placeholder="Etiket ara..."
                      placeholderTextColor={Colors.onSurfaceVariant}
                      style={{ flex: 1, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, padding: 10, fontSize: 13, color: Colors.onSurface }}
                    />
                  </View>
                  {(linkMusteriAra || linkEtiketAra) && (
                    <View style={{ borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, maxHeight: 220, marginBottom: 8, overflow: 'hidden' }}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {(() => {
                        const q = linkMusteriAra.toLowerCase();
                        const filtered = linkMusteriler.filter(m => {
                          const isimEsles = !linkMusteriAra || `${m.ad ?? ''} ${m.soyad ?? ''}`.toLowerCase().includes(q);
                          const ekEsles = linkMusteriAra !== '' && (m.musteri_iletisim ?? []).some((k: any) => k.ad?.toLowerCase().includes(q) || k.telefon?.includes(linkMusteriAra));
                          const etiketEsles = !linkEtiketAra || (m.etiketler ?? '').toLowerCase().includes(linkEtiketAra.toLowerCase());
                          return (isimEsles || ekEsles) && etiketEsles;
                        });
                        if (filtered.length === 0) return <Text style={{ padding: 12, fontSize: 13, color: Colors.onSurfaceVariant }}>Bulunamadı</Text>;
                        return filtered.map(m => {
                          const eslesen = linkMusteriAra !== '' ? (m.musteri_iletisim ?? []).filter((k: any) => k.ad?.toLowerCase().includes(q) || k.telefon?.includes(linkMusteriAra)) : [];
                          const istek = (m.musteri_istekler ?? [])[0];
                          const durumRenk = m.durum === 'Aktif' ? { bg: 'rgba(58,170,110,0.1)', color: '#3aaa6e' } : { bg: Colors.surfaceContainerHigh, color: Colors.onSurfaceVariant };
                          return (
                            <TouchableOpacity key={m.id} onPress={() => { setLinkSeciliMusteri(m.id); setLinkMusteriAra([m.ad, m.soyad].filter(Boolean).join(' ')); setLinkEtiketAra(''); }}
                              style={{ padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: linkSeciliMusteri === m.id ? 'rgba(229,57,53,0.12)' : Colors.surfaceContainerLow, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerHigh }}>
                              {m.etiketler ? <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: Colors.surfaceContainerHighest, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 }}>#{m.etiketler.split(',')[0].trim()}</Text> : null}
                              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{(m.ad?.[0] ?? '?').toUpperCase()}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: linkSeciliMusteri === m.id ? Colors.primary : Colors.onSurface }}>{[m.ad, m.soyad].filter(Boolean).join(' ')}</Text>
                                  {m.durum ? <Text style={{ fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: durumRenk.bg, color: durumRenk.color }}>{m.durum}</Text> : null}
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                                  {m.telefon ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>📞 {m.telefon}</Text> : null}
                                  {istek && (istek.butce_min || istek.butce_max) ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>💰 {istek.butce_min ? `₺${Number(istek.butce_min).toLocaleString('tr-TR')}` : '?'} — {istek.butce_max ? `₺${Number(istek.butce_max).toLocaleString('tr-TR')}` : '?'}</Text> : null}
                                </View>
                                {eslesen.length > 0 && (
                                  <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.outlineVariant, borderStyle: 'dashed', gap: 3 }}>
                                    {eslesen.map((k: any, i: number) => (
                                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <Text style={{ fontSize: 10, fontWeight: '700', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(229,57,53,0.08)', color: Colors.primary }}>↳ {k.tip || 'Ek Kişi'}</Text>
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.onSurface }}>{k.ad}</Text>
                                        {k.telefon ? <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant }}>📞 {k.telefon}</Text> : null}
                                      </View>
                                    ))}
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        });
                      })()}
                      </ScrollView>
                    </View>
                  )}
                  {linkSeciliMusteri ? (
                    <Text style={{ fontSize: 12, color: '#3aaa6e', fontWeight: '600', marginBottom: 12 }}>
                      ✓ {(() => { const sm = linkMusteriler.find(m => m.id === linkSeciliMusteri); return [sm?.ad, sm?.soyad].filter(Boolean).join(' '); })()} seçildi
                    </Text>
                  ) : <View style={{ marginBottom: 12 }} />}

                  {(linkMusteriler.find(m => m.id === linkSeciliMusteri)?.ad ?? '').trim().toLowerCase() === 'genel' && (
                    <TextInput
                      value={linkEtiket}
                      onChangeText={setLinkEtiket}
                      placeholder="Etiket (kime gönderiliyor? — opsiyonel)"
                      placeholderTextColor={Colors.outline}
                      style={{ borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, padding: 10, fontSize: 13, color: Colors.onSurface, marginBottom: 16 }}
                    />
                  )}

                  {/* Süre */}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.onSurface, marginBottom: 8 }}>Ne kadar aktif olsun?</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[{ s: 1, label: '1 saat' }, { s: 24, label: '1 gün' }, { s: 72, label: '3 gün' }, { s: 168, label: '7 gün' }].map(({ s, label }) => (
                      <TouchableOpacity key={s} onPress={() => setLinkSaat(String(s))} style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 1.5,
                        borderColor: linkSaat === String(s) ? Colors.primary : Colors.outlineVariant,
                        backgroundColor: linkSaat === String(s) ? 'rgba(229,57,53,0.18)' : Colors.surfaceContainerLow,
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: linkSaat === String(s) ? Colors.primary : Colors.onSurfaceVariant }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <TextInput
                      value={linkSaat}
                      onChangeText={v => setLinkSaat(v.replace(/\D/g, ''))}
                      keyboardType="number-pad"
                      style={{ width: 72, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, padding: 8, fontSize: 14, textAlign: 'center', color: Colors.onSurface }}
                    />
                    <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>saat</Text>
                    {parseInt(linkSaat) >= 24 && <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant }}>({Math.round(parseInt(linkSaat) / 24)} gün)</Text>}
                  </View>
                  <TouchableOpacity onPress={linkOlustur} disabled={linkYukleniyor} style={{
                    backgroundColor: Colors.primary, borderRadius: 8, padding: 14, alignItems: 'center',
                    opacity: linkYukleniyor ? 0.7 : 1, marginBottom: 16,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                      {linkYukleniyor ? 'Oluşturuluyor...' : 'Link Oluştur'}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ fontSize: 13, color: '#3aaa6e', fontWeight: '600', marginBottom: 12 }}>
                    ✓ Link oluşturuldu — {Number(linkSaat) >= 24 ? `${Number(linkSaat) / 24} gün` : `${linkSaat} saat`} geçerli
                  </Text>
                  <View style={{ backgroundColor: Colors.surfaceContainerHigh, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: Colors.onSurface }} selectable>{linkUrl}</Text>
                  </View>
                  <TouchableOpacity onPress={linkKopyala} style={{
                    backgroundColor: linkKopyalandi ? '#3aaa6e' : Colors.primary,
                    borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 8,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                      {linkKopyalandi ? '✓ Kopyalandı!' : 'Kopyala'}
                    </Text>
                  </TouchableOpacity>
                  {(() => {
                    const tel = linkMusteriler.find(m => m.id === linkSeciliMusteri)?.telefon ?? '';
                    const cleaned = tel.replace(/\D/g, '').replace(/^0/, '');
                    if (!cleaned || !linkUrl) return null;
                    return (
                      <TouchableOpacity onPress={() => Linking.openURL(`whatsapp://send?phone=${cleaned}&text=${encodeURIComponent(linkUrl)}`).catch(() => Linking.openURL(`https://wa.me/${cleaned}?text=${encodeURIComponent(linkUrl)}`))} style={{
                        backgroundColor: '#25D366', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 8,
                      }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>WhatsApp'ta Gönder</Text>
                      </TouchableOpacity>
                    );
                  })()}
                  <TouchableOpacity onPress={() => { setLinkUrl(null); setLinkSaat('24'); setLinkSeciliMusteri(''); setLinkMusteriAra(''); setLinkEtiketAra(''); setLinkEtiket(''); }} style={{
                    borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, padding: 12, alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>Yeni Link Oluştur</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Otomatik Eşleşen Müşteriler Modalı */}
      <Modal visible={otomatikModal} animationType="slide" transparent onRequestClose={() => setOtomatikModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDimmer} onPress={() => setOtomatikModal(false)} />
          <View style={styles.modalPanel}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setOtomatikModal(false)}>
                <Text style={styles.modalKapat}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalBaslik}>Otomatik Eşleşen Müşteriler</Text>
              <View style={{ width: 32 }} />
            </View>
            <FlatList
              data={otomatikMusteriler}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.musteriItem}
                  onPress={() => { setOtomatikModal(false); router.push(`/musteri/${item.id}` as any); }}
                >
                  <View style={styles.musteriAvatar}>
                    <Text style={styles.musteriAvatarText}>{item.ad?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.musteriAd}>{[item.ad, item.soyad].filter(Boolean).join(' ')}</Text>
                    {(item.butce_min || item.butce_max) && (
                      <Text style={styles.musteriTelefon}>
                        {item.butce_min ? `₺${Number(item.butce_min).toLocaleString('tr-TR')}` : '—'}
                        {' – '}
                        {item.butce_max ? `₺${Number(item.butce_max).toLocaleString('tr-TR')}` : '—'}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.durumBadge, {
                    backgroundColor: item.durum === 'Aktif' ? 'rgba(34,197,94,0.18)' : item.durum === 'Beklemede' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)'
                  }]}>
                    <Text style={[styles.durumBadgeText, {
                      color: item.durum === 'Aktif' ? '#166534' : item.durum === 'Beklemede' ? '#854d0e' : '#fca5a5'
                    }]}>{item.durum}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>Bu fiyata uygun müşteri yok</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Sosyal Medya Metni Modalı */}
      <Modal visible={sosyalModal} animationType="slide" transparent onRequestClose={() => setSosyalModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalDimmer} onPress={() => setSosyalModal(false)} />
            <View style={[styles.modalPanel, { maxHeight: '85%' }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setSosyalModal(false)}>
                  <Text style={styles.modalKapat}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalBaslik}>📱 Sosyal Medya Metni</Text>
                <View style={{ width: 32 }} />
              </View>
              <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
                <TextInput
                  value={sosyalMetin}
                  onChangeText={setSosyalMetin}
                  multiline
                  style={{
                    borderWidth: 1.5,
                    borderColor: Colors.outlineVariant,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 13,
                    color: Colors.onSurface,
                    lineHeight: 22,
                    minHeight: 260,
                    textAlignVertical: 'top',
                    marginBottom: 8,
                  }}
                />
                {sosyalMetin.trim() !== generateSosyalMetin(ilan).trim() && (
                  <TouchableOpacity onPress={() => setSosyalMetin(generateSosyalMetin(ilan))} style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant }}>↺ Otomatik metne sıfırla</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={sosyalKopyala}
                    style={{ flex: 1, backgroundColor: sosyalKopyalandi ? '#3aaa6e' : Colors.surfaceContainerLow, borderRadius: 8, padding: 14, alignItems: 'center' }}
                  >
                    <Text style={{ color: sosyalKopyalandi ? '#fff' : Colors.onSurface, fontSize: 13, fontWeight: '700' }}>
                      {sosyalKopyalandi ? '✓ Kopyalandı!' : '📋 Kopyala'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={sosyalKaydet}
                    disabled={sosyalKaydediliyor}
                    style={{ flex: 1, backgroundColor: Colors.primary, borderRadius: 8, padding: 14, alignItems: 'center', opacity: sosyalKaydediliyor ? 0.7 : 1 }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                      {sosyalKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant, lineHeight: 16, marginBottom: 24 }}>
                  Düzenleyip Kaydet&apos;e basarsan bu ilana özel saklanır.
                </Text>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {satildiModal && (
        <SatildiAfisModal
          ilan={ilan}
          visible={satildiModal}
          onClose={() => setSatildiModal(false)}
        />
      )}

      {kolajModal && (
        <KolajModal
          ilan={ilan}
          visible={kolajModal}
          onClose={() => setKolajModal(false)}
        />
      )}

      <Modal visible={fullscreenIdx !== null} transparent animationType="fade" onRequestClose={() => setFullscreenIdx(null)}>
        <FullscreenGaleri
          fotos={fotograflar}
          initialIdx={fullscreenIdx ?? 0}
          onClose={() => setFullscreenIdx(null)}
          listRef={fullscreenListRef}
          thumbRef={fullscreenThumbRef}
        />
      </Modal>

      <PersistentTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 18, color: Colors.onSurface },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600', color: Colors.onSurface },
  menuBtn: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  menuBtnText: { fontSize: 20, color: Colors.onSurface, letterSpacing: 1 },
  menuPanel: { position: 'absolute', top: 60, right: Spacing.xl, backgroundColor: Colors.surface, borderRadius: Radius.xl, minWidth: 240, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 12 },
  menuItem: { paddingHorizontal: Spacing.xl, paddingVertical: 16 },
  menuItemText: { fontSize: 15, color: Colors.onSurface, fontWeight: '500' },
  menuItemSil: { color: '#ef4444' },
  menuSep: { height: 1, backgroundColor: Colors.surfaceContainerLow, marginHorizontal: Spacing.md },

  galeriContainer: { marginBottom: Spacing.lg },
  anaFoto: { width: SCREEN_WIDTH, height: 280 },
  fotoPlaceholder: {
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fotoPlaceholderEmoji: { fontSize: 64 },
  thumbRowWrap: { paddingTop: Spacing.sm, gap: Spacing.sm },
  thumbRow: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  indirBtn: { marginHorizontal: Spacing.lg, marginTop: 4, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, paddingVertical: 8, alignItems: 'center' },
  indirBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  thumb: {
    width: 56, height: 56,
    borderRadius: Radius.md,
    opacity: 0.5,
  },
  thumbAktif: {
    opacity: 1,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
  },
  thumbGizli: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderTopRightRadius: Radius.md, borderBottomLeftRadius: Radius.md,
    paddingHorizontal: 3, paddingVertical: 1,
  },
  thumbGizliText: { fontSize: 9 },
  gizliBadge: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  gizliBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  content: { paddingHorizontal: Spacing.xl, paddingBottom: 100 },

  fiyatSection: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: 8 },
  fiyat: { fontSize: 28, fontWeight: '700', color: Colors.primary, letterSpacing: -0.5 },
  tipBadge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  tipBadgeText: { color: '#fff', fontWeight: '600', fontSize: 12 },

  baslik: { fontSize: 20, fontWeight: '700', color: Colors.onSurface, marginBottom: 6 },
  konum: { fontSize: 14, color: Colors.onSurfaceVariant, marginBottom: Spacing.lg },
  haritaBtn: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 },
  haritaBtnText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  etiketBadge: { backgroundColor: Colors.primaryFixed, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  etiketBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.primary },

  ozelliklerGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  ozellikKart: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  ozellikEmoji: { fontSize: 20 },
  ozellikDeger: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  ozellikLabel: { fontSize: 11, color: Colors.onSurfaceVariant },

  mapBox: { height: 260, borderRadius: Radius.xl, overflow: 'hidden' },
  mapView: { flex: 1 },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface, marginBottom: Spacing.md },

  aciklama: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 22 },
  aciklamaYok: { fontSize: 14, color: Colors.outlineVariant, fontStyle: 'italic' },
  aciklamaTabRow: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, padding: 3, marginBottom: Spacing.md },
  aciklamaTab: { flex: 1, paddingVertical: 7, borderRadius: Radius.full, alignItems: 'center' },
  aciklamaTabAktif: { backgroundColor: Colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  aciklamaTabText: { fontSize: 13, fontWeight: '500', color: Colors.onSurfaceVariant },
  aciklamaTabTextAktif: { color: Colors.onSurface, fontWeight: '700' },

  detayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  detayBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceContainerLow,
  },
  detayLabel: { fontSize: 13, color: Colors.onSurfaceVariant },
  detayDeger: { fontSize: 13, fontWeight: '600', color: Colors.onSurface },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.xl,
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  iletisimBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  iletisimText: { color: Colors.onSurface, fontWeight: '600', fontSize: 14 },
  eslesBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  eslesBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalDimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalPanel: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalKapat: { fontSize: 20, color: Colors.onSurface, width: 32 },
  modalBaslik: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  modalSearch: { margin: Spacing.md, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, fontSize: 14, color: Colors.onSurface },
  musteriItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  musteriAvatar: { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.primaryFixed, alignItems: 'center', justifyContent: 'center' },
  musteriAvatarText: { color: Colors.primary, fontWeight: '700', fontSize: 16 },
  musteriAd: { fontSize: 15, fontWeight: '600', color: Colors.onSurface },
  musteriTelefon: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  durumBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  durumBadgeText: { fontSize: 11, fontWeight: '700' },
  modalEmpty: { padding: Spacing.xl, alignItems: 'center' },
  modalEmptyText: { color: Colors.onSurfaceVariant, fontSize: 14 },
});
