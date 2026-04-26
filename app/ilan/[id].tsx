import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator, Alert,
  FlatList, Dimensions, Linking, Modal, TextInput, Platform, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { deleteIlanPhotos } from '../../lib/r2';

const R2_BASE = process.env.EXPO_PUBLIC_R2_PUBLIC_URL!;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import R2Image from '../../components/R2Image';
import { Ilan } from '../../types';

function buildDetayMapHtml(lat: number, lng: number) {
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
var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OSM'}).addTo(map);
var icon=L.divIcon({html:'<div style="font-size:30px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">🏠</div>',className:'',iconSize:[32,32],iconAnchor:[16,28]});
L.marker([${lat},${lng}],{icon:icon}).addTo(map);
</script></body></html>`;
}

export default function IlanDetayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const flatListRef = useRef<any>(null);
  const [otomatikMusteriler, setOtomatikMusteriler] = useState<any[]>([]);

  const fetchIlan = useCallback(() => {
    supabase.from('ilanlar').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setIlan(data);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    fetchIlan();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiller').select('telefon').eq('id', user.id).single().then(({ data }) => {
          if (data?.telefon) setTelefon(data.telefon);
        });
      }
    });
  }, [id]);
  useFocusEffect(fetchIlan);

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
      const dosyaAdi = `ilan_${id}_${index + 1}.jpg`;
      const localUri = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory) + dosyaAdi;
      const result = await FileSystem.downloadAsync(url, localUri);
      if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
      await MediaLibrary.saveToLibraryAsync(result.uri);
      Alert.alert('İndirildi', `Fotoğraf ${index + 1} galeriye kaydedildi.`);
    } catch (e: any) {
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
    Alert.alert('İndiriliyor', `${fotograflar.length} fotoğraf indiriliyor...`);
    let basarili = 0;
    let ilkHata = '';
    for (let i = 0; i < fotograflar.length; i++) {
      try {
        const dotIdx = fotograflar[i].lastIndexOf('.');
        const lgKey = fotograflar[i].slice(0, dotIdx) + '_lg.jpg';
        const url = `${R2_BASE}/${lgKey}`;
        const localUri = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory) + `ilan_${id}_${i + 1}.jpg`;
        const result = await FileSystem.downloadAsync(url, localUri);
        console.log(`[indirme] foto ${i} status:`, result.status, result.uri);
        if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
        await MediaLibrary.saveToLibraryAsync(result.uri);
        basarili++;
      } catch (e: any) {
        if (!ilkHata) ilkHata = e?.message ?? String(e);
        console.error(`[indirme] foto ${i}:`, e);
      }
    }
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
      const [il, ilce, mah] = m.tercih_konum.split(' / ').map((p: string) => p.trim());
      if (mah) {
        if (il && ilan!.konum?.toLowerCase() !== il.toLowerCase()) return false;
        if (ilce && ilan!.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
        if (!ilan!.mahalle?.toLowerCase().includes(mah.toLowerCase())) return false;
      } else {
        if (il && ilan!.konum?.toLowerCase() !== il.toLowerCase()) return false;
        if (ilce && ilan!.ilce?.toLowerCase() !== ilce.toLowerCase()) return false;
      }
    }
    return true;
  }

  async function linkModalAc() {
    setLinkSeciliMusteri('');
    setLinkMusteriAra('');
    setLinkEtiketAra('');
    setLinkUrl(null);
    setLinkSaat('24');
    const { data } = await supabase.from('musteriler').select('id, ad, soyad, etiketler').eq('durum', 'Aktif').order('ad');
    if (data) setLinkMusteriler(data);
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
    { label: 'Metrekare', deger: ilan.metrekare ? `${ilan.metrekare} m²` : null },
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
                onMomentumScrollEnd={e => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  setAktifFoto(index);
                }}
                renderItem={({ item }) => {
                  const gizli = (ilan.gizli_fotograflar ?? []).includes(item);
                  return (
                    <View>
                      <R2Image source={item} style={styles.anaFoto} resizeMode="cover" />
                      {gizli && (
                        <View style={styles.gizliBadge}>
                          <Text style={styles.gizliBadgeText}>🚫 Müşteriye gizli</Text>
                        </View>
                      )}
                    </View>
                  );
                }}
              />
              {fotograflar.length > 1 && (
                <View style={styles.thumbRowWrap}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
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
                <Text style={styles.ozellikLabel}>m²</Text>
              </View>
            )}
            {ilan.oda_sayisi && (
              <View style={styles.ozellikKart}>
                <Text style={styles.ozellikEmoji}>🚪</Text>
                <Text style={styles.ozellikDeger}>{ilan.oda_sayisi}</Text>
                <Text style={styles.ozellikLabel}>Oda</Text>
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

          {/* Harita */}
          {ilan.lat && ilan.lng ? (
            <View style={styles.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Konum</Text>
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
              <View style={styles.mapBox}>
                <WebView
                  source={{ html: buildDetayMapHtml(ilan.lat, ilan.lng) }}
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
                return `${m.ad} ${m.soyad}`.toLowerCase().includes(q) ||
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
                      `${item.ad} ${item.soyad} ile eşleştirilsin mi?`,
                      [
                        { text: 'İptal', style: 'cancel' },
                        { text: 'Eşleştir', onPress: () => handleEsles(item.id, `${item.ad} ${item.soyad}`) },
                      ]
                    );
                  }}
                  disabled={eslesYukleniyor}
                >
                  <View style={styles.musteriAvatar}>
                    <Text style={styles.musteriAvatarText}>{item.ad?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.musteriAd}>{item.ad} {item.soyad}</Text>
                    {item.telefon && <Text style={styles.musteriTelefon}>{item.telefon}</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {item.etiketler ? <View style={styles.etiketBadge}><Text style={styles.etiketBadgeText}>#{item.etiketler}</Text></View> : null}
                    <View style={[styles.durumBadge, {
                      backgroundColor: item.durum === 'Aktif' ? '#dcfce7' : item.durum === 'Beklemede' ? '#fef9c3' : '#fee2e2'
                    }]}>
                      <Text style={[styles.durumBadgeText, {
                        color: item.durum === 'Aktif' ? '#166534' : item.durum === 'Beklemede' ? '#854d0e' : '#991b1b'
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
            {fotograflar.length > 0 && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={tumFotograflariIndir}>
                  <Text style={styles.menuItemText}>⬇️  Fotoğrafları İndir ({fotograflar.length})</Text>
                </TouchableOpacity>
                <View style={styles.menuSep} />
              </>
            )}
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
            <View style={styles.modalPanel}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setLinkModal(false)}>
                  <Text style={styles.modalKapat}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.modalBaslik}>🔗 Link Paylaş</Text>
                <View style={{ width: 32 }} />
              </View>

              {!linkUrl ? (
                <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
                  {/* Müşteri seç */}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.onSurface, marginBottom: 6 }}>Müşteri Seç</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                    <TextInput
                      value={linkMusteriAra}
                      onChangeText={t => { setLinkMusteriAra(t); setLinkSeciliMusteri(''); }}
                      placeholder="İsim ara..."
                      placeholderTextColor={Colors.onSurfaceVariant}
                      style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, color: Colors.onSurface }}
                    />
                    <TextInput
                      value={linkEtiketAra}
                      onChangeText={t => { setLinkEtiketAra(t); setLinkSeciliMusteri(''); }}
                      placeholder="Etiket ara..."
                      placeholderTextColor={Colors.onSurfaceVariant}
                      style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, color: Colors.onSurface }}
                    />
                  </View>
                  {(linkMusteriAra || linkEtiketAra) && (
                    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, maxHeight: 160, marginBottom: 8 }}>
                      {linkMusteriler.filter(m => {
                        const isimEsles = !linkMusteriAra || `${m.ad} ${m.soyad}`.toLowerCase().includes(linkMusteriAra.toLowerCase());
                        const etiketEsles = !linkEtiketAra || (m.etiketler ?? '').toLowerCase().includes(linkEtiketAra.toLowerCase());
                        return isimEsles && etiketEsles;
                      }).length === 0
                        ? <Text style={{ padding: 12, fontSize: 13, color: Colors.onSurfaceVariant }}>Bulunamadı</Text>
                        : linkMusteriler.filter(m => {
                            const isimEsles = !linkMusteriAra || `${m.ad} ${m.soyad}`.toLowerCase().includes(linkMusteriAra.toLowerCase());
                            const etiketEsles = !linkEtiketAra || (m.etiketler ?? '').toLowerCase().includes(linkEtiketAra.toLowerCase());
                            return isimEsles && etiketEsles;
                          }).map(m => (
                            <TouchableOpacity key={m.id} onPress={() => { setLinkSeciliMusteri(m.id); setLinkMusteriAra(`${m.ad} ${m.soyad}`); setLinkEtiketAra(''); }}
                              style={{ padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: linkSeciliMusteri === m.id ? 'rgba(229,57,53,0.06)' : '#fff' }}>
                              <Text style={{ fontSize: 13, fontWeight: linkSeciliMusteri === m.id ? '600' : '400', color: linkSeciliMusteri === m.id ? Colors.primary : Colors.onSurface }}>
                                {m.ad} {m.soyad}
                              </Text>
                              {m.etiketler && (
                                <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', flexShrink: 1, justifyContent: 'flex-end' }}>
                                  {m.etiketler.split(',').map((e: string) => e.trim()).filter(Boolean).map((e: string) => (
                                    <Text key={e} style={{ fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, backgroundColor: 'rgba(229,57,53,0.08)', color: Colors.primary, fontWeight: '600' }}>{e}</Text>
                                  ))}
                                </View>
                              )}
                            </TouchableOpacity>
                          ))
                      }
                    </View>
                  )}
                  {linkSeciliMusteri ? (
                    <Text style={{ fontSize: 12, color: '#3aaa6e', fontWeight: '600', marginBottom: 12 }}>
                      ✓ {linkMusteriler.find(m => m.id === linkSeciliMusteri)?.ad} {linkMusteriler.find(m => m.id === linkSeciliMusteri)?.soyad} seçildi
                    </Text>
                  ) : <View style={{ marginBottom: 12 }} />}

                  {/* Süre */}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.onSurface, marginBottom: 8 }}>Ne kadar aktif olsun?</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[{ s: 1, label: '1 saat' }, { s: 24, label: '1 gün' }, { s: 72, label: '3 gün' }, { s: 168, label: '7 gün' }].map(({ s, label }) => (
                      <TouchableOpacity key={s} onPress={() => setLinkSaat(String(s))} style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 1.5,
                        borderColor: linkSaat === String(s) ? Colors.primary : '#e5e7eb',
                        backgroundColor: linkSaat === String(s) ? 'rgba(229,57,53,0.08)' : '#fff',
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
                      style={{ width: 72, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14, textAlign: 'center', color: Colors.onSurface }}
                    />
                    <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant }}>saat</Text>
                    {parseInt(linkSaat) >= 24 && <Text style={{ fontSize: 12, color: '#9ca3af' }}>({Math.round(parseInt(linkSaat) / 24)} gün)</Text>}
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
                  <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: '#374151' }} selectable>{linkUrl}</Text>
                  </View>
                  <TouchableOpacity onPress={linkKopyala} style={{
                    backgroundColor: linkKopyalandi ? '#3aaa6e' : Colors.primary,
                    borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 8,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                      {linkKopyalandi ? '✓ Kopyalandı!' : 'Kopyala'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setLinkUrl(null); setLinkSaat('24'); setLinkSeciliMusteri(''); setLinkMusteriAra(''); setLinkEtiketAra(''); }} style={{
                    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, alignItems: 'center',
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
                    <Text style={styles.musteriAd}>{item.ad} {item.soyad}</Text>
                    {(item.butce_min || item.butce_max) && (
                      <Text style={styles.musteriTelefon}>
                        {item.butce_min ? `₺${Number(item.butce_min).toLocaleString('tr-TR')}` : '—'}
                        {' – '}
                        {item.butce_max ? `₺${Number(item.butce_max).toLocaleString('tr-TR')}` : '—'}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.durumBadge, {
                    backgroundColor: item.durum === 'Aktif' ? '#dcfce7' : item.durum === 'Beklemede' ? '#fef9c3' : '#fee2e2'
                  }]}>
                    <Text style={[styles.durumBadgeText, {
                      color: item.durum === 'Aktif' ? '#166534' : item.durum === 'Beklemede' ? '#854d0e' : '#991b1b'
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
