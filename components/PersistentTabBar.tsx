import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

type TabKey = 'index' | 'ilanlar' | 'gorevler' | 'musteriler' | 'ayarlar';

const TABS: { key: TabKey; label: string; icon: keyof typeof MaterialIcons.glyphMap; path: string }[] = [
  { key: 'index', label: 'Ana Sayfa', icon: 'dashboard', path: '/(tabs)' },
  { key: 'ilanlar', label: 'İlanlar', icon: 'apartment', path: '/(tabs)/ilanlar' },
  { key: 'gorevler', label: 'Görevler', icon: 'check-circle', path: '/(tabs)/gorevler' },
  { key: 'musteriler', label: 'Müşteriler', icon: 'people', path: '/(tabs)/musteriler' },
];

export default function PersistentTabBar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map(t => (
        <Pressable key={t.key} style={styles.tab} onPress={() => router.push(t.path as any)}>
          <MaterialIcons name={t.icon} size={22} color={Colors.outlineVariant} />
          <Text style={styles.label}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.outlineVariant,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10, fontWeight: '500', color: Colors.outlineVariant },
});
