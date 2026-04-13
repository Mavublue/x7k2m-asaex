import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

const icons: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  index: 'dashboard',
  ilanlar: 'apartment',
  musteriler: 'people',
  ayarlar: 'settings',
};

const labels: Record<string, string> = {
  index: 'Ana Sayfa',
  ilanlar: 'İlanlar',
  harita: 'Harita',
  musteriler: 'Müşteriler',
  ayarlar: 'Ayarlar',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.outlineVariant,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color }) => (
          <MaterialIcons
            name={icons[route.name] ?? 'circle'}
            size={24}
            color={color}
          />
        ),
        tabBarLabel: labels[route.name] ?? route.name,
      })}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="ilanlar" />
      <Tabs.Screen name="harita" options={{ href: null }} />
      <Tabs.Screen name="musteriler" />
      <Tabs.Screen name="ayarlar" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopWidth: 0,
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    height: 72,
    paddingBottom: 12,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
});
