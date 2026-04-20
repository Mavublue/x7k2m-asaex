import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Modal, FlatList,
  Image, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { getUploadUrl, optimizePhoto } from '../../lib/r2';
import { Colors, Radius, Spacing } from '../../constants/theme';
import MapPickerModal from '../../components/MapPickerModal';
import { TURKIYE, IL_LISTESI, MAHALLELER } from '../../constants/turkiye';

const ILLER = TURKIYE;

const ODALAR_KUCUK = ['Stüdyo', '1+0', '1+1', '2+1', '3+1'];
const BINA_YASLARI = ['0', '1', '2', '3', '4', '5', '6-10', '11-15', '16-20', '21-25', '+30'];
const ODALAR_BUYUK = ['3+2', '4+1', '4+2', '5+1', '5+2', '6+1', '6+2', '7+'];
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
  const [kategori, setKategori] = useState('Daire');
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
  const [tumOzellikler, setTumOzellikler] = useState<{id: string; ad: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [ilanId] = useState(() => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const [fotograflar, setFotograflar] = useState<string[]>([]);
  const [fotograflarPreview, setFotograflarPreview] = useState<string[]>([]);
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from('profiller').select('calisma_bolgesi').eq('id', user.id).single();
      if (data?.calisma_bolgesi) {
        const koord = IL_KOORDINAT[data.calisma_bolgesi];
        if (koord) { setMapInitLat(koord[0]); setMapInitLng(koord[1]); }
      }
    })();
  }, []);

  const arsaTarla = kategori === 'Arsa' || kategori === 'Tarla';
  const ilListesi = IL_LISTESI.filter(i => i.toLowerCase().includes(ilSearch.toLowerCase()));
  const ilceListesi = (ILLER[il] ?? []).slice().sort((a, b) => a.localeCompare(b, 'tr')).filter(i => i.toLowerCase().includes(ilceSearch.toLowerCase()));
  const mahalleListesi = ((MAHALLELER as any)[il]?.[ilce] ?? []).slice().sort((a: string, b: string) => a.localeCompare(b, 'tr')).filter((m: string) => m.toLowerCase().includes(mahalleSearch.toLowerCase()));

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

    setFotoYukleniyor(true);
    const keys: string[] = [];
    const previews: string[] = [];
    for (const asset of result.assets) {
      try {
        const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const dosyaAdi = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { uploadUrl, key } = await getUploadUrl(ilanId, dosyaAdi, mimeType);

        const uploadResult = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
          httpMethod: 'PUT',
          headers: { 'Content-Type': mimeType },
        });

        if (uploadResult.status !== 200) throw new Error('Upload başarısız');

        const isFirst = fotograflar.length + keys.length === 0;
        optimizePhoto(key, isFirst);
        keys.push(key);
        previews.push(asset.uri);
      } catch (e) {
        console.error('Fotoğraf hatası:', e);
      }
    }
    setFotograflar(prev => [...prev, ...keys]);
    setFotograflarPreview(prev => [...prev, ...previews]);
    setFotoYukleniyor(false);
  }

  async function handleKaydet(taslak = false) {
    if (fotoYukleniyor) {
      Alert.alert('Bekleyin', 'Fotoğraflar henüz yükleniyor, lütfen bekleyin.');
      return;
    }
    setSubmitted(true);
    const eksik = !baslik || !fiyat || !il || !musteriAciklamasi || !banyoSayisi ||
      (!arsaTarla && (!netM2 || !brutM2 || !odaSayisi || !binaYasi));
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
      tip, kategori,
      aciklama: aciklama || null,
      musteri_aciklamasi: musteriAciklamasi || null,
      bina_yasi: binaYasi || null,
      banyo_sayisi: banyoSayisi ? parseInt(banyoSayisi) : null,
      ozellikler: secilenOzellikler.length ? secilenOzellikler.join(',') : null,
      fotograflar: fotograflar.length > 0 ? fotograflar : null,
    });
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
            <View style={styles.fotoGrid}>
              {fotograflarPreview.map((url, i) => (
                <View key={i} style={styles.fotoKutu}>
                  <Image source={{ uri: url }} style={styles.fotoImage} />
                  <TouchableOpacity
                    style={styles.fotoSil}
                    onPress={() => {
                      setFotograflar(fotograflar.filter((_, j) => j !== i));
                      setFotograflarPreview(fotograflarPreview.filter((_, j) => j !== i));
                    }}
                  >
                    <Text style={styles.fotoSilText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.fotoEkle} onPress={fotografSec} disabled={fotoYukleniyor}>
                {fotoYukleniyor
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <>
                      <Text style={styles.fotoEkleIcon}>＋</Text>
                      <Text style={styles.fotoEkleText}>Ekle</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          </FormGroup>

          {/* Portföy No */}
          <FormGroup label="Portföy No">
            <TextInput
              style={styles.input}
              placeholder="Örn: 2024-001"
              value={portfoyNo}
              onChangeText={setPortfoyNo}
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
              {kategoriler.map(k => (
                <TouchableOpacity key={k} style={[styles.chip, kategori === k && styles.chipActive]} onPress={() => setKategori(k)}>
                  <Text style={[styles.chipText, kategori === k && styles.chipTextActive]}>{k}</Text>
                </TouchableOpacity>
              ))}
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
                  style={[styles.input, { flex: 1 }, submitted && !arsaTarla && !netM2 && styles.inputErr]}
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
          <FormGroup label="Banyo Sayısı *">
            <View style={[styles.chipRow, submitted && !banyoSayisi && styles.chipRowErr]}>
              {['1', '2', '3', '4', '5+'].map(b => (
                <TouchableOpacity key={b} style={[styles.chip, banyoSayisi === b && styles.chipActive]} onPress={() => setBanyoSayisi(b)}>
                  <Text style={[styles.chipText, banyoSayisi === b && styles.chipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormGroup>

          {/* Oda Sayısı */}
          <FormGroup label={arsaTarla ? 'Oda Sayısı' : 'Oda Sayısı *'}>
            <View style={[styles.chipRow, submitted && !arsaTarla && !odaSayisi && styles.chipRowErr]}>
              {ODALAR_KUCUK.map(o => (
                <TouchableOpacity key={o} style={[styles.chip, odaSayisi === o && styles.chipActive]} onPress={() => setOdaSayisi(o)}>
                  <Text style={[styles.chipText, odaSayisi === o && styles.chipTextActive]}>{o}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.chip, ODALAR_BUYUK.includes(odaSayisi) && styles.chipActive]}
                onPress={() => setOdaModal(true)}
              >
                <Text style={[styles.chipText, ODALAR_BUYUK.includes(odaSayisi) && styles.chipTextActive]}>
                  {ODALAR_BUYUK.includes(odaSayisi) ? odaSayisi : 'Daha fazla ▾'}
                </Text>
              </TouchableOpacity>
            </View>
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

          {/* Özellikler */}
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
        data={mahalleListesi}
        onSelect={v => { setMahalle(v); setMahalleSearch(''); setMahalleModal(false); }}
        selected={mahalle}
      />

      {/* Harita Picker */}
      <MapPickerModal
        visible={mapPickerVisible}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(la, ln) => { setLat(la.toString()); setLng(ln.toString()); }}
        initLat={lat ? parseFloat(lat) : mapInitLat}
        initLng={lng ? parseFloat(lng) : mapInitLng}
      />

      {/* Müşteri Harita Picker */}
      <MapPickerModal
        visible={musteriMapPickerVisible}
        onClose={() => setMusteriMapPickerVisible(false)}
        onConfirm={(la, ln) => { setMusteriLat(la.toString()); setMusteriLng(ln.toString()); }}
        initLat={musteriLat ? parseFloat(musteriLat) : (lat ? parseFloat(lat) : mapInitLat)}
        initLng={musteriLng ? parseFloat(musteriLng) : (lng ? parseFloat(lng) : mapInitLng)}
      />

      {/* Büyük Oda Modal */}
      <Modal visible={odaModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Oda Sayısı Seçin</Text>
            <View style={styles.chipRow}>
              {ODALAR_BUYUK.map(o => (
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
            <TextInput
              style={[styles.input, { marginBottom: Spacing.md }]}
              placeholder="Ara..."
              value={search}
              onChangeText={onSearch}
              placeholderTextColor={Colors.outlineVariant}
              autoFocus={false}
            />
            <FlatList
              data={data}
              keyExtractor={item => item}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => onSelect(item)}>
                  <Text style={[styles.modalItemText, selected === item && styles.modalItemTextActive]}>{item}</Text>
                  {selected === item && <Text style={{ color: Colors.primary }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
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
  fotoEkle: {
    width: 80, height: 80, borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.outlineVariant, borderStyle: 'dashed',
  },
  fotoEkleIcon: { fontSize: 22, color: Colors.primary },
  fotoEkleText: { fontSize: 10, color: Colors.onSurfaceVariant, marginTop: 2 },

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
  modalKapat: {
    marginTop: Spacing.md, backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.full, paddingVertical: 14, alignItems: 'center',
  },
  modalKapatText: { color: Colors.onSurface, fontWeight: '600' },
});
