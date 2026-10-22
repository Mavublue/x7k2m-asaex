import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet } from '../lib/cache';
import { hemenYap } from '../lib/filigran';
import { Colors, Radius, Spacing } from '../constants/theme';

type Row = { ilan_id: string; durum: string; oncelik: string | null; ilanlar: { baslik: string } | null };
// oncelik: "Bunu hemen yap" basılma zamanı (bekleyen/işlenen satırlarda), yoksa null
type Grup = { ilan_id: string; baslik: string; islem: number; kuyruk: number; hazir: number; oncelik?: string | null };
type GizliIlan = { id: string; baslik: string };

function grupla(rows: Row[]): Grup[] {
  const m = new Map<string, Grup>();
  for (const r of rows) {
    const g = m.get(r.ilan_id) ?? { ilan_id: r.ilan_id, baslik: r.ilanlar?.baslik ?? 'İlan', islem: 0, kuyruk: 0, hazir: 0, oncelik: null };
    if (r.durum === 'isleniyor') g.islem++;
    else if (r.durum === 'bekliyor') g.kuyruk++;
    else if (r.durum === 'hazir') g.hazir++;
    if (r.oncelik && (r.durum === 'bekliyor' || r.durum === 'isleniyor') && (!g.oncelik || r.oncelik < g.oncelik)) g.oncelik = r.oncelik;
    m.set(r.ilan_id, g);
  }
  // Öne alınanlar en üstte (ilk basılan önce) — kuyruk sırasıyla aynı
  return [...m.values()].sort((a, b) => (a.oncelik ? 0 : 1) - (b.oncelik ? 0 : 1) || (a.oncelik ?? '').localeCompare(b.oncelik ?? ''));
}

function GrupKart({ g, fiil, islemLabel, dkPerFoto, onPress }: { g: Grup; fiil: string; islemLabel: string; dkPerFoto: number; onPress: () => void }) {
  const toplam = g.kuyruk + g.islem + g.hazir;
  const biten = g.hazir;
  const kalan = g.kuyruk + g.islem;
  const bittiMi = kalan === 0;
  const yuzde = toplam ? Math.round((biten / toplam) * 100) : 0;
  const kalanDk = Math.ceil(kalan * dkPerFoto);
  const parcalar: string[] = [];
  if (g.islem > 0) parcalar.push(islemLabel);
  if (g.kuyruk > 0) parcalar.push(`${g.kuyruk} sırada`);
  if (g.hazir > 0) parcalar.push(`✓ ${g.hazir} inceleme hazır`);
  const durumSatiri = parcalar.join(' · ') + (!bittiMi && kalanDk > 0 ? ` · ~${kalanDk} dk kaldı` : '');
  const [menuAcik, setMenuAcik] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const oncelikli = !!g.oncelik && !bittiMi;
  const hemenYapabilir = g.kuyruk > 0 && !g.oncelik; // sırada bekleyen var ve henüz öne alınmamış
  const hemen = async () => {
    setMenuAcik(false);
    setGonderiliyor(true);
    try { await hemenYap(g.ilan_id); } catch (e) { Alert.alert('Hata', (e as Error).message); } finally { setGonderiliyor(false); }
  };
  return (
    <TouchableOpacity onPress={onPress} style={[s.row, g.hazir > 0 && s.rowGreen, oncelikli && s.rowOncelik]}>
      <View style={s.rowHead}>
        <Text numberOfLines={1} style={s.rowTitle}>{g.baslik}</Text>
        <Text style={[s.frac, { color: bittiMi ? '#22c55e' : Colors.secondary }]}>{biten}/{toplam} {fiil}</Text>
        {(hemenYapabilir || gonderiliyor) && (
          <TouchableOpacity onPress={() => setMenuAcik(true)} disabled={gonderiliyor} hitSlop={10} style={s.menuBtn}>
            <Text style={s.menuBtnText}>{gonderiliyor ? '…' : '⋮'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Modal visible={menuAcik} transparent animationType="fade" onRequestClose={() => setMenuAcik(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuAcik(false)}>
          <View style={s.menuBox}>
            <Text numberOfLines={1} style={s.menuBaslik}>{g.baslik}</Text>
            <TouchableOpacity onPress={hemen} style={s.menuItem}>
              <Text style={s.menuItemText}>⚡ Bunu hemen yap</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${yuzde}%`, backgroundColor: bittiMi ? '#22c55e' : Colors.secondary }]} />
      </View>
      <Text numberOfLines={1} style={s.durum}>
        {oncelikli && <Text style={s.oncelikText}>⚡ Öncelikli · </Text>}
        {durumSatiri}
      </Text>
    </TouchableOpacity>
  );
}

export default function FiligranDurumKarti() {
  const router = useRouter();
  const [gruplar, setGruplar] = useState<Grup[]>([]);
  const [maskeGruplar, setMaskeGruplar] = useState<Grup[]>([]);
  const [gizliTemiz, setGizliTemiz] = useState<GizliIlan[]>([]); // temizlendi ama müşteriye gizli

  const cacheKeyRef = useRef<string | null>(null);
  const son = useRef<{ gruplar: Grup[]; maskeGruplar: Grup[]; gizliTemiz: GizliIlan[] }>({ gruplar: [], maskeGruplar: [], gizliTemiz: [] });

  const cacheYaz = useCallback(() => {
    if (cacheKeyRef.current) cacheSet(cacheKeyRef.current, son.current);
  }, []);

  const yenile = useCallback(async () => {
    const { data, error } = await supabase
      .from('ilan_filigran')
      .select('ilan_id, durum, oncelik, ilanlar(baslik)')
      .in('durum', ['bekliyor', 'isleniyor', 'hazir']);
    if (error) return; // geçici hata: eski listeyi koru, boşaltma
    const g = grupla((data ?? []) as unknown as Row[]);
    son.current.gruplar = g; setGruplar(g); cacheYaz();
  }, [cacheYaz]);

  const maskeYenile = useCallback(async () => {
    const { data, error } = await supabase
      .from('ilan_maske_sil')
      .select('ilan_id, durum, oncelik, ilanlar(baslik)')
      .in('durum', ['bekliyor', 'isleniyor', 'hazir']);
    if (error) return;
    const g = grupla((data ?? []) as unknown as Row[]);
    son.current.maskeGruplar = g; setMaskeGruplar(g); cacheYaz();
  }, [cacheYaz]);

  // Temizlenip onaylanmış (_c<ts> fotolu) AMA müşteriye gizli ilanlar → "görünür yap" hatırlatması.
  const gizliYenile = useCallback(async () => {
    const { data, error } = await supabase
      .from('ilanlar')
      .select('id, baslik, fotograflar, musteri_acildi_at')
      .eq('musteri_gizle', true);
    if (error) return;
    // Bir kere: en yeni temiz foto son müşteriye açılıştan sonraysa (aç-kapa yapınca tekrar çıkmaz)
    const liste = ((data ?? []) as { id: string; baslik: string | null; fotograflar: string[] | null; musteri_acildi_at: string | null }[])
      .filter((i) =>
        Math.max(0, ...(i.fotograflar ?? []).map((k) => Number(k.match(/_c(\d{10,})/)?.[1] ?? 0)))
          > (i.musteri_acildi_at ? Date.parse(i.musteri_acildi_at) : 0))
      .map((i) => ({ id: i.id, baslik: i.baslik ?? 'İlan' }));
    son.current.gizliTemiz = liste; setGizliTemiz(liste); cacheYaz();
  }, [cacheYaz]);

  useEffect(() => {
    let iptal = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (iptal || !session) return;
      const key = `app_filigran_${session.user.id}`;
      cacheKeyRef.current = key;
      const c = await cacheGet<typeof son.current>(key);
      if (!iptal && c) {
        son.current = c;
        setGruplar(c.gruplar ?? []); setMaskeGruplar(c.maskeGruplar ?? []); setGizliTemiz(c.gizliTemiz ?? []);
      }
      yenile(); maskeYenile(); gizliYenile();
    })();
    const tumunuYenile = () => { yenile(); maskeYenile(); gizliYenile(); };
    // REALTIME: filigran/maske satırı değişince anında kartı tazele (poll beklemeden).
    const ch = supabase.channel('filigran-kart-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ilan_filigran' }, tumunuYenile)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ilan_maske_sil' }, tumunuYenile)
      .subscribe();
    const t = setInterval(tumunuYenile, 15000); // güvenlik ağı (eskiden 5sn sürekli)
    return () => { iptal = true; clearInterval(t); supabase.removeChannel(ch); };
  }, [yenile, maskeYenile, gizliYenile]);

  // Aktif temizleme/maske işi olan ilanlar zaten alttaki ilerleme kartında görünür → onları
  // "temizlendi ama gizli" uyarısından çıkar (iş bitince, hâlâ gizliyse, geri gelir).
  const aktifIds = new Set([...gruplar, ...maskeGruplar].map((g) => g.ilan_id));
  const gizliGoster = gizliTemiz.filter((i) => !aktifIds.has(i.id));

  if (!gruplar.length && !maskeGruplar.length && !gizliGoster.length) return null;

  const go = (id: string) => router.push(`/ilan/${id}` as any);

  return (
    <View style={s.card}>
      {gizliGoster.length > 0 && (
        <View style={[s.gizliBox, (gruplar.length || maskeGruplar.length) ? { marginBottom: 16 } : null]}>
          <Text style={s.gizliBaslik}>⚠️ Filigranı temizlendi ama müşteriye gizli — görünür yap</Text>
          <View style={{ gap: 6 }}>
            {gizliGoster.map((i) => (
              <TouchableOpacity key={i.id} onPress={() => go(i.id)} style={s.gizliRow}>
                <Text style={s.gizliEmoji}>🙈</Text>
                <Text numberOfLines={1} style={s.gizliText}>{i.baslik}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {gruplar.length > 0 && (
        <>
          <View style={s.head}>
            <Text style={s.title}>🧹 Filigran Temizleme</Text>
            <Text style={s.subtitle}>{gruplar.length} ilan işleniyor</Text>
          </View>
          <View style={{ gap: 10 }}>
            {gruplar.map((g) => <GrupKart key={g.ilan_id} g={g} fiil="temizlendi" islemLabel="⏳ 1 fotoğraf temizleniyor" dkPerFoto={3} onPress={() => go(g.ilan_id)} />)}
          </View>
        </>
      )}

      {maskeGruplar.length > 0 && (
        <>
          <View style={[s.head, gruplar.length > 0 && { marginTop: 16 }]}>
            <Text style={s.title}>🩹 Maske ile Sil</Text>
            <Text style={s.subtitle}>{maskeGruplar.length} ilan</Text>
          </View>
          <View style={{ gap: 10 }}>
            {maskeGruplar.map((g) => <GrupKart key={g.ilan_id} g={g} fiil="dolduruldu" islemLabel="⏳ 1 alan dolduruluyor" dkPerFoto={2} onPress={() => go(g.ilan_id)} />)}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.surfaceContainer, borderRadius: Radius.md, padding: Spacing.md, borderLeftWidth: 4, borderLeftColor: Colors.primary, marginHorizontal: Spacing.xl, marginTop: Spacing.lg },
  gizliBox: { backgroundColor: 'rgba(234,179,8,0.12)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)', borderRadius: Radius.sm, padding: 12 },
  gizliBaslik: { fontSize: 13, fontWeight: '700', color: '#eab308', marginBottom: 8 },
  gizliRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gizliEmoji: { fontSize: 13 },
  gizliText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#eab308' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  subtitle: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  row: { borderWidth: 1, borderColor: Colors.outline, backgroundColor: Colors.surfaceContainerHigh, borderRadius: Radius.sm, padding: 10 },
  rowGreen: { borderColor: '#2e7d54', backgroundColor: 'rgba(58,170,110,0.12)' },
  rowOncelik: { borderColor: '#ea580c' },
  oncelikText: { color: '#fb923c', fontWeight: '800' },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  rowTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.onSurface },
  frac: { fontSize: 12, fontWeight: '800' },
  barBg: { height: 7, backgroundColor: Colors.outline, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  barFill: { height: '100%', borderRadius: 4 },
  durum: { fontSize: 11.5, fontWeight: '600', color: Colors.onSurfaceVariant },
  menuBtn: { paddingHorizontal: 4, alignSelf: 'center' },
  menuBtnText: { fontSize: 18, fontWeight: '700', color: Colors.onSurfaceVariant, lineHeight: 20 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.xl },
  menuBox: { backgroundColor: Colors.surfaceContainer, borderRadius: Radius.md, paddingVertical: 8 },
  menuBaslik: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant, paddingHorizontal: 16, paddingVertical: 8 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 15, fontWeight: '600', color: Colors.onSurface },
});
