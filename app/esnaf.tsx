import { useEffect, useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Modal, Alert, RefreshControl, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Spacing } from '../constants/theme';

type Esnaf = {
  id: string;
  grup: string;
  isim: string | null;
  telefon: string | null;
  notlar: string | null;
  created_at: string;
};

export default function EsnafScreen() {
  const [kayitlar, setKayitlar] = useState<Esnaf[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kapaliGruplar, setKapaliGruplar] = useState<Record<string, boolean>>({});

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [grup, setGrup] = useState('');
  const [isim, setIsim] = useState('');
  const [telefon, setTelefon] = useState('');
  const [notlar, setNotlar] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => { fetchKayitlar(); }, []);

  const fetchKayitlar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('esnaf_rehberi')
      .select('id, grup, isim, telefon, notlar, created_at')
      .eq('user_id', user.id)
      .order('grup').order('isim');
    setKayitlar((data ?? []) as Esnaf[]);
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchKayitlar();
    setRefreshing(false);
  }, [fetchKayitlar]);

  const gruplar = useMemo(() => Array.from(new Set(kayitlar.map(k => k.grup))).sort((a, b) => a.localeCompare(b, 'tr')), [kayitlar]);

  function acModal(k?: Esnaf) {
    if (k) { setEditId(k.id); setGrup(k.grup); setIsim(k.isim ?? ''); setTelefon(k.telefon ?? ''); setNotlar(k.notlar ?? ''); }
    else { setEditId(null); setGrup(''); setIsim(''); setTelefon(''); setNotlar(''); }
    setModal(true);
  }

  async function kaydet() {
    if (!grup.trim() && !isim.trim()) return;
    setKaydediliyor(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setKaydediliyor(false); return; }
    const payload = {
      grup: grup.trim() || 'Genel',
      isim: isim.trim() || null,
      telefon: telefon.trim() || null,
      notlar: notlar.trim() || null,
    };
    if (editId) {
      await supabase.from('esnaf_rehberi').update(payload).eq('id', editId);
    } else {
      await supabase.from('esnaf_rehberi').insert({ ...payload, user_id: user.id });
    }
    setKaydediliyor(false);
    setModal(false);
    fetchKayitlar();
  }

  function silSor(k: Esnaf) {
    Alert.alert('Sil', `${k.isim || 'Kayıt'} silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await supabase.from('esnaf_rehberi').delete().eq('id', k.id);
        setKayitlar(prev => prev.filter(x => x.id !== k.id));
      } },
    ]);
  }

  const q = search.trim().toLowerCase();
  const filtreli = q
    ? kayitlar.filter(k => `${k.grup} ${k.isim ?? ''} ${k.telefon ?? ''} ${k.notlar ?? ''}`.toLowerCase().includes(q))
    : kayitlar;
  const grupluGoster = gruplar
    .map(g => ({ grup: g, items: filtreli.filter(k => k.grup === g) }))
    .filter(x => x.items.length > 0);

  const kaydetDisabled = kaydediliyor || (!grup.trim() && !isim.trim());

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
          <Text style={styles.title}>🛠 Esnaf Rehberi</Text>
          <Text style={styles.subtitle}>Bölgendeki esnafı grup grup not al</Text>
        </View>
        <TouchableOpacity onPress={() => acModal()} style={styles.addBtn}>
          <Text style={styles.addBtnText}>＋ Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* Arama */}
      <View style={{ paddingHorizontal: Spacing.lg, paddingVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: 12 }}>
          <Text style={{ fontSize: 14, color: Colors.onSurfaceVariant, marginRight: 6 }}>🔍</Text>
          <TextInput
            style={{ flex: 1, fontSize: 14, color: Colors.onSurface, paddingVertical: 10 }}
            placeholder="Grup, isim, telefon veya not ara..."
            placeholderTextColor={Colors.outlineVariant}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Text style={{ fontSize: 16, color: Colors.onSurfaceVariant }}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {grupluGoster.length === 0 ? (
          <View style={{ padding: 24, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center' }}>
              {q ? 'Eşleşen kayıt yok' : 'Henüz kayıt yok. ＋ Ekle ile başla (ör. Boyacılar, Tesisatçılar).'}
            </Text>
          </View>
        ) : grupluGoster.map(({ grup: g, items }) => {
          const kapali = !q && kapaliGruplar[g];
          return (
            <View key={g} style={{ borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: Radius.lg, overflow: 'hidden' }}>
              <TouchableOpacity onPress={() => setKapaliGruplar(prev => ({ ...prev, [g]: !prev[g] }))}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.surfaceContainerHigh }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.onSurface }}>{g} <Text style={{ color: Colors.onSurfaceVariant, fontWeight: '600' }}>({items.length})</Text></Text>
                <Text style={{ fontSize: 12, color: Colors.onSurfaceVariant }}>{kapali ? '▸' : '▾'}</Text>
              </TouchableOpacity>
              {!kapali && items.map(k => (
                <View key={k.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.onSurface }}>{k.isim || '—'}</Text>
                    {k.telefon ? (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${k.telefon}`)}>
                        <Text style={{ fontSize: 13, color: '#60a5fa', fontWeight: '600', marginTop: 2 }}>📞 {k.telefon}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {k.notlar ? <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 4 }}>{k.notlar}</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => acModal(k)} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.surfaceContainerHigh, borderRadius: 6 }}>
                      <Text style={{ fontSize: 14 }}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => silSor(k)} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 6 }}>
                      <Text style={{ fontSize: 14 }}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {/* Ekle / Düzenle Modal */}
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: Colors.surfaceContainerLow, borderRadius: 16, padding: 22, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, marginBottom: 14, color: Colors.onSurface }}>{editId ? '✏️ Kaydı Düzenle' : '＋ Esnaf Ekle'}</Text>

            <Text style={styles.fieldLabel}>Grup</Text>
            <TextInput value={grup} onChangeText={setGrup} placeholder="ör. Boyacılar" placeholderTextColor={Colors.outlineVariant} style={styles.input} />
            {gruplar.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {gruplar.map(g => (
                  <TouchableOpacity key={g} onPress={() => setGrup(g)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: grup === g ? Colors.primary : Colors.surfaceContainerHigh }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: grup === g ? '#fff' : Colors.onSurfaceVariant }}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>İsim</Text>
            <TextInput value={isim} onChangeText={setIsim} placeholder="ör. Ahmet Usta" placeholderTextColor={Colors.outlineVariant} style={styles.input} />

            <Text style={styles.fieldLabel}>Telefon</Text>
            <TextInput value={telefon} onChangeText={setTelefon} placeholder="05..." placeholderTextColor={Colors.outlineVariant} keyboardType="phone-pad" style={styles.input} />

            <Text style={styles.fieldLabel}>Not</Text>
            <TextInput value={notlar} onChangeText={setNotlar} placeholder="Fiyat, iş kalitesi, vs." placeholderTextColor={Colors.outlineVariant} multiline style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity onPress={() => setModal(false)} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' }}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={kaydet} disabled={kaydetDisabled} style={{ flex: 1, padding: 12, backgroundColor: kaydetDisabled ? Colors.outlineVariant : '#16a34a', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: kaydetDisabled ? Colors.onSurfaceVariant : '#fff', fontWeight: '700' }}>{kaydediliyor ? '...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
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
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.outlineVariant,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 28, color: Colors.onSurface, lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '800', color: Colors.onSurface },
  subtitle: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  addBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: 'rgba(59,130,246,0.18)' },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#93c5fd' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: Colors.outlineVariant, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 12, color: Colors.onSurface },
});
