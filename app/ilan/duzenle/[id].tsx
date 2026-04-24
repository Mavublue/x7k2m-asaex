import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Modal, FlatList,
  Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import R2Image from '../../../components/R2Image';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { supabase } from '../../../lib/supabase';
import { getUploadUrl, optimizePhoto, deleteFile } from '../../../lib/r2';
import { Colors, Radius, Spacing } from '../../../constants/theme';
import { Ilan } from '../../../types';
import { TURKIYE, IL_LISTESI, MAHALLELER } from '../../../constants/turkiye';
import { forwardGeocode, verifyLocation } from '../../../lib/geocode';

function buildInlinePickerHtml(initLat?: number, initLng?: number) {
  const center = initLat && initLng ? `[${initLat},${initLng}]` : '[39.925,32.836]';
  const zoom = initLat && initLng ? 14 : 6;
  const initMarker = initLat && initLng
    ? `marker=L.marker([${initLat},${initLng}],{icon:pin}).addTo(map);`
    : 'marker=null;';
  return `<!DOCTYPE html><html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}body,#map{width:100vw;height:100vh;overflow:hidden}
.hint{position:absolute;top:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;padding:5px 12px;border-radius:16px;font-size:12px;z-index:1000;pointer-events:none;white-space:nowrap}
.leaflet-control-attribution{font-size:8px}</style>
</head>
<body>
<div id="map"></div>
<div class="hint">Konumu seçmek için dokunun</div>
<script>
var pin=L.divIcon({html:'<div style="width:18px;height:18px;background:#6750A4;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',className:'',iconSize:[18,18],iconAnchor:[9,18]});
var map=L.map('map',{zoomControl:true}).setView(${center},${zoom});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(map);
var marker;${initMarker}
map.on('click',function(e){
  if(marker)marker.setLatLng(e.latlng);
  else marker=L.marker(e.latlng,{icon:pin}).addTo(map);
  window.ReactNativeWebView.postMessage(JSON.stringify({lat:e.latlng.lat,lng:e.latlng.lng}));
});
window.__focusArea=function(s,n,w,e,la,ln){try{map.fitBounds([[s,w],[n,e]],{padding:[20,20],maxZoom:16});}catch(err){map.setView([la,ln],15);}};
</script></body></html>`;
}

const ILLER = TURKIYE;

const BINA_YASLARI = ['0', '1', '2', '3', '4', '5', '6-10', '11-15', '16-20', '21-25', '+30'];
const ODALAR = ['Stüdyo', '1+0', '1+1', '2+0', '2+1', '2+2', '3+0', '3+1', '3+2', '3+3', '4+0', '4+1', '4+2', '4+3', '4+4', '5+0', '5+1', '5+2', '5+3', '5+4', '6+0', '6+1', '6+2', '6+3', '6+4', '7+0', '7+1', '7+2', '7+3', '7+4', '8+0', '8+1', '8+2', '8+3', '8+4', '9+0', '9+1', '9+2', '9+3', '9+4', '10+0', '10+1', '10+2', '10+3', '10+4', '10+'];
const tipler = ['Satılık', 'Kiralık'];
const kategoriler = ['Daire', 'Villa', 'Arsa', 'Tarla', 'İşyeri', 'Otel', 'Müstakil Ev', 'Rezidans'];

function formatFiyat(val: string) {
  const sadece = val.replace(/\D/g, '');
  return sadece.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function IlanDuzenleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [veriYuklendi, setVeriYuklendi] = useState(false);

  const [portfoyNo, setPortfoyNo] = useState('');
  const [baslik, setBaslik] = useState('');
  const [fiyat, setFiyat] = useState('');
  const [il, setIl] = useState('');
  const [ilce, setIlce] = useState('');
  const [mahalle, setMahalle] = useState('');
  const [netM2, setNetM2] = useState('');
  const [brutM2, setBrutM2] = useState('');
  const [odaSayisi, setOdaSayisi] = useState('');
  const [tip, setTip] = useState('Satılık');
  const [kategori, setKategori] = useState('Daire');
  const [aciklama, setAciklama] = useState('');
  const [musteriAciklamasi, setMusteriAciklamasi] = useState('');
  const [aciklamaTab, setAciklamaTab] = useState<'not' | 'musteri'>('not');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [musteriKonumAktif, setMusteriKonumAktif] = useState(false);
  const [musteriLat, setMusteriLat] = useState('');
  const [musteriLng, setMusteriLng] = useState('');
  const [userId, setUserId] = useState('');
  const [fotograflar, setFotograflar] = useState<string[]>([]);
  const [gizliFotograflar, setGizliFotograflar] = useState<string[]>([]);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [orijinalFotograflar, setOrijinalFotograflar] = useState<string[]>([]);
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ilModal, setIlModal] = useState(false);
  const [ilceModal, setIlceModal] = useState(false);
  const [mahalleModal, setMahalleModal] = useState(false);
  const [odaModal, setOdaModal] = useState(false);
  const [ilSearch, setIlSearch] = useState('');
  const [ilceSearch, setIlceSearch] = useState('');
  const [mahalleSearch, setMahalleSearch] = useState('');
  const [secilenOzellikler, setSecilenOzellikler] = useState<string[]>([]);
  const [binaYasi, setBinaYasi] = useState('');
  const [banyoSayisi, setBanyoSayisi] = useState('');
  const [musteriGizle, setMusteriGizle] = useState(false);
  const [tumOzellikler, setTumOzellikler] = useState<{id: string; ad: string}[]>([]);
  const mapRef = useRef<WebView>(null);
  const musteriMapRef = useRef<WebView>(null);

  const arsaTarla = kategori === 'Arsa' || kategori === 'Tarla';

  useEffect(() => {
    if (!mahalle && !ilce) return;
    let cancelled = false;
    (async () => {
      const r = await forwardGeocode(il, ilce, mahalle);
      if (cancelled || !r) return;
      const [s, n, w, e] = r.bbox ?? [r.lat - 0.01, r.lat + 0.01, r.lng - 0.01, r.lng + 0.01];
      const js = `window.__focusArea && window.__focusArea(${s}, ${n}, ${w}, ${e}, ${r.lat}, ${r.lng}); true;`;
      if (!lat && !lng) mapRef.current?.injectJavaScript(js);
      if (!musteriLat && !musteriLng) musteriMapRef.current?.injectJavaScript(js);
    })();
    return () => { cancelled = true; };
  }, [il, ilce, mahalle]);

  const [portfoyYukleniyor, setPortfoyYukleniyor] = useState(false);
  async function otoPortfoyNo() {
    setPortfoyYukleniyor(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPortfoyYukleniyor(false); return; }
    const { data: profil } = await supabase.from('profiller').select('portfoy_prefix').eq('id', user.id).single();
    const prefix = ((profil as any)?.portfoy_prefix ?? '').toUpperCase();
    const { data: ilanlar } = await supabase.from('ilanlar').select('portfoy_no').eq('user_id', user.id).not('portfoy_no', 'is', null);
    const nums = new Set((ilanlar ?? []).map((i: any) => parseInt((i.portfoy_no ?? '').replace(/\D/g, ''), 10)).filter((n: number) => n > 0));
    let n = 1;
    while (nums.has(n)) n++;
    setPortfoyNo(prefix ? `${prefix}-${n}` : `${n}`);
    setPortfoyYukleniyor(false);
  }

  const ilListesi = IL_LISTESI.filter(i => i.toLowerCase().includes(ilSearch.toLowerCase()));
  const ilceListesi = (ILLER[il] ?? []).slice().sort((a, b) => a.localeCompare(b, 'tr')).filter(i => i.toLowerCase().includes(ilceSearch.toLowerCase()));
  const mahalleListesi = ((MAHALLELER as any)[il]?.[ilce] ?? []).slice().sort((a: string, b: string) => a.localeCompare(b, 'tr')).filter((m: string) => m.toLowerCase().includes(mahalleSearch.toLowerCase()));

  useEffect(() => {
    supabase.from('ozellikler').select('*').order('olusturma_tarihi').then(({ data }) => {
      if (data) setTumOzellikler(data);
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
  }, []);

  useEffect(() => {
    supabase.from('ilanlar').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        const ilan = data as Ilan;
        setPortfoyNo(ilan.portfoy_no ?? '');
        setBaslik(ilan.baslik);
        setFiyat(ilan.fiyat.toLocaleString('tr-TR').replace(/,/g, '.'));
        setIl(ilan.konum ?? '');
        setIlce(ilan.ilce ?? '');
        setMahalle(ilan.mahalle ?? '');
        setNetM2(ilan.metrekare?.toString() ?? '');
        setOdaSayisi(ilan.oda_sayisi ?? '');
        setTip(ilan.tip);
        setKategori(ilan.kategori);
        setAciklama(ilan.aciklama ?? '');
        setMusteriAciklamasi(ilan.musteri_aciklamasi ?? '');
        setSecilenOzellikler((ilan as any).ozellikler ? (ilan as any).ozellikler.split(',') : []);
        setBinaYasi(ilan.bina_yasi ?? '');
        setBanyoSayisi((ilan as any).banyo_sayisi?.toString() ?? '');
        setMusteriGizle((ilan as any).musteri_gizle ?? false);
        setLat(ilan.lat?.toString() ?? '');
        setLng(ilan.lng?.toString() ?? '');
        if (ilan.musteri_lat && ilan.musteri_lng) {
          setMusteriKonumAktif(true);
          setMusteriLat(ilan.musteri_lat.toString());
          setMusteriLng(ilan.musteri_lng.toString());
        }
        const keys = ilan.fotograflar ?? [];
        setFotograflar(keys);
        setOrijinalFotograflar(keys);
        setGizliFotograflar((ilan as any).gizli_fotograflar ?? []);
      }
      setVeriYuklendi(true);
    });
  }, [id]);

  async function fotografEkle() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('İzin gerekli', 'Galeri iznine ihtiyaç var.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (result.canceled) return;

    setFotoYukleniyor(true);
    const keys: string[] = [];
    for (const asset of result.assets) {
      try {
        const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const dosyaAdi = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { uploadUrl, key } = await getUploadUrl(id as string, dosyaAdi, mimeType);

        const uploadResult = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
          httpMethod: 'PUT',
          headers: { 'Content-Type': mimeType },
        });

        if (uploadResult.status !== 200) throw new Error('Upload başarısız');

        const isFirst = fotograflar.length + keys.length === 0;
        optimizePhoto(key, isFirst);
        keys.push(key);
        setLocalPreviews(prev => ({ ...prev, [key]: asset.uri }));
      } catch (e) { console.error(e); }
    }
    setFotograflar(prev => [...prev, ...keys]);
    setFotoYukleniyor(false);
  }

  async function handleKaydet() {
    if (fotoYukleniyor) {
      Alert.alert('Bekleyin', 'Fotoğraflar henüz yükleniyor, lütfen bekleyin.');
      return;
    }
    setSubmitted(true);
    const eksik = !baslik || !fiyat || !il || !musteriAciklamasi ||
      (!arsaTarla && (!banyoSayisi || !netM2 || !brutM2 || !odaSayisi || !binaYasi));
    if (eksik) {
      Alert.alert('Eksik Bilgi', 'Lütfen zorunlu (*) alanları doldurun.');
      return;
    }

    if (lat && lng && (mahalle || ilce)) {
      const check = await verifyLocation(parseFloat(lat), parseFloat(lng), ilce, mahalle);
      if (check && !check.ok) {
        const seen = [check.seenMahalle, check.seenIlce].filter(Boolean).join(', ') || 'tanımsız bölge';
        const expected = [mahalle, ilce].filter(Boolean).join(', ');
        const devam = await new Promise<boolean>(resolve => {
          Alert.alert(
            'Konum uyuşmuyor',
            `Seçtiğin nokta: ${seen}\nBekleneni: ${expected}\n\nYine de kaydedilsin mi?`,
            [
              { text: 'İptal', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Yine de Kaydet', style: 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          );
        });
        if (!devam) return;
      }
    }

    const silinenler = orijinalFotograflar.filter(k => !fotograflar.includes(k));
    await Promise.all(silinenler.map(key => deleteFile(key).catch(e => console.error('silme hatası:', key, e))));
    setLoading(true);

    const { error } = await supabase.from('ilanlar').update({
      portfoy_no: portfoyNo || null,
      baslik,
      fiyat: parseFloat(fiyat.replace(/\./g, '')),
      konum: il,
      ilce: ilce || null,
      mahalle: mahalle || null,
      metrekare: netM2 ? parseFloat(netM2) : null,
      oda_sayisi: odaSayisi || null,
      tip, kategori,
      aciklama: aciklama || null,
      musteri_aciklamasi: musteriAciklamasi || null,
      bina_yasi: binaYasi || null,
      banyo_sayisi: banyoSayisi ? parseInt(banyoSayisi) : null,
      ozellikler: secilenOzellikler.length ? secilenOzellikler.join(',') : null,
      musteri_gizle: musteriGizle,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      musteri_lat: (musteriKonumAktif && musteriLat) ? parseFloat(musteriLat) : null,
      musteri_lng: (musteriKonumAktif && musteriLng) ? parseFloat(musteriLng) : null,
      fotograflar: fotograflar.length > 0 ? fotograflar : null,
      gizli_fotograflar: gizliFotograflar.filter(k => fotograflar.includes(k)).length > 0
        ? gizliFotograflar.filter(k => fotograflar.includes(k))
        : null,
    }).eq('id', id);

    if (error) {
      Alert.alert('Hata', error.message);
    } else {
      Alert.alert('Kaydedildi', 'İlan güncellendi.', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    }
    setLoading(false);
  }

  if (!veriYuklendi) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.kapat}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>İlanı Düzenle</Text>
        <TouchableOpacity style={styles.headerKaydet} onPress={handleKaydet} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.headerKaydetText}>Kaydet</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Fotoğraflar */}
          <FormGroup label="Fotoğraflar">
            <View style={styles.fotoGrid}>
              {fotograflar.map((key, i) => {
                const gizli = gizliFotograflar.includes(key);
                return (
                <View key={key} style={styles.fotoKutu}>
                  {localPreviews[key]
                    ? <Image source={{ uri: localPreviews[key] }} style={styles.fotoImage} resizeMode="cover" />
                    : <R2Image source={key} style={styles.fotoImage} resizeMode="cover" size="sm" />
                  }
                  {gizli && (
                    <View style={styles.gizliOverlay}>
                      <Text style={styles.gizliOverlayText}>🚫</Text>
                    </View>
                  )}
                  {i === 0 && <View style={styles.kapakBadge}><Text style={styles.kapakText}>Kapak</Text></View>}
                  <TouchableOpacity style={styles.fotoGoz} onPress={() => {
                    setGizliFotograflar(prev => gizli ? prev.filter(k => k !== key) : [...prev, key]);
                  }}>
                    <Text style={styles.fotoGozText}>{gizli ? '🚫' : '👁'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.fotoSil} onPress={() => {
                    setFotograflar(fotograflar.filter((_, j) => j !== i));
                    setGizliFotograflar(prev => prev.filter(k => k !== key));
                  }}>
                    <Text style={styles.fotoSilText}>✕</Text>
                  </TouchableOpacity>
                  <View style={styles.fotoSiraRow}>
                    {i > 0 && (
                      <TouchableOpacity style={styles.fotoSiraBtn} onPress={() => {
                        const arr = [...fotograflar];
                        [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                        setFotograflar(arr);
                      }}>
                        <Text style={styles.fotoSiraBtnText}>←</Text>
                      </TouchableOpacity>
                    )}
                    {i < fotograflar.length - 1 && (
                      <TouchableOpacity style={styles.fotoSiraBtn} onPress={() => {
                        const arr = [...fotograflar];
                        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                        setFotograflar(arr);
                      }}>
                        <Text style={styles.fotoSiraBtnText}>→</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                );
              })}
              <TouchableOpacity style={styles.fotoEkle} onPress={fotografEkle} disabled={fotoYukleniyor}>
                {fotoYukleniyor ? <ActivityIndicator size="small" color={Colors.primary} /> : <>
                  <Text style={styles.fotoEkleIcon}>＋</Text>
                  <Text style={styles.fotoEkleText}>Ekle</Text>
                </>}
              </TouchableOpacity>
            </View>
          </FormGroup>

          <FormGroup label="Portföy No">
            <TextInput
              style={[styles.input, { color: portfoyNo ? Colors.primary : Colors.outlineVariant, fontWeight: portfoyNo ? '700' : '400' }]}
              value={portfoyNo}
              placeholder="—"
              editable={false}
              placeholderTextColor={Colors.outlineVariant}
            />
          </FormGroup>

          <FormGroup label="İlan Başlığı *">
            <TextInput style={[styles.input, submitted && !baslik && styles.inputErr]} value={baslik} onChangeText={setBaslik} placeholderTextColor={Colors.outlineVariant} />
          </FormGroup>

          <FormGroup label="İlan Tipi *">
            <View style={styles.chipRow}>
              {tipler.map(t => (
                <TouchableOpacity key={t} style={[styles.chip, tip === t && styles.chipActive]} onPress={() => setTip(t)}>
                  <Text style={[styles.chipText, tip === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormGroup>

          <FormGroup label="Kategori *">
            <View style={styles.chipRow}>
              {kategoriler.map(k => (
                <TouchableOpacity key={k} style={[styles.chip, kategori === k && styles.chipActive]} onPress={() => setKategori(k)}>
                  <Text style={[styles.chipText, kategori === k && styles.chipTextActive]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormGroup>

          <FormGroup label="Fiyat (₺) *">
            <View style={[styles.inputRow, submitted && !fiyat && styles.inputErr, { borderRadius: 12 }]}>
              <Text style={styles.inputPrefix}>₺</Text>
              <TextInput style={[styles.input, { flex: 1 }]} value={fiyat} onChangeText={v => setFiyat(formatFiyat(v))} keyboardType="numeric" placeholderTextColor={Colors.outlineVariant} />
            </View>
          </FormGroup>

          <FormGroup label="Konum *">
            <View style={styles.satir}>
              <TouchableOpacity style={[styles.selectBtn, { flex: 1 }]} onPress={() => setIlModal(true)}>
                <Text style={il ? styles.selectText : styles.selectPlaceholder}>{il || 'İl Seç'}</Text>
                <Text style={styles.selectArrow}>▾</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.selectBtn, { flex: 1 }, !il && styles.selectBtnDisabled]} onPress={() => il && setIlceModal(true)}>
                <Text style={ilce ? styles.selectText : styles.selectPlaceholder}>{ilce || 'İlçe Seç'}</Text>
                <Text style={styles.selectArrow}>▾</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.selectBtn, { marginTop: Spacing.sm }, !ilce && styles.selectBtnDisabled]}
              onPress={() => ilce && setMahalleModal(true)}
            >
              <Text style={mahalle ? styles.selectText : styles.selectPlaceholder}>{mahalle || 'Mahalle Seç'}</Text>
              <Text style={styles.selectArrow}>▾</Text>
            </TouchableOpacity>
          </FormGroup>

          <FormGroup label={arsaTarla ? 'Metrekare' : 'Metrekare *'}>
            <View style={styles.satir}>
              <View style={[styles.m2Kutu, { flex: 1 }]}>
                <TextInput style={[styles.input, { flex: 1 }, submitted && !arsaTarla && !netM2 && styles.inputErr]} placeholder="0" value={netM2} onChangeText={setNetM2} keyboardType="numeric" placeholderTextColor={Colors.outlineVariant} />
                <View style={styles.m2Etiket}><Text style={styles.m2EtiketText}>NET m²</Text></View>
              </View>
              <View style={[styles.m2Kutu, { flex: 1 }]}>
                <TextInput style={[styles.input, { flex: 1 }, submitted && !arsaTarla && !brutM2 && styles.inputErr]} placeholder="0" value={brutM2} onChangeText={setBrutM2} keyboardType="numeric" placeholderTextColor={Colors.outlineVariant} />
                <View style={styles.m2Etiket}><Text style={styles.m2EtiketText}>BRÜT m²</Text></View>
              </View>
            </View>
          </FormGroup>

          <FormGroup label={arsaTarla ? 'Banyo Sayısı' : 'Banyo Sayısı *'}>
            <View style={[styles.chipRow, submitted && !arsaTarla && !banyoSayisi && styles.chipRowErr]}>
              {['1', '2', '3', '4', '5+'].map(b => (
                <TouchableOpacity key={b} style={[styles.chip, banyoSayisi === b && styles.chipActive]} onPress={() => setBanyoSayisi(b)}>
                  <Text style={[styles.chipText, banyoSayisi === b && styles.chipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormGroup>

          <FormGroup label={arsaTarla ? 'Oda Sayısı' : 'Oda Sayısı *'}>
            <TouchableOpacity
              style={[styles.selectBtn, submitted && !arsaTarla && !odaSayisi && { borderWidth: 1.5, borderColor: '#E53935' }]}
              onPress={() => setOdaModal(true)}
            >
              <Text style={odaSayisi ? styles.selectText : styles.selectPlaceholder}>{odaSayisi || 'Oda Sayısı Seç'}</Text>
              <Text style={styles.selectArrow}>▾</Text>
            </TouchableOpacity>
          </FormGroup>

          <FormGroup label="Açıklama">
            <View style={styles.aciklamaTabRow}>
              <TouchableOpacity style={[styles.aciklamaTab, aciklamaTab === 'not' && styles.aciklamaTabAktif]} onPress={() => setAciklamaTab('not')}>
                <Text style={[styles.aciklamaTabText, aciklamaTab === 'not' && styles.aciklamaTabTextAktif]}>Notlarım</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.aciklamaTab, aciklamaTab === 'musteri' && styles.aciklamaTabAktif]} onPress={() => setAciklamaTab('musteri')}>
                <Text style={[styles.aciklamaTabText, aciklamaTab === 'musteri' && styles.aciklamaTabTextAktif]}>Müşteriye *</Text>
              </TouchableOpacity>
            </View>
            {aciklamaTab === 'not' ? (
              <>
                <TextInput style={[styles.input, styles.textarea]} placeholder="Kendi notlarınız (müşteri görmez)..." value={aciklama} onChangeText={setAciklama} multiline numberOfLines={4} placeholderTextColor={Colors.outlineVariant} textAlignVertical="top" />
                {submitted && !musteriAciklamasi && (
                  <Text style={styles.errText}>Müşteri açıklaması zorunludur.</Text>
                )}
              </>
            ) : (
              <TextInput style={[styles.input, styles.textarea, submitted && !musteriAciklamasi && styles.inputErr]} placeholder="Müşteriye gösterilecek açıklama..." value={musteriAciklamasi} onChangeText={setMusteriAciklamasi} multiline numberOfLines={4} placeholderTextColor={Colors.outlineVariant} textAlignVertical="top" />
            )}
          </FormGroup>

          <FormGroup label={arsaTarla ? 'Bina Yaşı' : 'Bina Yaşı *'}>
            <View style={[styles.chipRow, submitted && !arsaTarla && !binaYasi && styles.chipRowErr]}>
              {BINA_YASLARI.map(y => {
                const secili = binaYasi === y;
                return (
                  <TouchableOpacity key={y} style={[styles.chip, secili && styles.chipActive]}
                    onPress={() => setBinaYasi(secili ? '' : y)}>
                    <Text style={[styles.chipText, secili && styles.chipTextActive]}>{y}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormGroup>

          {/* Müşteriye Gizle */}
          <TouchableOpacity style={styles.gizleRow} onPress={() => setMusteriGizle(v => !v)} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Müşteriye Gizle</Text>
              <Text style={styles.gizleAlt}>Bu ilan toplu paylaşımlarda görünmez</Text>
            </View>
            <View style={[styles.tikBox, musteriGizle && styles.tikBoxAktif]}>
              {musteriGizle && <Text style={styles.tikIsaret}>✓</Text>}
            </View>
          </TouchableOpacity>

          {tumOzellikler.length > 0 && (
            <FormGroup label="Özellikler">
              <View style={styles.chipRow}>
                {tumOzellikler.map(oz => {
                  const secili = secilenOzellikler.includes(oz.ad);
                  return (
                    <TouchableOpacity
                      key={oz.id}
                      style={[styles.chip, secili && styles.chipActive]}
                      onPress={() => setSecilenOzellikler(prev =>
                        secili ? prev.filter(x => x !== oz.ad) : [...prev, oz.ad]
                      )}
                    >
                      <Text style={[styles.chipText, secili && styles.chipTextActive]}>{oz.ad}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FormGroup>
          )}

          <FormGroup label="Harita Konumu *" rightElement={
            <TouchableOpacity
              style={styles.musteriKonumToggle}
              onPress={() => { setMusteriKonumAktif(v => !v); if (musteriKonumAktif) { setMusteriLat(''); setMusteriLng(''); } }}
            >
              <View style={[styles.tikBox, musteriKonumAktif && styles.tikBoxAktif]}>
                {musteriKonumAktif && <Text style={styles.tikIsaret}>✓</Text>}
              </View>
              <Text style={styles.musteriKonumLabel}>Müşteri konumu</Text>
            </TouchableOpacity>
          }>
            <View style={styles.inlineMapBox}>
              <WebView
                ref={mapRef}
                source={{ html: buildInlinePickerHtml(lat ? parseFloat(lat) : undefined, lng ? parseFloat(lng) : undefined) }}
                style={styles.inlineMapView}
                onMessage={e => {
                  try {
                    const { lat: la, lng: ln } = JSON.parse(e.nativeEvent.data);
                    setLat(la.toString());
                    setLng(ln.toString());
                  } catch {}
                }}
                javaScriptEnabled
                domStorageEnabled
                originWhitelist={['*']}
                mixedContentMode="always"
              />
            </View>
            {lat && lng && (
              <TouchableOpacity onPress={() => { setLat(''); setLng(''); }} style={styles.mapSifirla}>
                <Text style={styles.mapSifirlaText}>📍 Konumu Sıfırla</Text>
              </TouchableOpacity>
            )}
          </FormGroup>

          {musteriKonumAktif && (
            <FormGroup label="Müşteri Konumu">
              <View style={styles.inlineMapBox}>
                <WebView
                  ref={musteriMapRef}
                  source={{ html: buildInlinePickerHtml(musteriLat ? parseFloat(musteriLat) : (lat ? parseFloat(lat) : undefined), musteriLng ? parseFloat(musteriLng) : (lng ? parseFloat(lng) : undefined)) }}
                  style={styles.inlineMapView}
                  onMessage={e => {
                    try {
                      const { lat: la, lng: ln } = JSON.parse(e.nativeEvent.data);
                      setMusteriLat(la.toString());
                      setMusteriLng(ln.toString());
                    } catch {}
                  }}
                  javaScriptEnabled
                  domStorageEnabled
                  originWhitelist={['*']}
                  mixedContentMode="always"
                />
              </View>
              {musteriLat && musteriLng && (
                <TouchableOpacity onPress={() => { setMusteriLat(''); setMusteriLng(''); }} style={styles.mapSifirla}>
                  <Text style={styles.mapSifirlaText}>🏠 Müşteri Konumunu Sıfırla</Text>
                </TouchableOpacity>
              )}
            </FormGroup>
          )}

          <TouchableOpacity style={styles.kaydetBtn} onPress={handleKaydet} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.kaydetText}>Değişiklikleri Kaydet</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <SelectModal visible={ilModal} onClose={() => { setIlModal(false); setIlSearch(''); }} title="İl Seçin" search={ilSearch} onSearch={setIlSearch} data={ilListesi} onSelect={v => { setIl(v); setIlce(''); setMahalle(''); setIlSearch(''); setIlModal(false); }} selected={il} />
      <SelectModal visible={ilceModal} onClose={() => { setIlceModal(false); setIlceSearch(''); }} title="İlçe Seçin" search={ilceSearch} onSearch={setIlceSearch} data={ilceListesi} onSelect={v => { setIlce(v); setMahalle(''); setIlceSearch(''); setIlceModal(false); }} selected={ilce} />
      <SelectModal visible={mahalleModal} onClose={() => { setMahalleModal(false); setMahalleSearch(''); }} title="Mahalle Seçin" search={mahalleSearch} onSearch={setMahalleSearch} data={mahalleListesi} onSelect={v => { setMahalle(v); setMahalleSearch(''); setMahalleModal(false); }} selected={mahalle} />


      <Modal visible={odaModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Oda Sayısı Seçin</Text>
            <View style={styles.chipRow}>
              {ODALAR.map(o => (
                <TouchableOpacity key={o} style={[styles.chip, odaSayisi === o && styles.chipActive]} onPress={() => { setOdaSayisi(o); setOdaModal(false); }}>
                  <Text style={[styles.chipText, odaSayisi === o && styles.chipTextActive]}>{o}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalKapat} onPress={() => setOdaModal(false)}>
              <Text style={styles.modalKapatText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SelectModal({ visible, onClose, title, search, onSearch, data, onSelect, selected }: {
  visible: boolean; onClose: () => void; title: string;
  search: string; onSearch: (v: string) => void;
  data: string[]; onSelect: (v: string) => void; selected: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TextInput style={[styles.input, { marginBottom: Spacing.md }]} placeholder="Ara..." value={search} onChangeText={onSearch} placeholderTextColor={Colors.outlineVariant} autoFocus={false} />
            <FlatList data={data} keyExtractor={item => item} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => onSelect(item)}>
                  <Text style={[styles.modalItemText, selected === item && styles.modalItemTextActive]}>{item}</Text>
                  {selected === item && <Text style={{ color: Colors.primary }}>✓</Text>}
                </TouchableOpacity>
              )} />
            <TouchableOpacity style={styles.modalKapat} onPress={onClose}>
              <Text style={styles.modalKapatText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FormGroup({ label, children, rightElement }: { label: string; children: React.ReactNode; rightElement?: React.ReactNode }) {
  return (
    <View style={styles.formGroup}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.label}>{label}</Text>
        {rightElement}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.xl, paddingBottom: 48, gap: Spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  kapat: { fontSize: 20, color: Colors.onSurface },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  formGroup: { gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  input: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  aciklamaTabRow: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, padding: 3, marginBottom: Spacing.sm },
  aciklamaTab: { flex: 1, paddingVertical: 7, borderRadius: Radius.full, alignItems: 'center' },
  aciklamaTabAktif: { backgroundColor: Colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  aciklamaTabText: { fontSize: 13, fontWeight: '500', color: Colors.onSurfaceVariant },
  aciklamaTabTextAktif: { color: Colors.onSurface, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputPrefix: { fontSize: 18, color: Colors.onSurfaceVariant, marginRight: 6 },
  satir: { flexDirection: 'row', gap: Spacing.sm },
  selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  selectBtnDisabled: { opacity: 0.4 },
  selectText: { fontSize: 15, color: Colors.onSurface },
  selectPlaceholder: { fontSize: 15, color: Colors.outlineVariant },
  selectArrow: { fontSize: 12, color: Colors.onSurfaceVariant },
  m2Kutu: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  m2Etiket: { backgroundColor: Colors.surfaceContainerHigh, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 6 },
  m2EtiketText: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant },
  inputErr: { borderWidth: 1.5, borderColor: '#E53935' },
  chipRowErr: { borderWidth: 1.5, borderColor: '#E53935', borderRadius: 10, padding: 6 },
  errText: { fontSize: 12, color: '#E53935', marginTop: 4, fontWeight: '500' },
  gizleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: Spacing.lg, gap: 12 },
  gizleAlt: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow },
  chipActive: { backgroundColor: Colors.primaryFixed },
  chipText: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  chipTextActive: { color: Colors.primary, fontWeight: '600' },
  fotoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  fotoKutu: { width: 80, height: 80, borderRadius: Radius.lg, overflow: 'hidden' },
  fotoImage: { width: 80, height: 80 },
  fotoSil: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.full, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  fotoSilText: { color: '#fff', fontSize: 9 },
  fotoGoz: { position: 'absolute', top: 2, left: 2, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.full, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  fotoGozText: { fontSize: 10 },
  gizliOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  gizliOverlayText: { fontSize: 22 },
  kapakBadge: { position: 'absolute', bottom: 20, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center' },
  kapakText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  fotoSiraRow: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.45)' },
  fotoSiraBtn: { paddingHorizontal: 6, paddingVertical: 1 },
  fotoSiraBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  fotoEkle: { width: 80, height: 80, borderRadius: Radius.lg, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.outlineVariant, borderStyle: 'dashed' },
  fotoEkleIcon: { fontSize: 22, color: Colors.primary },
  fotoEkleText: { fontSize: 10, color: Colors.onSurfaceVariant, marginTop: 2 },
  inlineMapBox: { height: 300, borderRadius: Radius.xl, overflow: 'hidden' },
  inlineMapView: { flex: 1 },
  mapSifirla: { marginTop: Spacing.sm, alignSelf: 'flex-start' },
  mapSifirlaText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  musteriKonumToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  musteriKonumLabel: { fontSize: 11, color: Colors.onSurfaceVariant, fontWeight: '500' },
  tikBox: { width: 17, height: 17, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center' },
  tikBoxAktif: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tikIsaret: { fontSize: 11, color: '#fff', fontWeight: '700' },
  mapPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 14 },
  mapPickerText: { flex: 1, fontSize: 15, color: Colors.onSurface },
  kaydetBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.sm },
  kaydetText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  headerKaydet: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  headerKaydetText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.surfaceContainerLowest, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, padding: Spacing.xl, gap: Spacing.sm },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.onSurface, marginBottom: 4 },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalItemText: { fontSize: 15, color: Colors.onSurface },
  modalItemTextActive: { color: Colors.primary, fontWeight: '600' },
  modalKapat: { marginTop: Spacing.md, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, paddingVertical: 14, alignItems: 'center' },
  modalKapatText: { color: Colors.onSurface, fontWeight: '600' },
});
