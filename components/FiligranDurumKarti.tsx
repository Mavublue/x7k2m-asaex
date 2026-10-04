import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Spacing } from '../constants/theme';

type Row = { ilan_id: string; durum: string; ilanlar: { baslik: string } | null };
type Grup = { ilan_id: string; baslik: string; islem: number; kuyruk: number; hazir: number };
type GizliIlan = { id: string; baslik: string };

export default function FiligranDurumKarti() {
  const router = useRouter();
  const [gruplar, setGruplar] = useState<Grup[]>([]);
  const [gizliTemiz, setGizliTemiz] = useState<GizliIlan[]>([]); // temizlendi ama müşteriye gizli

  const yenile = useCallback(async () => {
    const { data, error } = await supabase
      .from('ilan_filigran')
      .select('ilan_id, durum, ilanlar(baslik)')
      .in('durum', ['bekliyor', 'isleniyor', 'hazir']);
    if (error) return; // geçici hata: eski listeyi koru, boşaltma
    const rows = (data ?? []) as unknown as Row[];
    const m = new Map<string, Grup>();
    for (const r of rows) {
      const g = m.get(r.ilan_id) ?? { ilan_id: r.ilan_id, baslik: r.ilanlar?.baslik ?? 'İlan', islem: 0, kuyruk: 0, hazir: 0 };
      if (r.durum === 'isleniyor') g.islem++;
      else if (r.durum === 'bekliyor') g.kuyruk++;
      else if (r.durum === 'hazir') g.hazir++;
      m.set(r.ilan_id, g);
    }
    setGruplar([...m.values()]);
  }, []);

  // Temizlenip onaylanmış (_c<ts> fotolu) AMA müşteriye gizli ilanlar → "görünür yap" hatırlatması.
  const gizliYenile = useCallback(async () => {
    const { data, error } = await supabase
      .from('ilanlar')
      .select('id, baslik, fotograflar')
      .eq('musteri_gizle', true);
    if (error) return;
    const liste = ((data ?? []) as { id: string; baslik: string | null; fotograflar: string[] | null }[])
      .filter((i) => (i.fotograflar ?? []).some((k) => /_c\d{10,}/.test(k)))
      .map((i) => ({ id: i.id, baslik: i.baslik ?? 'İlan' }));
    setGizliTemiz(liste);
  }, []);

  useEffect(() => {
    yenile(); gizliYenile();
    const t = setInterval(() => { yenile(); gizliYenile(); }, 5000);
    return () => clearInterval(t);
  }, [yenile, gizliYenile]);

  if (!gruplar.length && !gizliTemiz.length) return null;

  return (
    <View style={s.card}>
      {gizliTemiz.length > 0 && (
        <View style={[s.gizliBox, gruplar.length > 0 && { marginBottom: 16 }]}>
          <Text style={s.gizliBaslik}>⚠️ Filigranı temizlendi ama müşteriye gizli — görünür yap</Text>
          <View style={{ gap: 6 }}>
            {gizliTemiz.map((i) => (
              <TouchableOpacity key={i.id} onPress={() => router.push(`/ilan/${i.id}` as any)} style={s.gizliRow}>
                <Text style={s.gizliEmoji}>🙈</Text>
                <Text numberOfLines={1} style={s.gizliText}>{i.baslik}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {gruplar.length > 0 && (
      <View style={s.head}>
        <Text style={s.title}>🧹 Filigran Temizleme</Text>
        <Text style={s.subtitle}>{gruplar.length} ilan işleniyor</Text>
      </View>
      )}

      <View style={{ gap: 10 }}>
        {gruplar.map((g) => {
          const toplam = g.kuyruk + g.islem + g.hazir;
          const biten = g.hazir;
          const kalan = g.kuyruk + g.islem;
          const bittiMi = kalan === 0;
          const yuzde = toplam ? Math.round((biten / toplam) * 100) : 0;
          const kalanDk = Math.ceil(kalan * 3);

          const parcalar: string[] = [];
          if (g.islem > 0) parcalar.push('⏳ 1 fotoğraf temizleniyor');
          if (g.kuyruk > 0) parcalar.push(`${g.kuyruk} sırada`);
          if (g.hazir > 0) parcalar.push(`✓ ${g.hazir} inceleme hazır`);
          const durumSatiri = parcalar.join(' · ') + (!bittiMi && kalanDk > 0 ? ` · ~${kalanDk} dk kaldı` : '');

          return (
            <TouchableOpacity key={g.ilan_id} onPress={() => router.push(`/ilan/${g.ilan_id}` as any)}
              style={[s.row, g.hazir > 0 && s.rowGreen]}>
              <View style={s.rowHead}>
                <Text numberOfLines={1} style={s.rowTitle}>{g.baslik}</Text>
                <Text style={[s.frac, { color: bittiMi ? '#22c55e' : Colors.secondary }]}>{biten}/{toplam} temizlendi</Text>
              </View>
              <View style={s.barBg}>
                <View style={[s.barFill, { width: `${yuzde}%`, backgroundColor: bittiMi ? '#22c55e' : Colors.secondary }]} />
              </View>
              <Text numberOfLines={1} style={s.durum}>{durumSatiri}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
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
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  rowTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.onSurface },
  frac: { fontSize: 12, fontWeight: '800' },
  barBg: { height: 7, backgroundColor: Colors.outline, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  barFill: { height: '100%', borderRadius: 4 },
  durum: { fontSize: 11.5, fontWeight: '600', color: Colors.onSurfaceVariant },
});
