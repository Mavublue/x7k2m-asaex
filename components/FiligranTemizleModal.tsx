import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Image, Alert, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';
import type { Ilan } from '../types';
import {
  filigranBaslat, filigranDurum, filigranOnayla, filigranReddet,
  thumbUrl, oncesiUrl, sonrasiUrl, type FiligranRow,
} from '../lib/filigran';

export default function FiligranTemizleModal({ ilan, visible, onClose, onChanged }: {
  ilan: Ilan; visible: boolean; onClose: () => void; onChanged?: () => void;
}) {
  const fotolar = (ilan.fotograflar ?? []) as string[];
  const [rows, setRows] = useState<FiligranRow[]>([]);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [baslatiliyor, setBaslatiliyor] = useState(false);
  const [islem, setIslem] = useState<Set<string>>(new Set());
  const [incele, setIncele] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const kararlanan = useRef<Set<string>>(new Set());

  const yenile = useCallback(async () => {
    try {
      const r = await filigranDurum(ilan.id);
      setRows(r.filter((x) => !kararlanan.current.has(x.id)));
    } catch {}
  }, [ilan.id]);

  useEffect(() => {
    if (!visible) return;
    yenile();
    poll.current = setInterval(yenile, 5000);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [visible, yenile]);

  const aktif = rows.filter((r) => r.durum === 'bekliyor' || r.durum === 'isleniyor');
  const hazir = rows.filter((r) => r.durum === 'hazir');
  const mesgul = new Set([...aktif, ...hazir].map((r) => r.foto_key));
  const secilebilir = fotolar.filter((k) => !mesgul.has(k));

  useEffect(() => { if (hazir.length === 0) setIncele(false); }, [hazir.length]);
  const pipeline = aktif.length + hazir.length;
  const biten = hazir.length;
  const kalanDk = Math.ceil(aktif.length * 3);

  const toggle = (k: string) => setSecili((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const hepsiniSec = () => setSecili(new Set(secilebilir.length === secili.size ? [] : secilebilir));

  async function baslat() {
    if (!secili.size || baslatiliyor) return;
    setBaslatiliyor(true);
    try { await filigranBaslat(ilan.id, [...secili]); setSecili(new Set()); await yenile(); }
    catch (e: any) { Alert.alert('Hata', e.message); }
    setBaslatiliyor(false);
  }
  async function karar(row: FiligranRow, onay: boolean) {
    if (islem.has(row.id)) return;
    setIslem((s) => new Set(s).add(row.id));
    kararlanan.current.add(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id)); // anında sonraki fotoğrafa geç
    try {
      if (onay) { await filigranOnayla(row.id); onChanged?.(); } else { await filigranReddet(row.id); }
    } catch (e: any) { kararlanan.current.delete(row.id); Alert.alert('Hata', e.message); await yenile(); }
    setIslem((s) => { const n = new Set(s); n.delete(row.id); return n; });
  }
  async function hepsiniOnayla() { for (const r of hazir) await karar(r, true); }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={s.wrap}>
        <View style={s.header}>
          <Text style={s.title}>🧹 Filigran Temizle</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}><Text style={s.close}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
          {/* İLERLEME */}
          {aktif.length > 0 && (
            <View style={s.progressBox}>
              <Text style={s.progressText}>Temizleniyor… {biten}/{pipeline} bitti · {aktif.length} sırada{kalanDk > 0 ? ` · ~${kalanDk} dk` : ''}</Text>
              <View style={s.barBg}><View style={[s.barFill, { width: `${pipeline ? (biten / pipeline) * 100 : 0}%` }]} /></View>
            </View>
          )}

          {/* İNCELE — tek tek büyük, dokun tam ekran, onaylayınca sonrakine geç */}
          {hazir.length > 0 && (
            <View style={{ gap: Spacing.md }}>
              <View style={s.rowBetween}>
                <Text style={s.sectionTitle}>İncele — {hazir.length} kaldı</Text>
                {hazir.length > 1 && <TouchableOpacity style={s.onayHepsi} onPress={hepsiniOnayla}><Text style={s.onayHepsiText}>✓ Hepsini Onayla</Text></TouchableOpacity>}
              </View>
              {(() => { const r = hazir[0]; return (
                <TouchableOpacity activeOpacity={0.9} style={s.card} onPress={() => setIncele(true)}>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cap}>ÖNCESİ</Text>
                      <Image source={{ uri: oncesiUrl(r.foto_key) }} style={s.img} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cap, { color: '#3aaa6e' }]}>SONRASI</Text>
                      {r.temiz_key ? <Image source={{ uri: sonrasiUrl(r.temiz_key) }} style={s.img} /> : null}
                    </View>
                  </View>
                  <Text style={s.dokunHintRed}>👆 İncelemek ve onaylamak için dokun</Text>
                </TouchableOpacity>
              ); })()}
            </View>
          )}

          {rows.some((r) => r.durum === 'hata') && (
            <Text style={s.hataText}>Bazı fotolar temizlenemedi (tekrar seçip deneyebilirsin).</Text>
          )}

          {/* SEÇ + BAŞLAT */}
          <View style={{ gap: Spacing.sm }}>
            <View style={s.rowBetween}>
              <Text style={s.sectionTitle}>Temizlenecek Fotoğraflar{secili.size > 0 ? ` (${secili.size})` : ''}</Text>
              {secilebilir.length > 0 && (
                <TouchableOpacity onPress={hepsiniSec}><Text style={s.link}>{secili.size === secilebilir.length ? 'Kaldır' : 'Hepsini Seç'}</Text></TouchableOpacity>
              )}
            </View>
            {secilebilir.length === 0 ? (
              <Text style={s.bos}>Temizlenecek başka foto yok.</Text>
            ) : (
              <View style={s.grid}>
                {secilebilir.map((k) => {
                  const sec = secili.has(k);
                  return (
                    <TouchableOpacity key={k} onPress={() => toggle(k)} style={[s.thumbWrap, sec && s.thumbSel]}>
                      <Image source={{ uri: thumbUrl(k) }} style={s.thumb} />
                      {sec && <View style={s.check}><Text style={s.checkText}>✓</Text></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <TouchableOpacity style={[s.temizleBtn, (!secili.size || baslatiliyor) && s.temizleBtnOff]} disabled={!secili.size || baslatiliyor} onPress={baslat}>
              {baslatiliyor ? <ActivityIndicator color="#fff" /> : <Text style={s.temizleText}>Temizle{secili.size ? ` (${secili.size})` : ''}</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
        {incele && hazir.length > 0 && (() => { const r = hazir[0]; return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setIncele(false)}>
            <View style={s.fsWrap}>
              <View style={s.fsHeader}>
                <Text style={s.fsTitle}>İncele — {hazir.length} kaldı</Text>
                <TouchableOpacity onPress={() => setIncele(false)} hitSlop={12}><Text style={s.fsClose}>✕</Text></TouchableOpacity>
              </View>
              <View style={s.fsRow}>
                <View style={s.fsCol}>
                  <Text style={s.fsCap}>ÖNCESİ</Text>
                  <Image source={{ uri: oncesiUrl(r.foto_key) }} style={s.fsHalf} resizeMode="contain" />
                </View>
                <View style={s.fsCol}>
                  <Text style={[s.fsCap, { color: '#6ee7a8' }]}>SONRASI</Text>
                  {r.temiz_key ? <Image source={{ uri: sonrasiUrl(r.temiz_key) }} style={s.fsHalf} resizeMode="contain" /> : null}
                </View>
              </View>
              <View style={s.fsBtnRow}>
                <TouchableOpacity style={[s.fsBtn, s.fsRed]} disabled={islem.has(r.id)} onPress={() => karar(r, false)}>
                  <Text style={s.fsBtnText}>✕ Olmamış</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.fsBtn, s.fsGreen]} disabled={islem.has(r.id)} onPress={() => karar(r, true)}>
                  <Text style={s.fsBtnText}>✓ Olmuş</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ); })()}
      </View>
    </Modal>
  );
}

const GAP = 6;
const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant },
  title: { fontSize: 17, fontWeight: '700', color: Colors.onSurface },
  close: { fontSize: 20, color: Colors.onSurfaceVariant },
  progressBox: { backgroundColor: Colors.surfaceContainer, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.secondaryContainer },
  progressText: { fontSize: 13, fontWeight: '700', color: Colors.secondary, marginBottom: 6 },
  barBg: { height: 8, backgroundColor: Colors.surfaceContainerHighest, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.secondary },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  link: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  card: { borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: Radius.md, padding: Spacing.sm },
  cap: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 3 },
  img: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.sm, backgroundColor: Colors.surfaceContainer },
  dokunHintRed: { fontSize: 12, color: Colors.primary, textAlign: 'center', marginTop: 8, fontWeight: '700' },
  fsWrap: { flex: 1, backgroundColor: '#0b0b0b' },
  fsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 44, paddingBottom: 10 },
  fsTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fsClose: { color: '#fff', fontSize: 22 },
  fsRow: { flex: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 8, minHeight: 0 },
  fsCol: { flex: 1 },
  fsCap: { color: '#e5e7eb', fontSize: 11, fontWeight: '700', paddingVertical: 4 },
  fsHalf: { flex: 1, width: '100%', borderRadius: 6 },
  fsBtnRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28 },
  fsBtn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  fsRed: { backgroundColor: 'rgba(229,57,53,0.3)' },
  fsGreen: { backgroundColor: '#3aaa6e' },
  fsBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  kararBtn: { flex: 1, paddingVertical: 9, borderRadius: Radius.sm, alignItems: 'center' },
  red: { backgroundColor: 'rgba(229,57,53,0.15)' },
  redText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  green: { backgroundColor: '#3aaa6e' },
  greenText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  onayHepsi: { backgroundColor: '#3aaa6e', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
  onayHepsiText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  hataText: { fontSize: 12, color: Colors.error },
  bos: { fontSize: 13, color: Colors.onSurfaceVariant },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  thumbWrap: { width: '31.5%', aspectRatio: 1, borderRadius: Radius.sm, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbSel: { borderColor: Colors.primary },
  thumb: { width: '100%', height: '100%', backgroundColor: Colors.surfaceContainer },
  check: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  temizleBtn: { marginTop: Spacing.sm, backgroundColor: Colors.primary, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center' },
  temizleBtnOff: { backgroundColor: Colors.surfaceContainerHighest },
  temizleText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
