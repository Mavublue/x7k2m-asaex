import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';

export default function AyarlarScreen() {
  const [email, setEmail] = useState('');
  const [ad, setAd] = useState('');
  const [soyad, setSoyad] = useState('');
  const [ofisAdi, setOfisAdi] = useState('');

  const fetchProfil = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setEmail(user.email ?? '');
      const { data } = await supabase.from('profiller').select('*').eq('id', user.id).single();
      if (data) {
        setAd(data.ad ?? '');
        setSoyad(data.soyad ?? '');
        setOfisAdi(data.ofis_adi ?? '');
      }
    }
  }, []);

  useEffect(() => { fetchProfil(); }, []);
  useFocusEffect(useCallback(() => { fetchProfil(); }, [fetchProfil]));

  async function handleLogout() {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  const tamAd = [ad, soyad].filter(Boolean).join(' ') || email.split('@')[0];
  const initials = [ad[0], soyad[0]].filter(Boolean).join('').toUpperCase() || email[0]?.toUpperCase() || 'U';

  const menuItems = [
    { icon: '👤', label: 'Profil Bilgileri', sub: tamAd, onPress: () => router.push('/profil/duzenle' as any) },
    { icon: '🏢', label: 'Emlak Ofisi', sub: ofisAdi || 'Belirtilmemiş', onPress: () => router.push('/profil/duzenle' as any) },
    { icon: '✨', label: 'Özellik Yönetimi', sub: 'İlan özellikleri', onPress: () => router.push('/ozellikler' as any) },
    { icon: '❓', label: 'Yardım & Destek', sub: '', onPress: () => {} },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Ayarlar</Text>

      <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/profil/duzenle' as any)}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{tamAd}</Text>
          <Text style={styles.profileEmail}>{email}</Text>
          {ofisAdi ? <Text style={styles.profileOfis}>🏢 {ofisAdi}</Text> : null}
        </View>
        <Text style={styles.profileArrow}>›</Text>
      </TouchableOpacity>

      <View style={styles.menu}>
        {menuItems.map((item, i) => (
          <TouchableOpacity key={i} style={[styles.menuItem, i === menuItems.length - 1 && { borderBottomWidth: 0 }]} onPress={item.onPress}>
            <View style={styles.menuLeft}>
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </View>
            <View style={styles.menuRight}>
              {item.sub ? <Text style={styles.menuSub} numberOfLines={1}>{item.sub}</Text> : null}
              <Text style={styles.menuArrow}>›</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Estate Flow v1.0.0</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface, paddingHorizontal: Spacing.xl },
  title: { fontSize: 24, fontWeight: '700', color: Colors.onSurface, paddingTop: Spacing.xl, marginBottom: Spacing.lg },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.primary, borderRadius: Radius.xxl,
    padding: Spacing.lg, marginBottom: Spacing.xl,
  },
  profileAvatar: { width: 52, height: 52, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  profileName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  profileEmail: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  profileOfis: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  profileArrow: { color: 'rgba(255,255,255,0.6)', fontSize: 24 },

  menu: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xl, overflow: 'hidden', marginBottom: Spacing.lg },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  menuIcon: { fontSize: 18 },
  menuLabel: { fontSize: 15, color: Colors.onSurface },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '50%' },
  menuSub: { fontSize: 13, color: Colors.onSurfaceVariant },
  menuArrow: { fontSize: 20, color: Colors.outlineVariant },

  logoutBtn: { backgroundColor: '#fee2e2', borderRadius: Radius.full, paddingVertical: 16, alignItems: 'center', marginBottom: Spacing.xl },
  logoutText: { color: '#991b1b', fontWeight: '700', fontSize: 15 },
  version: { textAlign: 'center', fontSize: 12, color: Colors.outlineVariant },
});
