import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Spacing } from '../constants/theme';

type Row = { ilan_id: string; durum: string; ilanlar: { baslik: string } | null };
type Grup = { ilan_id: string; baslik: string; islem: number; kuyruk: number; hazir: number };

export default function FiligranDurumKarti() {
  const router = useRouter();
  const [gruplar, setGruplar] = useState<Grup[]>([]);
  const [tot, setTot] = useState({ islem: 0, kuyruk: 0, hazir: 0 });

  const yenile = useCallback(async () => {
    const { data } = await supabase
      .from('ilan_filigran')
      .select('ilan_id, durum, ilanlar(baslik)')
      .in('durum', ['bekliyor', 'isleniyor', 'hazir']);
    const rows = (data ?? []) as unknown as Row[];
    const m = new Map<string, Grup>();
    let islem = 0, kuyruk = 0, hazir = 0;
    for (const r of rows) {
      const g = m.get(r.ilan_id) ?? { ilan_id: r.ilan_id, baslik: r.ilanlar?.baslik ?? 'İlan', islem: 0, kuyruk: 0, hazir: 0 };
      if (r.durum === 'isleniyor') { g.islem++; islem++; }
      else if (r.durum === 'bekliyor') { g.kuyruk++; kuyruk++; }
      else if (r.durum === 'hazir') { g.hazir++; hazir++; }
      m.set(r.ilan_id, g);
    }
    setGruplar([...m.values()]);
    setTot({ islem, kuyruk, hazir });
  }, []);

  useEffect(() => {
    yenile();
    const t = setInterval(yenile, 5000);
    return () => clearInterval(t);
  }, [yenile]);

  if (!gruplar.length) return null;
  const aktif = tot.islem + tot.kuyruk;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>🧹 Filigran Temizleme</Text>
        {aktif > 0 && (
          <View style={[s.badge, s.badgeOrange]}>
            <Text style={s.badgeOrangeText}>
              {tot.islem > 0 ? `${tot.islem} işleniyor` : ''}{tot.islem > 0 && tot.kuyruk > 0 ? ' · ' : ''}{tot.kuyruk > 0 ? `${tot.kuyruk} kuyrukta` : ''}
            </Text>
          </View>
        )}
        {tot.hazir > 0 && (
          <View style={[s.badge, s.badgeGreen]}><Text style={s.badgeGreenText}>{tot.hazir} inceleme hazır</Text></View>
        )}
      </View>
      <View style={s.chips}>
        {gruplar.map((g) => (
          <TouchableOpacity key={g.ilan_id} onPress={() => router.push(`/ilan/${g.ilan_id}` as any)}
            style={[s.chip, g.hazir > 0 && s.chipGreen]}>
            <Text numberOfLines={1} style={[s.chipText, g.hazir > 0 && s.chipGreenText]}>
              {g.baslik} · {g.hazir > 0 ? `✓ ${g.hazir} hazır` : g.islem > 0 ? '⏳ işleniyor' : `${g.kuyruk} kuyrukta`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.surfaceContainer, borderRadius: Radius.md, padding: Spacing.md, borderLeftWidth: 4, borderLeftColor: Colors.primary, marginHorizontal: Spacing.xl, marginTop: Spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  badgeOrange: { backgroundColor: 'rgba(234,88,12,0.12)', borderColor: Colors.secondaryContainer },
  badgeOrangeText: { fontSize: 12, fontWeight: '700', color: Colors.secondary },
  badgeGreen: { backgroundColor: 'rgba(58,170,110,0.12)', borderColor: '#2e7d54' },
  badgeGreenText: { fontSize: 12, fontWeight: '700', color: '#3aaa6e' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerHigh, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  chipGreen: { backgroundColor: 'rgba(58,170,110,0.15)' },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  chipGreenText: { color: '#3aaa6e' },
});
