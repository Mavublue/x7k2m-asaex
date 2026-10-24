import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors, Radius } from '../constants/theme';

// Header'ın hemen altında sağda sabit (absolute) kaydet butonu — sayfa nereye kaydırılırsa hep görünür.
// `top`: header'ın alt kenarı (header onLayout → y + height).
export default function SabitKaydetButon({ top, onPress, saving, disabled, label = '💾 Güncelle' }: {
  top: number; onPress: () => void; saving: boolean; disabled?: boolean; label?: string;
}) {
  const kapali = saving || !!disabled;
  return (
    <TouchableOpacity style={[styles.btn, { top: top + 10 }, kapali && { opacity: 0.7 }]} onPress={onPress} disabled={kapali} activeOpacity={0.8}>
      {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.text}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute', right: 16, zIndex: 50, elevation: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: 20, paddingVertical: 10, minWidth: 110, alignItems: 'center',
    shadowColor: '#E53935', shadowOpacity: 0.45, shadowRadius: 9, shadowOffset: { width: 0, height: 6 },
  },
  text: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
