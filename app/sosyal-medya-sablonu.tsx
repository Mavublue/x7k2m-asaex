import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors, Radius, Spacing } from '../constants/theme';
import { DEFAULT_SOSYAL_SABLON, PLACEHOLDERS } from '../lib/sosyalMedya';

export default function SosyalMedyaSablonuScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sablon, setSablon] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('profiller').select('sosyal_medya_sablonu').eq('id', user.id).single();
      setSablon(data?.sosyal_medya_sablonu ?? '');
      setLoading(false);
    });
  }, []);

  function placeholderEkle(key: string) {
    const ek = `{{${key}}}`;
    const start = selection.start;
    const end = selection.end;
    const yeni = sablon.slice(0, start) + ek + sablon.slice(end);
    setSablon(yeni);
    const pos = start + ek.length;
    setTimeout(() => {
      inputRef.current?.focus();
      setSelection({ start: pos, end: pos });
    }, 0);
  }

  async function kaydet() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const deger = sablon.trim() ? sablon : null;
    const { error } = await supabase.from('profiller').update({ sosyal_medya_sablonu: deger }).eq('id', user.id);
    setSaving(false);
    if (error) Alert.alert('Hata', error.message);
    else { Alert.alert('Kaydedildi', 'Şablon güncellendi.'); router.back(); }
  }

  function varsayilanaSifirla() {
    Alert.alert('Varsayılana sıfırla', 'Şablonun sistem varsayılanı ile değiştirilecek. Devam?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sıfırla', onPress: () => setSablon(DEFAULT_SOSYAL_SABLON) },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ textAlign: 'center', color: Colors.onSurfaceVariant, marginTop: 40 }}>Yükleniyor...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sosyal Medya Şablonu</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 40 }}>
          <Text style={styles.aciklama}>
            Tüm ilanların paylaşımında bu şablon kullanılır. İstersen ilan detayından o ilana özel değiştirebilirsin.
            Boş bırakırsan sistem varsayılanı kullanılır.
          </Text>

          <Text style={styles.label}>Yer tutucular (tıklayıp ekleyebilirsin):</Text>
          <View style={styles.placeholderRow}>
            {PLACEHOLDERS.map(p => (
              <TouchableOpacity key={p.key} onPress={() => placeholderEkle(p.key)} style={styles.placeholderChip}>
                <Text style={styles.placeholderChipText}>{`{{${p.key}}}`}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            ref={inputRef}
            value={sablon}
            onChangeText={setSablon}
            onSelectionChange={e => setSelection(e.nativeEvent.selection)}
            selection={selection}
            multiline
            placeholder={DEFAULT_SOSYAL_SABLON}
            placeholderTextColor={Colors.outlineVariant}
            style={styles.textarea}
            textAlignVertical="top"
          />

          <View style={styles.actions}>
            <TouchableOpacity onPress={varsayilanaSifirla} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Varsayılana sıfırla</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={kaydet} disabled={saving} style={[styles.primaryBtn, saving && { opacity: 0.7 }]}>
              <Text style={styles.primaryBtnText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 32, color: Colors.onSurface, lineHeight: 32 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.onSurface, flex: 1, textAlign: 'center' },
  aciklama: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 20, marginBottom: Spacing.lg },
  label: { fontSize: 13, fontWeight: '700', color: Colors.onSurface, marginBottom: Spacing.sm },
  placeholderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.lg },
  placeholderChip: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6 },
  placeholderChipText: { fontSize: 11, color: Colors.onSurface, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  textarea: { minHeight: 320, backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.lg, padding: Spacing.md, fontSize: 14, lineHeight: 22, color: Colors.onSurface, borderWidth: 1, borderColor: Colors.surfaceContainerLow },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  secondaryBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.full, alignItems: 'center', borderWidth: 1, borderColor: Colors.outlineVariant },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.full, alignItems: 'center', backgroundColor: Colors.primary },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
