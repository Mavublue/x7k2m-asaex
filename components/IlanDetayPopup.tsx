import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Spacing } from '../constants/theme';
import R2Image from './R2Image';
import type { Ilan } from '../types';

const R2_BASE = process.env.EXPO_PUBLIC_R2_PUBLIC_URL!;
function mdUrl(key: string) {
  if (!key) return '';
  if (key.startsWith('http')) return key;
  const dot = key.lastIndexOf('.');
  return `${R2_BASE}/${key.slice(0, dot)}_md.jpg`;
}

type Props = { ilanId: string | null; onClose: () => void };

const W = Dimensions.get('window').width;
const IMG_W = W - 32;
const IMG_H = Math.round(IMG_W * 0.66);

export default function IlanDetayPopup({ ilanId, onClose }: Props) {
  const [ilan, setIlan] = useState<Ilan | null>(null);
  const [ozellikler, setOzellikler] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [aktif, setAktif] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!ilanId) { setIlan(null); setOzellikler([]); setAktif(0); return; }
    setLoading(true);
    setAktif(0);
    (async () => {
      const { data } = await supabase.from('ilanlar').select('*').eq('id', ilanId).single();
      if (data) {
        setIlan(data as Ilan);
        const fotos = (data.fotograflar ?? []).slice(0, 3) as string[];
        if (fotos.length) ExpoImage.prefetch(fotos.map(mdUrl), 'disk');
      }
      const { data: ozData } = await supabase
        .from('ilan_ozellikler')
        .select('ozellikler!inner(ad)')
        .eq('ilan_id', ilanId);
      setOzellikler((ozData ?? []).map((r: any) => r.ozellikler?.ad).filter(Boolean));
      setLoading(false);
    })();
  }, [ilanId]);

  const fotolar = ilan?.fotograflar ?? [];
  const lokasyon = ilan ? [ilan.mahalle, ilan.ilce, ilan.konum].filter(Boolean).join(', ') : '';

  function prev() {
    if (fotolar.length <= 1) return;
    const yeni = (aktif - 1 + fotolar.length) % fotolar.length;
    setAktif(yeni);
    listRef.current?.scrollToIndex({ index: yeni, animated: true });
  }
  function next() {
    if (fotolar.length <= 1) return;
    const yeni = (aktif + 1) % fotolar.length;
    setAktif(yeni);
    listRef.current?.scrollToIndex({ index: yeni, animated: true });
  }

  const detaylar = ilan ? [
    ilan.portfoy_no && { l: 'Portföy No', v: ilan.portfoy_no },
    ilan.kategori && { l: 'Kategori', v: ilan.kategori },
    ilan.tip && { l: 'Tip', v: ilan.tip },
    ilan.metrekare && { l: 'Net m²', v: `${ilan.metrekare} m²` },
    ilan.brut_metrekare && { l: 'Brüt m²', v: `${ilan.brut_metrekare} m²` },
    ilan.oda_sayisi && { l: 'Oda Sayısı', v: ilan.oda_sayisi },
    ilan.banyo_sayisi != null && Number(ilan.banyo_sayisi) > 0 && { l: 'Banyo Sayısı', v: String(ilan.banyo_sayisi) },
    ilan.bina_yasi && { l: 'Bina Yaşı', v: String(ilan.bina_yasi) },
    ilan.kat_sayisi && { l: 'Kat Sayısı', v: String(ilan.kat_sayisi) },
    ilan.bulundugu_kat && { l: 'Bulunduğu Kat', v: String(ilan.bulundugu_kat) },
    lokasyon && { l: 'Konum', v: lokasyon },
  ].filter(Boolean) as { l: string; v: string }[] : [];

  return (
    <Modal visible={!!ilanId} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle} numberOfLines={1}>
            İlan Detayı{ilan?.portfoy_no ? ` • ${ilan.portfoy_no}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {ilan && (
              <TouchableOpacity
                onPress={() => { onClose(); router.push(`/ilan/${ilan.id}` as any); }}
                style={s.gitBtn}
              >
                <Text style={s.gitBtnText}>İlana Git →</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={s.kapatBtn}>
              <Text style={s.kapatText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : !ilan ? (
          <View style={s.center}><Text style={s.bos}>İlan bulunamadı.</Text></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}>
            {fotolar.length > 0 && (
              <View style={{ marginBottom: Spacing.lg }}>
                <View style={{ position: 'relative', width: IMG_W, height: IMG_H, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#1a1b21' }}>
                  <FlatList
                    ref={listRef}
                    data={fotolar}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={e => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / IMG_W);
                      setAktif(idx);
                    }}
                    keyExtractor={(_, i) => String(i)}
                    getItemLayout={(_, i) => ({ length: IMG_W, offset: IMG_W * i, index: i })}
                    renderItem={({ item }) => (
                      <View style={{ width: IMG_W, height: IMG_H }}>
                        <R2Image source={item} style={{ width: IMG_W, height: IMG_H }} size="md" />
                      </View>
                    )}
                  />
                  {fotolar.length > 1 && (
                    <>
                      <TouchableOpacity onPress={prev} style={[s.fotoOk, { left: 10 }]} hitSlop={10}>
                        <Text style={s.fotoOkText}>‹</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={next} style={[s.fotoOk, { right: 10 }]} hitSlop={10}>
                        <Text style={s.fotoOkText}>›</Text>
                      </TouchableOpacity>
                      <View style={s.fotoSayac}>
                        <Text style={s.fotoSayacText}>{aktif + 1} / {fotolar.length}</Text>
                      </View>
                    </>
                  )}
                </View>
                {fotolar.length > 1 && (
                  <View style={s.dotRow}>
                    {fotolar.map((_, i) => (
                      <View key={i} style={[s.dot, i === aktif && s.dotAktif]} />
                    ))}
                  </View>
                )}
              </View>
            )}

            {ilan.tip && (
              <View style={s.tipBadge}>
                <Text style={s.tipBadgeText}>{ilan.tip.toUpperCase()}</Text>
              </View>
            )}
            <Text style={s.baslik}>{ilan.baslik}</Text>
            {lokasyon && <Text style={s.lokasyon}>📍 {lokasyon}</Text>}
            <Text style={s.fiyat}>{Number(ilan.fiyat).toLocaleString('tr-TR')} ₺</Text>

            {detaylar.length > 0 && (
              <View style={s.detayKart}>
                {detaylar.map(({ l, v }, i) => (
                  <View key={l} style={[s.detayRow, i < detaylar.length - 1 && s.detayRowSinir]}>
                    <Text style={s.detayL}>{l}</Text>
                    <Text style={s.detayV}>{v}</Text>
                  </View>
                ))}
              </View>
            )}

            {ozellikler.length > 0 && (
              <View style={s.kart}>
                <Text style={s.sectionLabel}>ÖZELLİKLER</Text>
                <View style={s.chipRow}>
                  {ozellikler.map(o => (
                    <View key={o} style={s.chip}>
                      <Text style={s.chipText}>✓ {o}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {ilan.musteri_aciklamasi && (
              <View style={s.kart}>
                <Text style={s.sectionLabel}>MÜŞTERİYE GÖSTERİLEN AÇIKLAMA</Text>
                <Text style={s.aciklama}>{ilan.musteri_aciklamasi}</Text>
              </View>
            )}

            {ilan.aciklama && (
              <View style={s.notKart}>
                <Text style={s.notLabel}>📝 NOTLAR (SADECE SEN GÖRÜYORSUN)</Text>
                <Text style={s.notText}>{ilan.aciklama}</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  headerTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  gitBtn: { backgroundColor: Colors.primary, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  gitBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  kapatBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  kapatText: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bos: { fontSize: 14, color: Colors.outlineVariant },

  fotoOk: {
    position: 'absolute', top: '50%', marginTop: -22,
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  fotoOkText: { color: '#fff', fontSize: 26, fontWeight: '700', lineHeight: 28 },
  fotoSayac: {
    position: 'absolute', bottom: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  fotoSayacText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.outlineVariant },
  dotAktif: { backgroundColor: Colors.primary, width: 18 },

  tipBadge: { alignSelf: 'flex-start', backgroundColor: '#1a1b21', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 },
  tipBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  baslik: { fontSize: 19, fontWeight: '700', color: Colors.onSurface, marginBottom: 4, lineHeight: 26 },
  lokasyon: { fontSize: 13, color: Colors.onSurfaceVariant, marginBottom: 10 },
  fiyat: { fontSize: 22, fontWeight: '700', color: Colors.onSurface, marginBottom: 14 },

  detayKart: {
    backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1.5,
    borderRadius: Radius.lg, paddingHorizontal: 14, marginBottom: Spacing.md,
  },
  detayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, gap: 16 },
  detayRowSinir: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)' },
  detayL: { fontSize: 13, fontWeight: '700', color: '#1a1b21' },
  detayV: { fontSize: 13, color: '#4b5563', flex: 1, textAlign: 'right' },

  kart: {
    backgroundColor: '#fff', borderColor: Colors.surfaceContainerLow, borderWidth: 1,
    borderRadius: Radius.lg, padding: 14, marginBottom: Spacing.md,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant, letterSpacing: 0.5, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#f0f9f4', borderColor: '#bbf7d0', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { fontSize: 12, color: '#15803d', fontWeight: '600' },
  aciklama: { fontSize: 13, color: '#374151', lineHeight: 22 },

  notKart: {
    backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1,
    borderRadius: Radius.lg, padding: 14, marginBottom: Spacing.md,
  },
  notLabel: { fontSize: 11, fontWeight: '700', color: '#92400e', letterSpacing: 0.5, marginBottom: 8 },
  notText: { fontSize: 13, color: '#451a03', lineHeight: 22 },
});
