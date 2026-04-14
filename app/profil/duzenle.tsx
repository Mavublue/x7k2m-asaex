import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { IL_LISTESI as ILLER_LISTESI } from '../../constants/turkiye';

export default function ProfilDuzenleScreen() {
  const [ad, setAd] = useState('');
  const [soyad, setSoyad] = useState('');
  const [telefon, setTelefon] = useState('');
  const [ofisAdi, setOfisAdi] = useState('');
  const [calismaBolgesi, setCalismaBolgesi] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [veriYuklendi, setVeriYuklendi] = useState(false);
  const [ilModal, setIlModal] = useState(false);
  const [ilSearch, setIlSearch] = useState('');

  useEffect(() => {
    async function fetchProfil() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? '');
        const { data } = await supabase.from('profiller').select('*').eq('id', user.id).single();
        if (data) {
          setAd(data.ad ?? '');
          setSoyad(data.soyad ?? '');
          setTelefon(data.telefon ?? '');
          setOfisAdi(data.ofis_adi ?? '');
          setCalismaBolgesi(data.calisma_bolgesi ?? '');
        }
      }
      setVeriYuklendi(true);
    }
    fetchProfil();
  }, []);

  async function handleKaydet() {
    if (!ad || !soyad) { Alert.alert('Hata', 'Ad ve soyad zorunludur.'); return; }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { error } = await supabase.from('profiller').upsert({
      id: user.id, ad, soyad, telefon,
      ofis_adi: ofisAdi || null,
      calisma_bolgesi: calismaBolgesi || null,
    });

    if (error) Alert.alert('Hata', error.message);
    else Alert.alert('Kaydedildi', 'Profil bilgileriniz güncellendi.', [
      { text: 'Tamam', onPress: () => router.back() },
    ]);
    setLoading(false);
  }

  if (!veriYuklendi) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.geri}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil Bilgileri</Text>
        <TouchableOpacity style={styles.kaydetBtn} onPress={handleKaydet} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.kaydetText}>Kaydet</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.avatarBox}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{ad?.[0]?.toUpperCase() ?? '?'}{soyad?.[0]?.toUpperCase() ?? ''}</Text>
            </View>
            <Text style={styles.avatarEmail}>{email}</Text>
          </View>

          <View style={styles.satir}>
            <View style={{ flex: 1 }}>
              <Field label="Ad *" value={ad} onChangeText={setAd} placeholder="Ahmet" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Soyad *" value={soyad} onChangeText={setSoyad} placeholder="Yılmaz" />
            </View>
          </View>

          <Field label="Telefon" value={telefon} onChangeText={setTelefon} placeholder="05xx xxx xx xx" keyboardType="phone-pad" />
          <Field label="Emlak Ofisi Adı (opsiyonel)" value={ofisAdi} onChangeText={setOfisAdi} placeholder="Yılmaz Gayrimenkul" />

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Çalışma Bölgesi</Text>
            <TouchableOpacity style={styles.secimBtn} onPress={() => { setIlSearch(''); setIlModal(true); }}>
              <Text style={calismaBolgesi ? styles.secimBtnText : styles.secimBtnPlaceholder}>
                {calismaBolgesi ? `📍 ${calismaBolgesi}` : 'İl seçin...'}
              </Text>
              {calismaBolgesi ? (
                <TouchableOpacity onPress={() => setCalismaBolgesi('')}>
                  <Text style={styles.temizle}>✕</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.emailKutu}>
            <Text style={styles.emailLabel}>E-posta</Text>
            <Text style={styles.emailDeger}>{email}</Text>
            <Text style={styles.emailNot}>E-posta adresi değiştirilemez</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={ilModal} animationType="slide" transparent onRequestClose={() => setIlModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalDimmer} onPress={() => setIlModal(false)} />
          <View style={styles.modalPanel}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setIlModal(false)}>
                <Text style={styles.modalKapat}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalBaslik}>Çalışma Bölgesi</Text>
              <View style={{ width: 32 }} />
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder="İl ara..."
              placeholderTextColor={Colors.outlineVariant}
              value={ilSearch}
              onChangeText={setIlSearch}
            />
            <FlatList
              data={ILLER_LISTESI.filter(i => i.toLowerCase().includes(ilSearch.toLowerCase()))}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => { setCalismaBolgesi(item); setIlModal(false); }}>
                  <Text style={[styles.modalItemText, calismaBolgesi === item && { color: Colors.primary, fontWeight: '700' }]}>{item}</Text>
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any;
}) {
  return (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.outlineVariant}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.xl, gap: Spacing.md, paddingBottom: 48 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  geri: { fontSize: 22, color: Colors.onSurface },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  kaydetBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8 },
  kaydetText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  avatarBox: { alignItems: 'center', paddingVertical: Spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: Radius.full, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  avatarEmail: { fontSize: 14, color: Colors.onSurfaceVariant },

  satir: { flexDirection: 'row', gap: Spacing.sm },
  inputContainer: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },

  emailKutu: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, padding: Spacing.lg, gap: 4 },
  emailLabel: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  emailDeger: { fontSize: 15, color: Colors.onSurface, fontWeight: '500' },
  emailNot: { fontSize: 11, color: Colors.outlineVariant, marginTop: 2 },

  inputContainer: { gap: 6 },
  secimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  secimBtnText: { fontSize: 15, color: Colors.onSurface },
  secimBtnPlaceholder: { fontSize: 15, color: Colors.outlineVariant },
  chevron: { fontSize: 20, color: Colors.onSurfaceVariant },
  temizle: { fontSize: 16, color: Colors.onSurfaceVariant, paddingHorizontal: 4 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalDimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalPanel: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalKapat: { fontSize: 20, color: Colors.onSurface, width: 32 },
  modalBaslik: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  modalSearch: { margin: Spacing.md, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, fontSize: 14, color: Colors.onSurface },
  modalItem: { paddingHorizontal: Spacing.xl, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalItemText: { fontSize: 15, color: Colors.onSurface },
});
