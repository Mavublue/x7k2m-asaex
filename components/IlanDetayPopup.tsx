import { useEffect, useState } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Spacing } from '../constants/theme';
import R2Image from './R2Image';
import type { Ilan } from '../types';

type Props = { ilanId: string | null; onClose: () => void };

const W = Dimensions.get('window').width;
const IMG_H = Math.round((W - 32) * 0.66);

export default function IlanDetayPopup({ ilanId, onClose }: Props) {
  const [ilan, setIlan] = useState<Ilan | null>(null);
  const [ozellikler, setOzellikler] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [aktif, setAktif] = useState(0);

  useEffect(() => {
    if (!ilanId) { setIlan(null); setOzellikler([]); setAktif(0); return; }
    setLoading(true);
    setAktif(0);
    (async () => {
      const { data } = await supabase.from('ilanlar').select('*').eq('id', ilanId).single();
      if (data) setIlan(data as Ilan);
      const { data: ozData } = await supabase
        .from('ilan_ozellikler')
        .select('ozellikler!inner(ad)')
        .eq('ilan_id', ilanId);
      setOzellikler((ozData ?? []).map((r: any) => r.ozellikler?.ad).filter(Boolean));
      setLoading(false);
    })();
  }, [ilanId]);

  const fotolar = ilan?.fotograflar ?? [];

  return (
    <Modal visible={!!ilanId} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle} numberOfLines={1}>
            İlan Detayı{ilan?.portfoy_no ? ` • ${ilan.portfoy_no}` : ''}
          </Text>
          <TouchableOpacity onPress={onClose} style={s.kapatBtn}>
            <Text style={s.kapatText}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : !ilan ? (
          <View style={s.center}><Text style={s.bos}>İlan bulunamadı.</Text></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}>
            {fotolar.length > 0 && (
              <View style={{ marginBottom: Spacing.lg }}>
                <FlatList
                  data={fotolar}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={e => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / (W - 32));
                    setAktif(idx);
                  }}
                  keyExtractor={(_, i) => String(i)}
                  renderItem={({ item }) => (
                    <View style={{ width: W - 32, height: IMG_H, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.surfaceContainerLow }}>
                      <R2Image source={item} style={{ width: W - 32, height: IMG_H }} size="lg" />
                    </View>
                  )}
                />
                {fotolar.length > 1 && (
                  <View style={s.dotRow}>
                    {fotolar.map((_, i) => (
                      <View key={i} style={[s.dot, i === aktif && s.dotAktif]} />
                    ))}
                  </View>
                )}
              </View>
            )}

            <Text style={s.baslik}>{ilan.baslik}</Text>
            <Text style={s.lokasyon}>
              {[ilan.konum, ilan.ilce, ilan.mahalle].filter(Boolean).join(' / ')}
            </Text>
            <Text style={s.fiyat}>{Number(ilan.fiyat).toLocaleString('tr-TR')} ₺</Text>

            <View style={s.bilgiGrid}>
              {ilan.oda_sayisi && <Bilgi e="Oda" d={ilan.oda_sayisi} />}
              {ilan.metrekare && <Bilgi e="Net" d={`${ilan.metrekare} m²`} />}
              {ilan.brut_metrekare && <Bilgi e="Brüt" d={`${ilan.brut_metrekare} m²`} />}
              {ilan.bina_yasi && <Bilgi e="Bina Yaşı" d={String(ilan.bina_yasi)} />}
              {ilan.kat_sayisi && <Bilgi e="Kat Sayısı" d={String(ilan.kat_sayisi)} />}
              {ilan.bulundugu_kat && <Bilgi e="Bulunduğu Kat" d={String(ilan.bulundugu_kat)} />}
              {ilan.banyo_sayisi != null && <Bilgi e="Banyo" d={String(ilan.banyo_sayisi)} />}
              {ilan.kategori && <Bilgi e="Kategori" d={ilan.kategori} />}
            </View>

            {ozellikler.length > 0 && (
              <View style={{ marginTop: Spacing.lg }}>
                <Text style={s.sectionLabel}>ÖZELLİKLER</Text>
                <View style={s.chipRow}>
                  {ozellikler.map(o => (
                    <View key={o} style={s.chip}>
                      <Text style={s.chipText}>{o}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {ilan.aciklama && (
              <View style={{ marginTop: Spacing.lg }}>
                <Text style={s.sectionLabel}>AÇIKLAMA</Text>
                <Text style={s.aciklama}>{ilan.aciklama}</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Bilgi({ e, d }: { e: string; d: string }) {
  return (
    <View style={s.bilgiKart}>
      <Text style={s.bilgiE}>{e}</Text>
      <Text style={s.bilgiD}>{d}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  headerTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  kapatBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  kapatText: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bos: { fontSize: 14, color: Colors.outlineVariant },
  baslik: { fontSize: 17, fontWeight: '700', color: Colors.onSurface, marginBottom: 4 },
  lokasyon: { fontSize: 13, color: Colors.onSurfaceVariant, marginBottom: 10 },
  fiyat: { fontSize: 22, fontWeight: '800', color: Colors.primary, marginBottom: 14 },
  bilgiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bilgiKart: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8, minWidth: 100, borderWidth: 1, borderColor: Colors.surfaceContainerLow },
  bilgiE: { fontSize: 10, fontWeight: '700', color: Colors.outlineVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  bilgiD: { fontSize: 13, fontWeight: '600', color: Colors.onSurface, marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant, letterSpacing: 0.5, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: Colors.surfaceContainerLow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, color: Colors.onSurface, fontWeight: '500' },
  aciklama: { fontSize: 13, color: Colors.onSurface, lineHeight: 20 },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.outlineVariant },
  dotAktif: { backgroundColor: Colors.primary, width: 18 },
});
