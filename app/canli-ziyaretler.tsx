import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Dimensions,
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
  musteri_etiket: string | null;
  ilan_baslik: string | null;
  ilan_portfoy_no: string | null;
  ilan_fotograf: string | null;
  paket_baslik: string | null;
  paket_ilan_sayisi: number | null;
};

type OturumRow = {
  device_id: string;
  baslama_at: string;
  son_aktif_at: string;
  user_agent: string | null;
  paket_token: string | null;
  ilan_id: string | null;
  musteri_id: string;
  musteri_ad: string | null;
  musteri_soyad: string | null;
  musteri_etiket: string | null;
  ilan_baslik: string | null;
  ilan_portfoy_no: string | null;
  ilan_fotograf: string | null;
  paket_baslik: string | null;
  paket_ilan_sayisi: number | null;
};

function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

function saatLabel(t: number): { time: string; date: string } {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` };
}

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

const PERIODS = [
  { h: 1, label: '1 sa' },
  { h: 6, label: '6 sa' },
  { h: 24, label: '24 sa' },
  { h: 168, label: '7 gün' },
  { h: 1176, label: '7 hafta' },
] as const;
type PeriodH = typeof PERIODS[number]['h'];

export default function CanliZiyaretlerScreen() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CanliRow[]>([]);
  const [oturumlari, setOturumlari] = useState<OturumRow[]>([]);
  const [timelinePeriod, setTimelinePeriodRaw] = useState<PeriodH>(6);
  const [selectedMusteriId, setSelectedMusteriId] = useState<string | null>(null);
  const setTimelinePeriod = useCallback((p: PeriodH) => { setTimelinePeriodRaw(p); setSelectedMusteriId(null); }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (period: PeriodH) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRows([]); setOturumlari([]); setLoading(false); return; }
    const [{ data: canli }, { data: otu }] = await Promise.all([
      supabase.rpc('get_canli_ziyaretler', { p_emlakci_id: user.id }),
      supabase.rpc('get_canli_oturumlari', { p_emlakci_id: user.id, p_son_saat: period }),
    ]);
    if (Array.isArray(canli)) setRows(canli as CanliRow[]);
    if (Array.isArray(otu)) setOturumlari(otu as OturumRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(timelinePeriod); }, [fetchData, timelinePeriod]);
  useFocusEffect(useCallback(() => {
    fetchData(timelinePeriod);
    timerRef.current = setInterval(() => {
      fetchData(timelinePeriod);
      setTick(t => t + 1);
    }, 8000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData, timelinePeriod]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(timelinePeriod);
    setRefreshing(false);
  }, [fetchData, timelinePeriod]);

  const canliRowsAll = rows.filter(r => sonAktifText(r.son_aktif_at).canli);
  const canliRows = selectedMusteriId ? canliRowsAll.filter(r => r.musteri_id === selectedMusteriId) : canliRowsAll;
  const benzersizCihaz = new Set(canliRows.map(r => r.device_id)).size;
  const benzersizMusteri = new Set(canliRows.map(r => r.musteri_id)).size;

  type PortfoyOzet = { key: string; isPaket: boolean; baslik: string; portfoy_no: string | null; fotograf: string | null; ilanId: string | null; ziyaretSayisi: number; toplamSn: number; sonAktifMs: number };
  type CihazOzet = { device_id: string; ua: string | null; oturumSayisi: number; toplamSn: number; sonAktifMs: number };
  type MusteriOzet = { id: string; ad: string; etiket: string | null; oturumSayisi: number; toplamSn: number; sonAktifMs: number; canli: boolean; portfoyler: PortfoyOzet[]; cihazlar: CihazOzet[] };
  const musteriOzet: MusteriOzet[] = (() => {
    const map = new Map<string, MusteriOzet & { _portMap: Map<string, PortfoyOzet>; _cihazMap: Map<string, CihazOzet> }>();
    for (const o of oturumlari) {
      const start = new Date(o.baslama_at).getTime();
      const end = new Date(o.son_aktif_at).getTime();
      const sn = Math.max(0, Math.floor((end - start) / 1000));
      const adSoyad = [o.musteri_ad, o.musteri_soyad].filter(Boolean).join(' ') || 'İsimsiz';
      const portKey = o.paket_token ? `paket:${o.paket_token}` : `ilan:${o.ilan_id}`;
      const portBaslik = o.paket_token ? (o.paket_baslik || 'Liste') : (o.ilan_baslik || 'İlan');
      const canli = sonAktifText(o.son_aktif_at).canli;
      let cur = map.get(o.musteri_id);
      if (!cur) {
        cur = { id: o.musteri_id, ad: adSoyad, etiket: o.musteri_etiket, oturumSayisi: 0, toplamSn: 0, sonAktifMs: 0, canli: false, portfoyler: [], cihazlar: [], _portMap: new Map(), _cihazMap: new Map() };
        map.set(o.musteri_id, cur);
      }
      cur.oturumSayisi++;
      cur.toplamSn += sn;
      if (end > cur.sonAktifMs) cur.sonAktifMs = end;
      if (canli) cur.canli = true;
      const pCur = cur._portMap.get(portKey);
      if (pCur) { pCur.ziyaretSayisi++; pCur.toplamSn += sn; if (end > pCur.sonAktifMs) pCur.sonAktifMs = end; }
      else cur._portMap.set(portKey, { key: portKey, isPaket: !!o.paket_token, baslik: portBaslik, portfoy_no: o.ilan_portfoy_no, fotograf: o.ilan_fotograf, ilanId: o.ilan_id, ziyaretSayisi: 1, toplamSn: sn, sonAktifMs: end });
      const cCur = cur._cihazMap.get(o.device_id);
      if (cCur) { cCur.oturumSayisi++; cCur.toplamSn += sn; if (end > cCur.sonAktifMs) cCur.sonAktifMs = end; }
      else cur._cihazMap.set(o.device_id, { device_id: o.device_id, ua: o.user_agent, oturumSayisi: 1, toplamSn: sn, sonAktifMs: end });
    }
    return Array.from(map.values()).map(m => {
      m.portfoyler = Array.from(m._portMap.values()).sort((a, b) => b.sonAktifMs - a.sonAktifMs);
      m.cihazlar = Array.from(m._cihazMap.values()).sort((a, b) => b.sonAktifMs - a.sonAktifMs);
      return m;
    }).sort((a, b) => b.sonAktifMs - a.sonAktifMs);
  })();

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
            const aktifOturum = oturumlari
              .filter(o => o.device_id === r.device_id && sonAktifText(o.son_aktif_at).canli)
              .sort((a, b) => new Date(b.baslama_at).getTime() - new Date(a.baslama_at).getTime())[0];
            const aktifSureSn = aktifOturum
              ? Math.max(1, Math.floor((Date.now() - new Date(aktifOturum.baslama_at).getTime()) / 1000))
              : null;
            return (
              <TouchableOpacity
                key={`${r.device_id}-${r.musteri_id}-${r.ilan_id ?? r.paket_token}`}
                style={[styles.kart, selectedMusteriId === r.musteri_id && { borderColor: colorFor(r.musteri_id), borderWidth: 2 }]}
                onPress={() => setSelectedMusteriId(selectedMusteriId === r.musteri_id ? null : r.musteri_id)}
              >
                <View style={styles.kartHeader}>
                  <View style={styles.canliDot} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.musteriAd}>{adSoyad}</Text>
                      {r.musteri_etiket ? (
                        <View style={styles.chipEtiket}>
                          <Text style={styles.chipEtiketText} numberOfLines={1}>{r.musteri_etiket}</Text>
                        </View>
                      ) : null}
                    </View>
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
                  <Text style={styles.altText}>
                    {aktifSureSn !== null ? `⏱️ ${formatSure(aktifSureSn)} dir bakıyor` : '⏱️ Şu an bakıyor'}
                  </Text>
                  {r.acilis_sayisi > 1 ? (
                    <Text style={[styles.altText, { color: Colors.outline }]}>
                      · geçmişte {r.acilis_sayisi} ziyaret · toplam {formatSure(r.toplam_sure_sn)}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <ZamanTuneli
          oturumlari={oturumlari}
          timelinePeriod={timelinePeriod}
          selectedMusteriId={selectedMusteriId}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.onSurface, flex: 1 }}>📁 Geçmiş Ziyaretler</Text>
          <View style={timelineStyles.periodGroup}>
            {PERIODS.map(p => (
              <TouchableOpacity key={p.h} onPress={() => setTimelinePeriod(p.h)} style={[timelineStyles.periodChip, timelinePeriod === p.h && timelineStyles.periodChipActive]}>
                <Text style={[timelineStyles.periodChipText, timelinePeriod === p.h && timelineStyles.periodChipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {musteriOzet.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant }}>
                👥 {musteriOzet.length} müşteri · {musteriOzet.reduce((a, m) => a + m.oturumSayisi, 0)} oturum
              </Text>
              {selectedMusteriId && (
                <TouchableOpacity onPress={() => setSelectedMusteriId(null)} style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.18)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#fca5a5' }}>✕ Filtreyi kaldır</Text>
                </TouchableOpacity>
              )}
            </View>
            {musteriOzet.map(m => {
              const c = colorFor(m.id);
              const active = selectedMusteriId === m.id;
              const dim = !!selectedMusteriId && !active;
              return (
                <TouchableOpacity key={m.id} onPress={() => setSelectedMusteriId(active ? null : m.id)} style={{
                  backgroundColor: Colors.surfaceContainerLow, borderWidth: 1.5,
                  borderColor: active ? c : Colors.outlineVariant, borderRadius: 10, padding: 10, opacity: dim ? 0.45 : 1, marginBottom: 8,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} />
                    {m.canli ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' }} /> : null}
                    <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.onSurface }}>{m.ad}</Text>
                    {m.etiket ? (
                      <View style={styles.chipEtiket}><Text style={styles.chipEtiketText} numberOfLines={1}>{m.etiket}</Text></View>
                    ) : null}
                  </View>
                  {m.cihazlar.length === 1 ? (
                    <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant, fontWeight: '600', marginBottom: 6 }}>
                      📱 1 cihaz · {cihazAdi(m.cihazlar[0].ua)} · {m.portfoyler.length} ilan · {formatSure(m.toplamSn)}
                    </Text>
                  ) : (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: Colors.onSurfaceVariant, fontWeight: '600' }}>
                        📱 {m.cihazlar.length} cihaz · {m.portfoyler.length} ilan · toplam {formatSure(m.toplamSn)}
                      </Text>
                      {m.cihazlar.map(d => (
                        <Text key={d.device_id} style={{ fontSize: 10, color: Colors.outline, marginTop: 2, marginLeft: 8 }}>
                          · {cihazAdi(d.ua)} → {formatSure(d.toplamSn)} ({d.oturumSayisi} oturum)
                        </Text>
                      ))}
                    </View>
                  )}
                  {m.portfoyler.map(p => (
                    <TouchableOpacity key={p.key}
                      onPress={(e: any) => { e?.stopPropagation?.(); if (!p.isPaket && p.ilanId) router.push(`/ilan/${p.ilanId}` as any); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 6, backgroundColor: Colors.surfaceContainerLowest, marginBottom: 4 }}>
                      {p.fotograf ? (
                        <R2Image source={p.fotograf} style={{ width: 36, height: 30, borderRadius: 4 } as any} resizeMode="cover" size="sm" />
                      ) : (
                        <View style={{ width: 36, height: 30, borderRadius: 4, backgroundColor: p.isPaket ? 'rgba(245,158,11,0.18)' : Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 16 }}>{p.isPaket ? '📋' : '🏠'}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <View style={p.isPaket ? styles.chipAmber : styles.chipBlue}>
                            <Text style={p.isPaket ? styles.chipAmberText : styles.chipBlueText}>{p.isPaket ? 'Liste' : 'İlan'}</Text>
                          </View>
                          {p.portfoy_no ? (
                            <View style={styles.chipRed}><Text style={styles.chipRedText}>#{p.portfoy_no}</Text></View>
                          ) : null}
                          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: Colors.onSurface, flexShrink: 1 }}>{p.baslik}</Text>
                        </View>
                        <Text style={{ fontSize: 10, color: Colors.onSurfaceVariant, marginTop: 1 }}>
                          {new Date(p.sonAktifMs).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {p.ziyaretSayisi} ziyaret · {formatSure(p.toplamSn)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <View style={{ padding: 20, alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: 10, borderWidth: 1, borderColor: Colors.outlineVariant }}>
            <Text style={{ fontSize: 12, color: Colors.outline }}>Bu zaman aralığında ziyaret yok.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ZamanTuneli({ oturumlari, timelinePeriod, selectedMusteriId }: {
  oturumlari: OturumRow[];
  timelinePeriod: PeriodH;
  selectedMusteriId: string | null;
}) {
  const nowMs = Date.now();
  const filterStart = nowMs - timelinePeriod * 3600 * 1000;
  const sortedAll = [...oturumlari]
    .filter(s => selectedMusteriId ? s.musteri_id === selectedMusteriId : true)
    .sort((a, b) => new Date(a.baslama_at).getTime() - new Date(b.baslama_at).getTime());
  const sorted = sortedAll.filter(s => new Date(s.son_aktif_at).getTime() >= filterStart && new Date(s.baslama_at).getTime() <= nowMs);

  let minT: number, maxT: number;
  if (sorted.length === 0) { minT = filterStart; maxT = nowMs; }
  else {
    const dataStart = Math.min(...sorted.map(s => new Date(s.baslama_at).getTime()));
    const dataEnd = Math.max(...sorted.map(s => new Date(s.son_aktif_at).getTime()));
    const hasActive = sorted.some(s => sonAktifText(s.son_aktif_at).canli);
    const displayEnd = hasActive ? Math.max(dataEnd, nowMs) : dataEnd;
    const span = Math.max(displayEnd - dataStart, 5 * 60_000);
    const buffer = Math.max(span * 0.05, 60_000);
    minT = dataStart - buffer; maxT = displayEnd + buffer;
  }
  const range = maxT - minT;

  const screenW = Dimensions.get('window').width;
  const chartW = Math.max(screenW - 48, Math.max(600, sorted.length * 60));
  const CARD_W = 160;
  const CARD_H = 56;
  const CONNECTOR_H = 14;
  const BAR_H = 16;
  const LANE_MIN_MS = Math.max(60_000, range * (CARD_W / chartW));

  const laneEnds: number[] = [];
  const sessionLanes: number[] = sorted.map(s => {
    const sStart = Math.max(new Date(s.baslama_at).getTime(), minT);
    const sEnd = Math.min(new Date(s.son_aktif_at).getTime(), maxT);
    const visualEnd = Math.max(sEnd, sStart + LANE_MIN_MS);
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= sStart) { laneEnds[i] = visualEnd; return i; }
    }
    laneEnds.push(visualEnd);
    return laneEnds.length - 1;
  });
  const laneCount = Math.max(1, laneEnds.length);
  const cardAreaH = laneCount * (CARD_H + 4);
  const chartH = cardAreaH + CONNECTOR_H + BAR_H + 4;

  const tickCount = timelinePeriod === 1 ? 6 : timelinePeriod === 6 ? 6 : timelinePeriod === 24 ? 8 : timelinePeriod === 168 ? 7 : 7;
  const ticks: number[] = [];
  for (let i = 0; i <= tickCount; i++) ticks.push(minT + (range * i) / tickCount);

  return (
    <View style={timelineStyles.kart}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        <Text style={timelineStyles.baslik}>📊 Zaman Çizelgesi</Text>
        <Text style={{ fontSize: 10, color: Colors.outline }}>🔄 8 sn'de bir güncellenir</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View style={{ width: chartW, paddingTop: 30, paddingBottom: 18 }}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28 }}>
            {ticks.map((t, i) => {
              const l = saatLabel(t);
              return (
                <View key={i} style={{ position: 'absolute', left: ((t - minT) / range) * chartW - 22, width: 44, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: Colors.onSurfaceVariant, fontWeight: '700' }}>{l.time}</Text>
                  <Text style={{ fontSize: 9, color: Colors.outline, fontWeight: '500' }}>{l.date}</Text>
                </View>
              );
            })}
          </View>

          <View style={{ position: 'relative', height: chartH, backgroundColor: Colors.surfaceContainerLow, borderRadius: 6, borderWidth: 1, borderColor: Colors.outlineVariant }}>
            {ticks.map((t, i) => (
              <View key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: ((t - minT) / range) * chartW, width: 1, backgroundColor: i === 0 || i === ticks.length - 1 ? Colors.outlineVariant : 'rgba(255,255,255,0.06)' }} />
            ))}
            {nowMs >= minT && nowMs <= maxT && (
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: ((nowMs - minT) / range) * chartW - 1, width: 2, backgroundColor: '#22c55e' }} />
            )}
            {sorted.map((s, idx) => {
              const sStartRaw = new Date(s.baslama_at).getTime();
              const sEndRaw = new Date(s.son_aktif_at).getTime();
              const sStart = Math.max(sStartRaw, minT);
              const sEnd = Math.min(sEndRaw, maxT);
              const sa = sonAktifText(s.son_aktif_at);
              const adSoyad = [s.musteri_ad, s.musteri_soyad].filter(Boolean).join(' ') || 'İsimsiz';
              const ilanLabel = s.paket_token ? (s.paket_baslik || 'Liste') : (s.ilan_baslik || 'İlan');
              const sureSn = Math.max(1, Math.floor((sEndRaw - sStartRaw) / 1000));
              const leftPx = ((sStart - minT) / range) * chartW;
              const realWidthPx = ((sEnd - sStart) / range) * chartW;
              const barWidthPx = Math.max(realWidthPx, 3);
              const lane = sessionLanes[idx];
              const cardTop = lane * (CARD_H + 4);
              const cardBottom = cardTop + CARD_H;
              const barTop = cardAreaH + CONNECTOR_H;
              const color = colorFor(s.musteri_id);
              const cardLeftPx = Math.min(leftPx, chartW - CARD_W);
              return (
                <Fragment key={idx}>
                  <TouchableOpacity
                    onPress={() => router.push(`/musteri/${s.musteri_id}` as any)}
                    style={{
                      position: 'absolute', left: cardLeftPx, width: CARD_W, top: cardTop, height: CARD_H,
                      backgroundColor: Colors.surface, borderWidth: 2, borderColor: color, borderRadius: 6,
                      overflow: 'hidden', flexDirection: 'row', zIndex: 2,
                      ...(sa.canli ? { shadowColor: '#22c55e', shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 4 } : {}),
                    }}
                  >
                    {s.ilan_fotograf ? (
                      <R2Image source={s.ilan_fotograf} style={{ width: 44, height: '100%' } as any} resizeMode="cover" size="sm" />
                    ) : (
                      <View style={{ width: 44, height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceContainerHigh }}>
                        <Text style={{ fontSize: 18 }}>{s.paket_token ? '📋' : '🏠'}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, paddingHorizontal: 5, paddingVertical: 3, justifyContent: 'center' }}>
                      <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '700', color }}>
                        {sa.canli ? '🟢 ' : ''}{adSoyad} · {formatSure(sureSn)}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: Colors.onSurface }}>{ilanLabel}</Text>
                      {s.musteri_etiket ? <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '700', color: '#d8b4fe' }}>{s.musteri_etiket}</Text> : null}
                    </View>
                  </TouchableOpacity>
                  <View style={{ position: 'absolute', left: leftPx - 1, top: cardBottom, width: 2, height: barTop - cardBottom, backgroundColor: color, zIndex: 1 }} />
                  <View style={{ position: 'absolute', left: leftPx, top: barTop, width: barWidthPx, height: BAR_H, backgroundColor: color, borderRadius: 3, zIndex: 2 }} />
                </Fragment>
              );
            })}
            {sorted.length === 0 && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: Colors.outline, fontSize: 12 }}>Bu zaman aralığında oturum yok</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  kart: { backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: Radius.lg, padding: 12, marginTop: 12 },
  baslik: { fontSize: 14, fontWeight: '800', color: Colors.onSurface },
  periodGroup: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerHigh, padding: 3, borderRadius: 7, gap: 2 },
  periodChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5 },
  periodChipActive: { backgroundColor: Colors.surfaceContainerHighest },
  periodChipText: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant },
  periodChipTextActive: { color: Colors.onSurface },
});

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
  chipEtiket: { backgroundColor: 'rgba(168,85,247,0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, maxWidth: 140 },
  chipEtiketText: { fontSize: 10, fontWeight: '700', color: '#d8b4fe' },
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
