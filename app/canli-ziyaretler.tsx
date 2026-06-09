import { useEffect, useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Spacing } from '../constants/theme';
import R2Image from '../components/R2Image';

type CanliRow = {
  device_id: string;
  son_aktif_at: string;
  ilk_giris_at: string;
  toplam_sure_sn: number;
  acilis_sayisi: number;
  user_agent: string | null;
  paket_token: string | null;
  ilan_id: string | null;
  musteri_id: string;
  musteri_ad: string | null;
  musteri_soyad: string | null;
  ilan_baslik: string | null;
  ilan_portfoy_no: string | null;
  ilan_fotograf: string | null;
  paket_baslik: string | null;
  paket_ilan_sayisi: number | null;
};

function sonAktifText(iso: string): { canli: boolean; text: string } {
  const ms = Date.now() - new Date(iso).getTime();
  const sn = Math.floor(ms / 1000);
  if (sn < 15) return { canli: true, text: 'Şu an bakıyor' };
  const dk = Math.floor(sn / 60);
  if (dk < 60) return { canli: false, text: `${dk} dk önce` };
  const sa = Math.floor(dk / 60);
  if (sa < 24) return { canli: false, text: `${sa} sa önce` };
  return { canli: false, text: `${Math.floor(sa / 24)} gün önce` };
}

function formatSure(sn: number): string {
  if (sn < 60) return `${sn} sn`;
  const dk = Math.floor(sn / 60);
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  const kdk = dk % 60;
  return kdk > 0 ? `${sa} sa ${kdk} dk` : `${sa} sa`;
}

function cihazAdi(ua: string | null): string {
  if (!ua) return 'Bilinmeyen cihaz';
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
  else if (/Chrome\//i.test(ua)) br = 'Chrome';
  else if (/Firefox\//i.test(ua)) br = 'Firefox';
  else if (/Safari\//i.test(ua)) br = 'Safari';
  return br ? `${os} · ${br}` : os;
}

export default function CanliZiyaretlerScreen() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CanliRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRows([]); setLoading(false); return; }
    const { data, error } = await supabase.rpc('get_canli_ziyaretler', { p_emlakci_id: user.id });
    if (!error && Array.isArray(data)) setRows(data as CanliRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useFocusEffect(useCallback(() => {
    fetchData();
    timerRef.current = setInterval(() => {
      fetchData();
      setTick(t => t + 1);
    }, 8000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const canliRows = rows.filter(r => sonAktifText(r.son_aktif_at).canli);
  const benzersizCihaz = new Set(canliRows.map(r => r.device_id)).size;
  const benzersizMusteri = new Set(canliRows.map(r => r.musteri_id)).size;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🟢 Anlık Ziyaretler</Text>
          <Text style={styles.subtitle}>{benzersizMusteri} müşteri · {benzersizCihaz} cihaz şu an bakıyor</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {canliRows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👀</Text>
            <Text style={styles.emptyText}>Şu an portföyüne bakan kimse yok.</Text>
            <Text style={styles.emptyHint}>Müşterilere link paylaştığında, buradan kimin baktığını canlı görebilirsin.</Text>
          </View>
        ) : (
          canliRows.map(r => {
            const sa = sonAktifText(r.son_aktif_at);
            const adSoyad = [r.musteri_ad, r.musteri_soyad].filter(Boolean).join(' ') || 'İsimsiz';
            const isPaket = !!r.paket_token;
            return (
              <TouchableOpacity
                key={`${r.device_id}-${r.musteri_id}-${r.ilan_id ?? r.paket_token}`}
                style={styles.kart}
                onPress={() => router.push(`/musteri/${r.musteri_id}` as any)}
              >
                <View style={styles.kartHeader}>
                  <View style={styles.canliDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.musteriAd}>{adSoyad}</Text>
                    <Text style={styles.musteriSub}>{cihazAdi(r.user_agent)} · {sa.text}</Text>
                  </View>
                  <View style={styles.chipGreen}>
                    <Text style={styles.chipGreenText}>🟢 Canlı</Text>
                  </View>
                </View>

                <View style={styles.icerikRow}>
                  {isPaket ? (
                    <>
                      <View style={styles.paketIcon}><Text style={{ fontSize: 22 }}>📋</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.chipRow}>
                          <View style={styles.chipAmber}><Text style={styles.chipAmberText}>Liste</Text></View>
                          {r.paket_ilan_sayisi ? <Text style={styles.ilanSayiText}>{r.paket_ilan_sayisi} ilan</Text> : null}
                        </View>
                        <Text numberOfLines={1} style={styles.baslik}>{r.paket_baslik || 'Liste paylaşımı'}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      {r.ilan_fotograf ? (
                        <R2Image source={r.ilan_fotograf} style={{ width: 56, height: 46, borderRadius: 6 } as any} resizeMode="cover" size="sm" />
                      ) : (
                        <View style={styles.placeholderFoto}><Text>🏠</Text></View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.chipRow}>
                          <View style={styles.chipBlue}><Text style={styles.chipBlueText}>Tek İlan</Text></View>
                          {r.ilan_portfoy_no ? <View style={styles.chipRed}><Text style={styles.chipRedText}>#{r.ilan_portfoy_no}</Text></View> : null}
                        </View>
                        <Text numberOfLines={1} style={styles.baslik}>{r.ilan_baslik || 'İlan'}</Text>
                      </View>
                    </>
                  )}
                </View>

                <View style={styles.alt}>
                  <Text style={styles.altText}>⏱️ Toplam {formatSure(r.toplam_sure_sn)}</Text>
                  {r.acilis_sayisi > 1 ? <Text style={styles.altText}>· {r.acilis_sayisi} oturum</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 28, color: Colors.onSurface, lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '800', color: Colors.onSurface },
  subtitle: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  scroll: { padding: Spacing.lg, gap: 10, paddingBottom: 32 },
  empty: { alignItems: 'center', paddingVertical: 64, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, fontWeight: '700', color: Colors.onSurface, textAlign: 'center' },
  emptyHint: { fontSize: 12, color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32 },
  kart: {
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)',
    borderRadius: Radius.lg, padding: 12, gap: 10,
  },
  kartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  canliDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
  musteriAd: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  musteriSub: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 1 },
  chipGreen: { backgroundColor: 'rgba(34,197,94,0.22)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  chipGreenText: { fontSize: 10, fontWeight: '800', color: '#86efac' },
  icerikRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  paketIcon: {
    width: 56, height: 46, borderRadius: 6,
    backgroundColor: 'rgba(245,158,11,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  placeholderFoto: { width: 56, height: 46, borderRadius: 6, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' },
  chipBlue: { backgroundColor: 'rgba(59,130,246,0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chipBlueText: { fontSize: 9, fontWeight: '700', color: '#93c5fd' },
  chipAmber: { backgroundColor: 'rgba(245,158,11,0.22)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chipAmberText: { fontSize: 9, fontWeight: '700', color: '#fcd34d' },
  chipRed: { backgroundColor: 'rgba(229,57,53,0.18)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  chipRedText: { fontSize: 9, fontWeight: '700', color: '#fca5a5' },
  ilanSayiText: { fontSize: 10, color: Colors.onSurfaceVariant, fontWeight: '600' },
  baslik: { fontSize: 13, fontWeight: '600', color: Colors.onSurface },
  alt: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  altText: { fontSize: 11, color: Colors.onSurfaceVariant },
});
