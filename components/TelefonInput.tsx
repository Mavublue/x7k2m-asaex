import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';
import { TELEFON_KODLARI_SIRALI, bulKod } from '../constants/telefonKodlari';

interface Props {
  kod: string;
  numara: string;
  onChange: (kod: string, numara: string) => void;
  placeholder?: string;
  sadeceKod?: boolean;
}

export default function TelefonInput({ kod, numara, onChange, placeholder, sadeceKod }: Props) {
  const [acik, setAcik] = useState(false);
  const [arama, setArama] = useState('');

  const secili = bulKod(kod);
  const filtreli = arama
    ? TELEFON_KODLARI_SIRALI.filter(t =>
        t.ulke.toLowerCase().includes(arama.toLowerCase()) || t.kod.includes(arama)
      )
    : TELEFON_KODLARI_SIRALI;

  return (
    <>
      <View style={styles.row}>
        <TouchableOpacity style={styles.kodBtn} onPress={() => { setArama(''); setAcik(true); }}>
          <Text style={styles.bayrak}>{secili.bayrak}</Text>
          <Text style={styles.kod}>{secili.kod}</Text>
          <Text style={styles.chev}>▾</Text>
        </TouchableOpacity>
        {sadeceKod ? (
          <View style={[styles.input, { justifyContent: 'center' }]}>
            <Text style={{ color: Colors.outlineVariant, fontSize: 14 }}>{placeholder ?? 'Ülke kodu seç'}</Text>
          </View>
        ) : (
          <TextInput
            style={styles.input}
            value={numara}
            onChangeText={v => onChange(kod, v.replace(/\D/g, ''))}
            placeholder={placeholder ?? '5xx xxx xx xx'}
            placeholderTextColor={Colors.outlineVariant}
            keyboardType="phone-pad"
          />
        )}
      </View>

      <Modal visible={acik} transparent animationType="slide" onRequestClose={() => setAcik(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.dim} onPress={() => setAcik(false)} />
          <View style={styles.panel}>
            <View style={styles.head}>
              <TouchableOpacity onPress={() => setAcik(false)}><Text style={styles.kapat}>✕</Text></TouchableOpacity>
              <Text style={styles.baslik}>Ülke Kodu</Text>
              <View style={{ width: 32 }} />
            </View>
            <TextInput
              style={styles.search}
              value={arama}
              onChangeText={setArama}
              placeholder="Ülke ara..."
              placeholderTextColor={Colors.outlineVariant}
            />
            <FlatList
              data={filtreli}
              keyExtractor={t => t.kod + t.ulke}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.item, item.kod === kod && { backgroundColor: Colors.primaryFixed }]}
                  onPress={() => { onChange(item.kod, numara); setAcik(false); }}>
                  <Text style={styles.itemBayrak}>{item.bayrak}</Text>
                  <Text style={styles.itemUlke}>{item.ulke}</Text>
                  <Text style={styles.itemKod}>{item.kod}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={{ padding: 20, textAlign: 'center', color: Colors.outlineVariant }}>Sonuç yok</Text>}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, overflow: 'hidden' },
  kodBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderRightWidth: 1, borderRightColor: Colors.outline, gap: 6 },
  bayrak: { fontSize: 16 },
  kod: { fontSize: 14, color: Colors.onSurface, fontWeight: '600' },
  chev: { fontSize: 10, color: Colors.outlineVariant },
  input: { flex: 1, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  kapat: { fontSize: 20, color: Colors.onSurface, width: 32 },
  baslik: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  search: { margin: Spacing.md, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, fontSize: 14, color: Colors.onSurface },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.xl, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  itemBayrak: { fontSize: 18 },
  itemUlke: { flex: 1, fontSize: 15, color: Colors.onSurface },
  itemKod: { fontSize: 14, color: Colors.onSurfaceVariant, fontWeight: '600' },
});
