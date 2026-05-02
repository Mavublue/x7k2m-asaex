import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';

type Ozellik = { id: string; ad: string };

export default function OzelliklerScreen() {
  const [ozellikler, setOzellikler] = useState<Ozellik[]>([]);
  const [loading, setLoading] = useState(true);
  const [yeni, setYeni] = useState('');
  const [ekliyor, setEkliyor] = useState(false);
  const [duzenleId, setDuzenleId] = useState<string | null>(null);
  const [duzenleAd, setDuzenleAd] = useState('');

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('ozellikler').select('*').order('olusturma_tarihi', { ascending: true });
    if (data) setOzellikler(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, []);
  useFocusEffect(useCallback(() => { fetch(); }, [fetch]));

  async function handleEkle() {
    const ad = yeni.trim();
    if (!ad) return;
    setEkliyor(true);
    const { error } = await supabase.from('ozellikler').insert({ ad });
    if (error) Alert.alert('Hata', error.message);
    else { setYeni(''); fetch(); }
    setEkliyor(false);
  }

  function handleDuzenleBaslat(id: string, ad: string) {
    setDuzenleId(id);
    setDuzenleAd(ad);
  }

  async function handleDuzenleKaydet() {
    if (!duzenleId) return;
    const ad = duzenleAd.trim();
    if (!ad) return;
    const { error } = await supabase.from('ozellikler').update({ ad }).eq('id', duzenleId);
    if (error) { Alert.alert('Hata', error.message); return; }
    setOzellikler(prev => prev.map(o => o.id === duzenleId ? { ...o, ad } : o));
    setDuzenleId(null);
    setDuzenleAd('');
  }

  async function handleSil(id: string, ad: string) {
    Alert.alert('Sil', `"${ad}" özelliğini silmek istiyor musunuz?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await supabase.from('ozellikler').delete().eq('id', id);
        fetch();
      }},
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.geri}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Özellik Yönetimi</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.ekleRow}>
          <TextInput
            style={styles.input}
            placeholder="Yeni özellik ekle (örn: Asansör, Otopark...)"
            placeholderTextColor={Colors.outlineVariant}
            value={yeni}
            onChangeText={setYeni}
            onSubmitEditing={handleEkle}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.ekleBtn} onPress={handleEkle} disabled={ekliyor}>
            {ekliyor ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.ekleBtnText}>Ekle</Text>}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : ozellikler.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>Henüz özellik eklenmedi</Text>
            <Text style={styles.emptySubText}>İlanlarınızda kullanabileceğiniz özellikler ekleyin</Text>
          </View>
        ) : (
          <FlatList
            data={ozellikler}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.liste}
            renderItem={({ item }) => (
              <View style={styles.ozellikItem}>
                {duzenleId === item.id ? (
                  <>
                    <TextInput
                      style={styles.duzenleInput}
                      value={duzenleAd}
                      onChangeText={setDuzenleAd}
                      onSubmitEditing={handleDuzenleKaydet}
                      autoFocus
                      returnKeyType="done"
                    />
                    <TouchableOpacity style={styles.kaydetBtn} onPress={handleDuzenleKaydet}>
                      <Text style={styles.kaydetBtnText}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iptalBtn} onPress={() => setDuzenleId(null)}>
                      <Text style={styles.iptalBtnText}>✕</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.ozellikAd}>{item.ad}</Text>
                    <TouchableOpacity style={styles.duzenleBtn} onPress={() => handleDuzenleBaslat(item.id, item.ad)}>
                      <Text style={styles.duzenleBtnText}>✎</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.silBtn} onPress={() => handleSil(item.id, item.ad)}>
                      <Text style={styles.silBtnText}>✕</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  geri: { fontSize: 22, color: Colors.onSurface, width: 32 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  ekleRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.xl },
  input: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12,
    fontSize: 14, color: Colors.onSurface,
  },
  ekleBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: 18, justifyContent: 'center' },
  ekleBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  liste: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  ozellikItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
  },
  ozellikAd: { flex: 1, fontSize: 15, color: Colors.onSurface, fontWeight: '500' },
  duzenleInput: {
    flex: 1, fontSize: 15, color: Colors.onSurface, fontWeight: '500',
    paddingVertical: 0, paddingHorizontal: 8,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 8, height: 36,
  },
  duzenleBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  duzenleBtnText: { color: '#1a1b21', fontSize: 14, fontWeight: '700' },
  kaydetBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  kaydetBtnText: { color: '#16a34a', fontSize: 14, fontWeight: '700' },
  iptalBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  iptalBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '700' },
  silBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  silBtnText: { color: '#991b1b', fontSize: 14, fontWeight: '700' },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.onSurface },
  emptySubText: { fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.xl },
});
