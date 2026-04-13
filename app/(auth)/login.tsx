import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';

export default function LoginScreen() {
  const [mod, setMod] = useState<'giris' | 'kayit'>('giris');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ad, setAd] = useState('');
  const [soyad, setSoyad] = useState('');
  const [telefon, setTelefon] = useState('');
  const [ofisAdi, setOfisAdi] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) { Alert.alert('Hata', 'Email ve şifre gerekli'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Giriş Hatası', error.message);
    setLoading(false);
  }

  async function handleRegister() {
    if (!ad || !soyad || !telefon || !email || !password) {
      Alert.alert('Eksik Bilgi', 'Ad, soyad, telefon, email ve şifre zorunludur.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      Alert.alert('Kayıt Hatası', error.message);
      setLoading(false);
      return;
    }
    if (data.user) {
      await supabase.from('profiller').insert({
        id: data.user.id,
        ad, soyad, telefon,
        ofis_adi: ofisAdi || null,
      });
    }
    Alert.alert('Başarılı', 'Hesabınız oluşturuldu.');
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">

          <View style={styles.header}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>EF</Text>
            </View>
            <Text style={styles.title}>Estate Flow</Text>
            <Text style={styles.subtitle}>Profesyonel Emlak Yönetimi</Text>
          </View>

          {/* Tab */}
          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tab, mod === 'giris' && styles.tabActive]} onPress={() => setMod('giris')}>
              <Text style={[styles.tabText, mod === 'giris' && styles.tabTextActive]}>Giriş Yap</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, mod === 'kayit' && styles.tabActive]} onPress={() => setMod('kayit')}>
              <Text style={[styles.tabText, mod === 'kayit' && styles.tabTextActive]}>Kayıt Ol</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {mod === 'kayit' && (
              <>
                <View style={styles.satir}>
                  <View style={{ flex: 1 }}>
                    <Field label="Ad *" value={ad} onChangeText={setAd} placeholder="Ahmet" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Soyad *" value={soyad} onChangeText={setSoyad} placeholder="Yılmaz" />
                  </View>
                </View>
                <Field label="Telefon *" value={telefon} onChangeText={setTelefon} placeholder="05xx xxx xx xx" keyboardType="phone-pad" />
                <Field label="Emlak Ofisi Adı (opsiyonel)" value={ofisAdi} onChangeText={setOfisAdi} placeholder="Yılmaz Gayrimenkul" />
              </>
            )}

            <Field label="E-posta *" value={email} onChangeText={setEmail} placeholder="ornek@email.com" keyboardType="email-address" autoCapitalize="none" />
            <Field label="Şifre *" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

            {mod === 'giris' ? (
              <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Giriş Yap</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Hesap Oluştur</Text>}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, secureTextEntry }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; autoCapitalize?: any; secureTextEntry?: boolean;
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
        autoCapitalize={autoCapitalize ?? 'words'}
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl },

  header: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 64, height: 64, borderRadius: Radius.xl, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  logoText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  title: { fontSize: 26, fontWeight: '700', color: Colors.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 4 },

  tabRow: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, padding: 4, marginBottom: Spacing.lg },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Radius.full },
  tabActive: { backgroundColor: Colors.surfaceContainerLowest, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  tabText: { fontSize: 14, color: Colors.onSurfaceVariant, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },

  form: { gap: Spacing.md },
  satir: { flexDirection: 'row', gap: Spacing.sm },
  inputContainer: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: 15, color: Colors.onSurface },

  primaryButton: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.sm },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
