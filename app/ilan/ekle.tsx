import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Modal, FlatList, SectionList,
  Image, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { getUploadUrl, optimizePhoto } from '../../lib/r2';
import { Colors, Radius, Spacing } from '../../constants/theme';
import MapPickerModal from '../../components/MapPickerModal';
import FotoGridSortable from '../../components/FotoGridSortable';
import { TURKIYE, IL_LISTESI, getMahalleler, getMahalleGruplar } from '../../constants/turkiye';

const ILLER = TURKIYE;

const BINA_YASLARI = ['0', '1', '2', '3', '4', '5', '6-10', '11-15', '16-20', '21-25', '+30'];
const KAT_SAYILARI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '20+'];
const BULUNDUGU_KATLAR = ['Giriş Altı Kot', 'Bodrum Kat', 'Zemin Kat', 'Bahçe Katı', 'Giriş Katı', 'Yüksek Giriş', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20+', 'Çatı Katı', 'Müstakil', 'Villa Tipi'];
const ODALAR = ['Stüdyo', '1+0', '1+1', '2+0', '2+1', '2+2', '3+0', '3+1', '3+2', '3+3', '4+0', '4+1', '4+2', '4+3', '4+4', '5+0', '5+1', '5+2', '5+3', '5+4', '6+0', '6+1', '6+2', '6+3', '6+4', '7+0', '7+1', '7+2', '7+3', '7+4', '8+0', '8+1', '8+2', '8+3', '8+4', '9+0', '9+1', '9+2', '9+3', '9+4', '10+0', '10+1', '10+2', '10+3', '10+4', '10+'];
const tipler = ['Satılık', 'Kiralık'];
const kategoriler = ['Daire', 'Villa', 'Arsa', 'Tarla', 'İşyeri', 'Otel', 'Müstakil Ev', 'Rezidans'];

const IL_KOORDINAT: Record<string, [number, number]> = {
  'İstanbul': [41.015, 28.979],
  'Ankara': [39.925, 32.836],
  'İzmir': [38.423, 27.143],
  'Bursa': [40.183, 29.061],
  'Antalya': [36.897, 30.713],
  'Muğla': [37.215, 28.363],
  'Trabzon': [41.005, 39.726],
  'Adana': [37.000, 35.321],
  'Gaziantep': [37.066, 37.383],
  'Konya': [37.871, 32.485],
  'Kayseri': [38.732, 35.487],
  'Eskişehir': [39.776, 30.521],
  'Mersin': [36.812, 34.641],
  'Diyarbakır': [37.910, 40.230],
  'Samsun': [41.286, 36.330],
  'Denizli': [37.773, 29.087],
  'Şanlıurfa': [37.159, 38.796],
  'Malatya': [38.355, 38.309],
  'Erzurum': [39.905, 41.269],
  'Van': [38.495, 43.380],
};

function formatFiyat(val: string) {
  const sadece = val.replace(/\D/g, '');
  return sadece.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function IlanEkleScreen() {
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
  const [secilenKategoriler, setSecilenKategoriler] = useState<string[]>(['Daire']);
  const [aciklama, setAciklama] = useState('');
  const [musteriAciklamasi, setMusteriAciklamasi] = useState('');
  const [aciklamaTab, setAciklamaTab] = useState<'not' | 'musteri'>('not');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [musteriKonumAktif, setMusteriKonumAktif] = useState(false);
  const [musteriLat, setMusteriLat] = useState('');
  const [musteriLng, setMusteriLng] = useState('');
  const [musteriMapPickerVisible, setMusteriMapPickerVisible] = useState(false);
  const [secilenOzellikler, setSecilenOzellikler] = useState<string[]>([]);
  const [binaYasi, setBinaYasi] = useState('');
  const [banyoSayisi, setBanyoSayisi] = useState('');
  const [katSayisi, setKatSayisi] = useState('');
  const [bulunduguKat, setBulunduguKat] = useState('');
  const [katModal, setKatModal] = useState(false);
  const [bulunduguKatModal, setBulunduguKatModal] = useState(false);
  const [musteriGizle, setMusteriGizle] = useState(false);
  const [tumOzellikler, setTumOzellikler] = useState<{id: string; ad: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [ilanId] = useState(() => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const [fotograflar, setFotograflar] = useState<string[]>([]);
  const [gizliFotograflar, setGizliFotograflar] = useState<string[]>([]);
  const [fotograflarPreview, setFotograflarPreview] = useState<string[]>([]);
  const [pending, setPending] = useState<{ tempId: string; uri: string; percent: number; task: any | null }[]>([]);
  const cancelledRef = useRef<Set<string>>(new Set());
  const fotoYukleniyor = pending.length > 0;
  const [submitted, setSubmitted] = useState(false);
  const [ilModal, setIlModal] = useState(false);
  const [ilceModal, setIlceModal] = useState(false);
  const [mahalleModal, setMahalleModal] = useState(false);
  const [odaModal, setOdaModal] = useState(false);
  const [ilSearch, setIlSearch] = useState('');
  const [ilceSearch, setIlceSearch] = useState('');
  const [mahalleSearch, setMahalleSearch] = useState('');
  const [mapInitLat, setMapInitLat] = useState<number | undefined>();
  const [mapInitLng, setMapInitLng] = useState<number | undefined>();

  useEffect(() => {
    supabase.from('ozellikler').select('*').order('olusturma_tarihi').then(({ data }) => {
      if (data) setTumOzellikler(data);
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        setUserId(user.id);
        const { data } = await supabase.from('profiller').select('calisma_bolgesi, portfoy_prefix').eq('id', user.id).single();
        if (data?.calisma_bolgesi) {
          const koord = IL_KOORDINAT[data.calisma_bolgesi];
          if (koord) { setMapInitLat(koord[0]); setMapInitLng(koord[1]); }
        }
        const prefix = (data?.portfoy_prefix ?? '').toUpperCase();
        const { data: ilanlar } = await supabase.from('ilanlar').select('portfoy_no').eq('user_id', user.id);
        const nums = new Set(
          (ilanlar ?? [])
            .map((i: any) => parseInt((i.portfoy_no ?? '').replace(/\D/g, ''), 10))
            .filter((n: number) => n > 0)
        );
        let n = 1;
        while (nums.has(n)) n++;
        setPortfoyNo(prefix ? `${prefix}-${n}` : String(n));
      } catch (e) {
        setPortfoyNo('1');
      }
    })();
  }, []);

  const arsaTarla = secilenKategoriler.length > 0 && secilenKategoriler.every(k => k === 'Arsa' || k === 'Tarla');
  const isyeri = secilenKategoriler.length > 0 && secilenKategoriler.every(k => k === 'İşyeri');
  const banyoNetOdaOpsiyonel = arsaTarla || isyeri;
  const ilListesi = IL_LISTESI.filter(i => i.toLowerCase().includes(ilSearch.toLowerCase()));
  const ilceListesi = (ILLER[il] ?? []).slice().sort((a, b) => a.localeCompare(b, 'tr')).filter(i => i.toLowerCase().includes(ilceSearch.toLowerCase()));
  const mahalleGruplar = getMahalleGruplar(il, ilce)
    .map(g => ({ semt: g.semt, mahalleler: g.mahalleler.filter(m => m.toLowerCase().includes(mahalleSearch.toLowerCase())) }))
    .filter(g => g.mahalleler.length > 0);

  function cancelUpload(tempId: string) {
    cancelledRef.current.add(tempId);
    setPending(prev => {
      const item = prev.find(p => p.tempId === tempId);
      if (item?.task) { try { item.task.cancelAsync(); } catch {} }
      return prev.filter(p => p.tempId !== tempId);
    });
  }

  async function fotografSec() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Fotoğraf seçmek için galeri iznine ihtiyaç var.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (result.canceled) return;

    const newItems = result.assets.map(asset => ({
      tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      uri: asset.uri,
      percent: 0,
      task: null as any,
      asset,
    }));
    setPending(prev => [...prev, ...newItems.map(({ asset: _a, ...rest }) => rest)]);

    for (const item of newItems) {
      if (cancelledRef.current.has(item.tempId)) continue;
      try {
        const ext = (item.asset.uri.split('.').pop() ?? 'jpg').toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const dosyaAdi = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { uploadUrl, key } = await getUploadUrl(ilanId, dosyaAdi, mimeType);
        if (cancelledRef.current.has(item.tempId)) continue;

        const task = FileSystem.createUploadTask(
          uploadUrl,
          item.asset.uri,
          {
            httpMethod: 'PUT',
            headers: { 'Content-Type': mimeType },
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          },
          (data) => {
            const p = data.totalBytesExpectedToSend > 0
              ? Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 90)
              : 0;
            setPending(prev => prev.map(it => it.tempId === item.tempId ? { ...it, percent: Math.min(90, p) } : it));
          }
        );
        setPending(prev => prev.map(p => p.tempId === item.tempId ? { ...p, task } : p));

        const uploadResult = await task.uploadAsync();
        if (cancelledRef.current.has(item.tempId)) continue;
        if (!uploadResult || uploadResult.status !== 200) throw new Error('Upload başarısız');

        setPending(prev => prev.map(it => it.tempId === item.tempId ? { ...it, percent: 95 } : it));

        let isFirst = false;
        setFotograflar(prev => {
          isFirst = prev.length === 0;
          return [...prev, key];
        });
        setFotograflarPreview(prev => [...prev, item.asset.uri]);
        await optimizePhoto(key, isFirst);
        setPending(prev => prev.filter(p => p.tempId !== item.tempId));
      } catch (e) {
        if (!cancelledRef.current.has(item.tempId)) console.error('Fotoğraf hatası:', e);
        setPending(prev => prev.filter(p => p.tempId !== item.tempId));
      }
    }
    cancelledRef.current.clear();
  }

  async function handleKaydet(taslak = false) {
    if (fotoYukleniyor) {
      Alert.alert('Bekleyin', 'Fotoğraflar henüz yükleniyor, lütfen bekleyin.');
      return;
    }
    setSubmitted(true);
    const eksik = !baslik || !fiyat || !il || !musteriAciklamasi || secilenKategoriler.length === 0 ||
      (!arsaTarla && (!brutM2 || !binaYasi)) ||
      (!banyoNetOdaOpsiyonel && (!banyoSayisi || !netM2 || !odaSayisi));
    if (eksik) {
      Alert.alert('Eksik Bilgi', 'Lütfen zorunlu (*) alanları doldurun.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('ilanlar').insert({
      id: ilanId,
      portfoy_no: portfoyNo || null,
      baslik,
      fiyat: parseFloat(fiyat.replace(/\./g, '')),
      konum: il,
      ilce: ilce || null,
      mahalle: mahalle || null,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      musteri_lat: (musteriKonumAktif && musteriLat) ? parseFloat(musteriLat) : null,
      musteri_lng: (musteriKonumAktif && musteriLng) ? parseFloat(musteriLng) : null,
      metrekare: netM2 ? parseFloat(netM2) : null,
      oda_sayisi: odaSayisi || null,
      tip, kategori: secilenKategoriler.join(', '),
      aciklama: aciklama || null,
      musteri_aciklamasi: musteriAciklamasi || null,
      bina_yasi: binaYasi || null,
      banyo_sayisi: banyoSayisi ? parseInt(banyoSayisi) : null,
      kat_sayisi: katSayisi || null,
      bulundugu_kat: bulunduguKat || null,
      fotograflar: fotograflar.length > 0 ? fotograflar : null,
      gizli_fotograflar: gizliFotograflar.length > 0 ? gizliFotograflar : null,
      musteri_gizle: musteriGizle,
    });
    if (!error && secilenOzellikler.length) {
      const rows = secilenOzellikler.map(oid => ({ ilan_id: ilanId, ozellik_id: oid }));
      const { error: jErr } = await supabase.from('ilan_ozellikler').insert(rows);
      if (jErr) { Alert.alert('Özellik kaydı hatası', jErr.message); setLoading(false); return; }
    }
    if (error) {
      Alert.alert('Hata', error.message);
    } else if (taslak) {
      Alert.alert('Kaydedildi', 'Taslak kaydedildi', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } else {
      const mesaj = `🏠 *${baslik}*\n💰 ₺${fiyat}\n📍 ${il}${ilce ? `, ${ilce}` : ''}${mahalle ? `, ${mahalle}` : ''}${aciklama ? `\n\n${aciklama}` : ''}`;
      Alert.alert('İlan Yayınlandı', 'İlanınız başarıyla oluşturuldu.', [
        { text: 'Tamam', onPress: () => router.back() },
        {
          text: 'WhatsApp\'ta Paylaş',
          onPress: () => {
            Linking.openURL(`whatsapp://send?text=${encodeURIComponent(mesaj)}`).catch(() => {
              Alert.alert('WhatsApp bulunamadı', 'Cihazınızda WhatsApp yüklü değil.');
            });
            router.back();
          },
        },
      ]);
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.kapat}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>İlan Ekle</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Fotoğraflar */}
          <FormGroup label="Fotoğraflar">
            <FotoGridSortable
              fotograflar={fotograflar}
              gizliFotograflar={gizliFotograflar}
              pending={pending.map(({ tempId, uri, percent }) => ({ tempId, uri, percent }))}
              renderImage={(_key, i) => (
                <Image source={{ uri: fotograflarPreview[i] }} style={{ width: '100%', height: '100%' }} />
              )}
              onReorder={(from, to) => {
                setFotograflar(prev => { const a = [...prev]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; });
                setFotograflarPreview(prev => { const a = [...prev]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; });
              }}
              onSilTekli={(key, i) => {
                setFotograflar(prev => prev.filter((_, j) => j !== i));
                setFotograflarPreview(prev => prev.filter((_, j) => j !== i));
                setGizliFotograflar(prev => prev.filter(k => k !== key));
              }}
              onTopluSil={(keys) => {
                const setK = new Set(keys);
                const idxs = new Set<number>();
                fotograflar.forEach((k, i) => { if (setK.has(k)) idxs.add(i); });
                setFotograflar(prev => prev.filter((_, i) => !idxs.has(i)));
                setFotograflarPreview(prev => prev.filter((_, i) => !idxs.has(i)));
                setGizliFotograflar(prev => prev.filter(k => !setK.has(k)));
              }}
              onGizleToggle={(key) => {
                setGizliFotograflar(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
              }}
              onEkle={fotografSec}
              onCancelUpload={cancelUpload}
            />
          </FormGroup>

          {/* Portföy No */}
          <FormGroup label="Portföy No">
            <TextInput
              style={[styles.input, { color: portfoyNo ? Colors.primary : Colors.outlineVariant, fontWeight: portfoyNo ? '700' : '400' }]}
              value={portfoyNo}
              placeholder="—"
              editable={false}
              placeholderTextColor={Colors.outlineVariant}
            />
          </FormGroup>

          {/* Başlık */}
          <FormGroup label="İlan Başlığı *">
            <TextInput
              style={[styles.input, submitted && !baslik && styles.inputErr]}
              placeholder="Örn: Beşiktaş'ta Modern Daire"
              value={baslik}
              onChangeText={setBaslik}
              placeholderTextColor={Colors.outlineVariant}
            />
          </FormGroup>

          {/* Tip */}
          <FormGroup label="İlan Tipi *">
            <View style={styles.chipRow}>
              {tipler.map(t => (
                <TouchableOpacity key={t} style={[styles.chip, tip === t && styles.chipActive]} onPress={() => setTip(t)}>
                  <Text style={[styles.chipText, tip === t && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormGroup>

          {/* Kategori */}
          <FormGroup label="Kategori *">
            <View style={styles.chipRow}>
              {kategoriler.map(k => {
                const aktif = secilenKategoriler.includes(k);
                return (
                  <TouchableOpacity key={k} style={[styles.chip, aktif && styles.chipActive]} onPress={() => setSecilenKategoriler(prev => aktif ? prev.filter(x => x !== k) : [...prev, k])}>
                    <Text style={[styles.chipText, aktif && styles.chipTextActive]}>{k}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormGroup>

          {/* Fiyat */}
          <FormGroup label="Fiyat (₺) *">
            <View style={[styles.inputRow, submitted && !fiyat && styles.inputErr, { borderRadius: 12 }]}>
              <Text style={styles.inputPrefix}>₺</Text>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="0"
                value={fiyat}
                onChangeText={v => setFiyat(formatFiyat(v))}
                keyboardType="numeric"
                placeholderTextColor={Colors.outlineVariant}
              />
            </View>
          </FormGroup>

          {/* Konum */}
          <FormGroup label="Konum *">
            <View style={styles.satir}>
              <TouchableOpacity style={[styles.selectBtn, { flex: 1 }]} onPress={() => setIlModal(true)}>
                <Text style={il ? styles.selectText : styles.selectPlaceholder}>{il || 'İl Seç'}</Text>
                <Text style={styles.selectArrow}>▾</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectBtn, { flex: 1 }, !il && styles.selectBtnDisabled]}
                onPress={() => il && setIlceModal(true)}
              >
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

          {/* Metrekare */}
          <FormGroup label={arsaTarla ? 'Metrekare' : 'Metrekare *'}>
            <View style={styles.satir}>
              <View style={[styles.m2Kutu, { flex: 1 }]}>
                <TextInput
                  style={[styles.input, { flex: 1 }, submitted && !banyoNetOdaOpsiyonel && !netM2 && styles.inputErr]}
                  placeholder="0"
                  value={netM2}
                  onChangeText={setNetM2}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.outlineVariant}
                />
                <View style={styles.m2Etiket}><Text style={styles.m2EtiketText}>NET m²</Text></View>
              </View>
              <View style={[styles.m2Kutu, { flex: 1 }]}>
                <TextInput
                  style={[styles.input, { flex: 1 }, submitted && !arsaTarla && !brutM2 && styles.inputErr]}
                  placeholder="0"
                  value={brutM2}
                  onChangeText={setBrutM2}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.outlineVariant}
                />
                <View style={styles.m2Etiket}><Text style={styles.m2EtiketText}>BRÜT m²</Text></View>
              </View>
            </View>
          </FormGroup>

          {/* Banyo Sayısı */}
          <FormGroup label={banyoNetOdaOpsiyonel ? 'Banyo Sayısı' : 'Banyo Sayısı *'}>
            <View style={[styles.chipRow, submitted && !banyoNetOdaOpsiyonel && !banyoSayisi && styles.chipRowErr]}>
              {['1', '2', '3', '4', '5+'].map(b => (
                <TouchableOpacity key={b} style={[styles.chip, banyoSayisi === b && styles.chipActive]} onPress={() => setBanyoSayisi(b)}>
                  <Text style={[styles.chipText, banyoSayisi === b && styles.chipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormGroup>

          {/* Oda Sayısı */}
          <FormGroup label={banyoNetOdaOpsiyonel ? 'Oda Sayısı' : 'Oda Sayısı *'}>
            <TouchableOpacity
              style={[styles.selectBtn, submitted && !banyoNetOdaOpsiyonel && !odaSayisi && { borderWidth: 1.5, borderColor: '#E53935' }]}
              onPress={() => setOdaModal(true)}
            >
              <Text style={odaSayisi ? styles.selectText : styles.selectPlaceholder}>{odaSayisi || 'Oda Sayısı Seç'}</Text>
              <Text style={styles.selectArrow}>▾</Text>
            </TouchableOpacity>
          </FormGroup>

          {/* Açıklama */}
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
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Kendi notlarınız (müşteri görmez)..."
                  value={aciklama}
                  onChangeText={setAciklama}
                  multiline
                  numberOfLines={4}
                  placeholderTextColor={Colors.outlineVariant}
                  textAlignVertical="top"
                />
                {submitted && !musteriAciklamasi && (
                  <Text style={styles.errText}>Müşteri açıklaması zorunludur.</Text>
                )}
              </>
            ) : (
              <TextInput
                style={[styles.input, styles.textarea, submitted && !musteriAciklamasi && styles.inputErr]}
                placeholder="Müşteriye gösterilecek açıklama..."
                value={musteriAciklamasi}
                onChangeText={setMusteriAciklamasi}
                multiline
                numberOfLines={4}
                placeholderTextColor={Colors.outlineVariant}
                textAlignVertical="top"
              />
            )}
          </FormGroup>

          {/* Bina Yaşı */}
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

          {!arsaTarla && (
            <>
              <FormGroup label="Kat Sayısı">
                <TouchableOpacity style={styles.selectBtn} onPress={() => setKatModal(true)}>
                  <Text style={katSayisi ? styles.selectText : styles.selectPlaceholder}>{katSayisi || 'Kat Sayısı Seç'}</Text>
                  <Text style={styles.selectArrow}>▾</Text>
                </TouchableOpacity>
              </FormGroup>

              <FormGroup label="Bulunduğu Kat">
                <TouchableOpacity style={styles.selectBtn} onPress={() => setBulunduguKatModal(true)}>
                  <Text style={bulunduguKat ? styles.selectText : styles.selectPlaceholder}>{bulunduguKat || 'Bulunduğu Kat Seç'}</Text>
                  <Text style={styles.selectArrow}>▾</Text>
                </TouchableOpacity>
              </FormGroup>
            </>
          )}

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

          {/* Özellikler */}
          {tumOzellikler.length > 0 && (
            <FormGroup label="Özellikler">
              <View style={styles.chipRow}>
                {tumOzellikler.map(oz => {
                  const secili = secilenOzellikler.includes(oz.id);
                  return (
                    <TouchableOpacity
                      key={oz.id}
                      style={[styles.chip, secili && styles.chipActive]}
                      onPress={() => setSecilenOzellikler(prev =>
                        secili ? prev.filter(x => x !== oz.id) : [...prev, oz.id]
                      )}
                    >
                      <Text style={[styles.chipText, secili && styles.chipTextActive]}>{oz.ad}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FormGroup>
          )}

          {/* Konum (Harita) */}
          <FormGroup label="Harita Konumu (opsiyonel)" rightElement={
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
            <TouchableOpacity style={styles.mapPickerBtn} onPress={() => setMapPickerVisible(true)}>
              <Text style={styles.mapPickerIcon}>📍</Text>
              <Text style={styles.mapPickerText}>
                {lat && lng
                  ? `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`
                  : 'Haritadan konum seç'}
              </Text>
              {lat && lng && (
                <TouchableOpacity onPress={() => { setLat(''); setLng(''); }}>
                  <Text style={styles.mapPickerClear}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </FormGroup>

          {musteriKonumAktif && (
            <FormGroup label="Müşteri Konumu">
              <TouchableOpacity style={styles.mapPickerBtn} onPress={() => setMusteriMapPickerVisible(true)}>
                <Text style={styles.mapPickerIcon}>🏠</Text>
                <Text style={styles.mapPickerText}>
                  {musteriLat && musteriLng
                    ? `${parseFloat(musteriLat).toFixed(5)}, ${parseFloat(musteriLng).toFixed(5)}`
                    : 'Müşteri konumunu seç'}
                </Text>
                {musteriLat && musteriLng && (
                  <TouchableOpacity onPress={() => { setMusteriLat(''); setMusteriLng(''); }}>
                    <Text style={styles.mapPickerClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </FormGroup>
          )}

          {/* Butonlar */}
          {fotoYukleniyor && (
            <View style={styles.yuklemeUyari}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.yuklemeUyariText}>Fotoğraflar yükleniyor...</Text>
            </View>
          )}
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.yayinBtn, (loading || fotoYukleniyor) && styles.btnDisabled]} onPress={() => handleKaydet(false)} disabled={loading || fotoYukleniyor}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.yayinText}>Yayınla</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* İl Modal */}
      <SelectModal
        visible={ilModal}
        onClose={() => { setIlModal(false); setIlSearch(''); }}
        title="İl Seçin"
        search={ilSearch}
        onSearch={setIlSearch}
        data={ilListesi}
        onSelect={v => { setIl(v); setIlce(''); setMahalle(''); setIlSearch(''); setIlModal(false); }}
        selected={il}
      />

      {/* İlçe Modal */}
      <SelectModal
        visible={ilceModal}
        onClose={() => { setIlceModal(false); setIlceSearch(''); }}
        title="İlçe Seçin"
        search={ilceSearch}
        onSearch={setIlceSearch}
        data={ilceListesi}
        onSelect={v => { setIlce(v); setMahalle(''); setIlceSearch(''); setIlceModal(false); }}
        selected={ilce}
      />

      {/* Mahalle Modal */}
      <SelectModal
        visible={mahalleModal}
        onClose={() => { setMahalleModal(false); setMahalleSearch(''); }}
        title="Mahalle Seçin"
        search={mahalleSearch}
        onSearch={setMahalleSearch}
        groupedData={mahalleGruplar}
        onSelect={v => { setMahalle(v); setMahalleSearch(''); setMahalleModal(false); }}
        selected={mahalle}
      />

      {/* Harita Picker */}
      <MapPickerModal
        visible={mapPickerVisible}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(la, ln) => { setLat(la.toString()); setLng(ln.toString()); }}
        initLat={lat ? parseFloat(lat) : (mahalle || ilce || il ? undefined : mapInitLat)}
        initLng={lng ? parseFloat(lng) : (mahalle || ilce || il ? undefined : mapInitLng)}
        il={il}
        ilce={ilce}
        mahalle={mahalle}
      />

      {/* Müşteri Harita Picker */}
      <MapPickerModal
        visible={musteriMapPickerVisible}
        onClose={() => setMusteriMapPickerVisible(false)}
        onConfirm={(la, ln) => { setMusteriLat(la.toString()); setMusteriLng(ln.toString()); }}
        initLat={musteriLat ? parseFloat(musteriLat) : (lat ? parseFloat(lat) : (mahalle || ilce || il ? undefined : mapInitLat))}
        initLng={musteriLng ? parseFloat(musteriLng) : (lng ? parseFloat(lng) : (mahalle || ilce || il ? undefined : mapInitLng))}
        il={il}
        ilce={ilce}
        mahalle={mahalle}
      />

      {/* Oda Sayısı Modal */}
      <Modal visible={odaModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Oda Sayısı Seçin</Text>
            <View style={styles.chipRow}>
              {ODALAR.map(o => (
                <TouchableOpacity
                  key={o}
                  style={[styles.chip, odaSayisi === o && styles.chipActive]}
                  onPress={() => { setOdaSayisi(o); setOdaModal(false); }}
                >
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

      <Modal visible={katModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Kat Sayısı Seçin</Text>
            <View style={styles.chipRow}>
              {KAT_SAYILARI.map(k => (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, katSayisi === k && styles.chipActive]}
                  onPress={() => { setKatSayisi(katSayisi === k ? '' : k); setKatModal(false); }}
                >
                  <Text style={[styles.chipText, katSayisi === k && styles.chipTextActive]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalKapat} onPress={() => setKatModal(false)}>
              <Text style={styles.modalKapatText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={bulunduguKatModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Bulunduğu Kat Seçin</Text>
            <View style={styles.chipRow}>
              {BULUNDUGU_KATLAR.map(k => (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, bulunduguKat === k && styles.chipActive]}
                  onPress={() => { setBulunduguKat(bulunduguKat === k ? '' : k); setBulunduguKatModal(false); }}
                >
                  <Text style={[styles.chipText, bulunduguKat === k && styles.chipTextActive]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalKapat} onPress={() => setBulunduguKatModal(false)}>
              <Text style={styles.modalKapatText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SelectModal({ visible, onClose, title, search, onSearch, data, groupedData, onSelect, selected }: {
  visible: boolean; onClose: () => void; title: string;
  search: string; onSearch: (v: string) => void;
  data?: string[];
  groupedData?: { semt: string | null; mahalleler: string[] }[];
  onSelect: (v: string) => void; selected: string;
}) {
  const sections = groupedData?.map((g, idx) => ({
    title: g.semt ?? '',
    showHeader: g.semt !== null,
    data: g.mahalleler,
    key: g.semt ?? `__null_${idx}`,
  })) ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TextInput
              style={[styles.input, { marginBottom: Spacing.md }]}
              placeholder="Ara..."
              value={search}
              onChangeText={onSearch}
              placeholderTextColor={Colors.outlineVariant}
              autoFocus={false}
            />
            {groupedData ? (
              <SectionList
                sections={sections}
                keyExtractor={(item, index) => `${item}-${index}`}
                keyboardShouldPersistTaps="handled"
                stickySectionHeadersEnabled
                renderSectionHeader={({ section }: any) => section.showHeader ? (
                  <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>{section.title}</Text></View>
                ) : null}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.modalItem} onPress={() => onSelect(item)}>
                    <Text style={[styles.modalItemText, selected === item && styles.modalItemTextActive]}>{item}</Text>
                    {selected === item && <Text style={{ color: Colors.primary }}>✓</Text>}
                  </TouchableOpacity>
                )}
              />
            ) : (
              <FlatList
                data={data ?? []}
                keyExtractor={item => item}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.modalItem} onPress={() => onSelect(item)}>
                    <Text style={[styles.modalItemText, selected === item && styles.modalItemTextActive]}>{item}</Text>
                    {selected === item && <Text style={{ color: Colors.primary }}>✓</Text>}
                  </TouchableOpacity>
                )}
              />
            )}
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
  scroll: { padding: Spacing.xl, paddingBottom: 48, gap: Spacing.lg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  kapat: { fontSize: 20, color: Colors.onSurface },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },

  formGroup: { gap: 8 },
  label: {
    fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant,
  },
  input: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.onSurface,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  aciklamaTabRow: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, padding: 3, marginBottom: Spacing.sm },
  aciklamaTab: { flex: 1, paddingVertical: 7, borderRadius: Radius.full, alignItems: 'center' },
  aciklamaTabAktif: { backgroundColor: Colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  aciklamaTabText: { fontSize: 13, fontWeight: '500', color: Colors.onSurfaceVariant },
  aciklamaTabTextAktif: { color: Colors.onSurface, fontWeight: '700' },
  row: { flexDirection: 'row', gap: Spacing.sm },
  mapPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
  },
  mapPickerIcon: { fontSize: 16 },
  mapPickerText: { flex: 1, fontSize: 15, color: Colors.onSurface },
  mapPickerClear: { fontSize: 14, color: Colors.onSurfaceVariant, paddingHorizontal: 4 },
  musteriKonumToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  musteriKonumLabel: { fontSize: 11, color: Colors.onSurfaceVariant, fontWeight: '500' },
  tikBox: { width: 17, height: 17, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center' },
  tikBoxAktif: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tikIsaret: { fontSize: 11, color: '#fff', fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputPrefix: { fontSize: 18, color: Colors.onSurfaceVariant, marginRight: 6 },
  satir: { flexDirection: 'row', gap: Spacing.sm },

  selectBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
  },
  selectBtnDisabled: { opacity: 0.4 },
  selectText: { fontSize: 15, color: Colors.onSurface },
  selectPlaceholder: { fontSize: 15, color: Colors.outlineVariant },
  selectArrow: { fontSize: 12, color: Colors.onSurfaceVariant },

  m2Kutu: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  m2Etiket: {
    backgroundColor: Colors.surfaceContainerHigh, borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 6,
  },
  m2EtiketText: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant },

  inputErr: { borderWidth: 1.5, borderColor: '#E53935' },
  chipRowErr: { borderWidth: 1.5, borderColor: '#E53935', borderRadius: 10, padding: 6 },
  errText: { fontSize: 12, color: '#E53935', marginTop: 4, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.surfaceContainerLow,
  },
  chipActive: { backgroundColor: Colors.primaryFixed },
  chipText: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  chipTextActive: { color: Colors.primary, fontWeight: '600' },

  fotoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  fotoKutu: { width: 80, height: 80, borderRadius: Radius.lg, overflow: 'hidden' },
  fotoImage: { width: '100%', height: '100%' },
  fotoSil: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.full,
    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  fotoSilText: { color: '#fff', fontSize: 10 },
  fotoGoz: {
    position: 'absolute', top: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.full,
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
  },
  fotoGozText: { fontSize: 11 },
  gizliOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  gizliOverlayText: { fontSize: 28 },
  fotoEkle: {
    width: 80, height: 80, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.outlineVariant, borderStyle: 'dashed',
  },
  fotoEkleIcon: { fontSize: 22, color: Colors.primary },
  fotoEkleText: { fontSize: 10, color: Colors.onSurfaceVariant, marginTop: 2 },
  fotoPendingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fotoPendingPct: { fontSize: 14, color: Colors.onSurface, fontWeight: '700' },
  fotoSiraBadge: {
    position: 'absolute', top: 4, left: '50%', marginLeft: -10,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  fotoSiraBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  kapakBadge: { position: 'absolute', bottom: 20, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center' },
  kapakText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  fotoSiraRow: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.45)' },
  fotoSiraBtn: { paddingHorizontal: 6, paddingVertical: 1 },
  fotoSiraBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  gizleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: Spacing.lg, gap: 12 },
  gizleAlt: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  taslakBtn: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.full, paddingVertical: 16, alignItems: 'center',
  },
  taslakText: { color: Colors.onSurface, fontWeight: '600', fontSize: 14 },
  yayinBtn: {
    flex: 2, backgroundColor: Colors.primary,
    borderRadius: Radius.full, paddingVertical: 16, alignItems: 'center',
  },
  yayinText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  yuklemeUyari: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.primaryFixed, borderRadius: Radius.lg, padding: Spacing.md },
  yuklemeUyariText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    padding: Spacing.xl, gap: Spacing.sm,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.onSurface, marginBottom: 4 },
  modalItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  modalItemText: { fontSize: 15, color: Colors.onSurface },
  modalItemTextActive: { color: Colors.primary, fontWeight: '600' },
  sectionHeader: {
    backgroundColor: Colors.surfaceContainerLow,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: Radius.sm,
  },
  sectionHeaderText: { fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalKapat: {
    marginTop: Spacing.md, backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.full, paddingVertical: 14, alignItems: 'center',
  },
  modalKapatText: { color: Colors.onSurface, fontWeight: '600' },
});
