import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { TURKIYE, IL_LISTESI, MAHALLELER } from '../../constants/turkiye';

const ILLER = TURKIYE;
const ILLER_LISTESI = IL_LISTESI;
const EMLAK_TIPLERI = ['Daire', 'Villa', 'Arsa', 'İşyeri', 'Müstakil Ev', 'Rezidans'];
const ODALAR = ['Stüdyo', '1+0', '1+1', '2+1', '3+1', '3+2', '4+1', '5+'];
const BINA_YASLARI = ['0', '1', '2', '3', '4', '5', '6-10', '11-15', '16-20', '21-25', '+30'];
const durumlar: ('Aktif' | 'Beklemede' | 'İptal')[] = ['Aktif', 'Beklemede', 'İptal'];

function formatButce(val: string) {
  return val.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function isoFormat(tr: string) {
  const p = tr.split('.');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : '';
}

export default function MusteriEkleScreen() {
  const [ad, setAd] = useState('');
  const [soyad, setSoyad] = useState('');
  const [telefon, setTelefon] = useState('');
  const [butceMin, setButceMin] = useState('');
  const [butceMax, setButceMax] = useState('');
  const [filterIl, setFilterIl] = useState<string[]>([]);
  const [filterIlce, setFilterIlce] = useState<string[]>([]);
  const [filterMahalle, setFilterMahalle] = useState<string[]>([]);
  const [filterPage, setFilterPage] = useState<'main' | 'il' | 'ilce' | 'mahalle'>('main');
  const [konumSearch, setKonumSearch] = useState('');
  const [tercihTipler, setTercihTipler] = useState<string[]>([]);
  const [minOda, setMinOda] = useState('');
  const [ozelIstekler, setOzelIstekler] = useState<string[]>([]);
  const [takipTarihi, setTakipTarihi] = useState('');
  const [binaYaslari, setBinaYaslari] = useState<string[]>([]);
  const [notlar, setNotlar] = useState('');
  const [etiket, setEtiket] = useState('');
  const [durum, setDurum] = useState<'Aktif' | 'Beklemede' | 'İptal'>('Aktif');
  const [loading, setLoading] = useState(false);
  const [tumOzellikler, setTumOzellikler] = useState<{id: string; ad: string}[]>([]);

  let filteredBoxList: any[] = [];
  if (filterPage === 'il') {
    filteredBoxList = ILLER_LISTESI
      .filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()))
      .map(i => ({ type: 'item', label: i, key: i }));
  } else if (filterPage === 'ilce') {
    filterIl.forEach(il => {
      const ilceler = (ILLER[il] ?? []).filter(i => i.toLowerCase().includes(konumSearch.toLowerCase()));
      if (ilceler.length > 0) {
        filteredBoxList.push({ type: 'header', label: il });
        ilceler.sort((a,b) => a.localeCompare(b,'tr')).forEach(ilce => {
          filteredBoxList.push({ type: 'item', label: ilce, key: ilce });
        });
      }
    });
  } else if (filterPage === 'mahalle') {
    filterIl.forEach(il => {
      filterIlce.forEach(ilce => {
        if ((ILLER[il] ?? []).includes(ilce)) {
          const mahalleler = (((MAHALLELER as any)[il]?.[ilce] ?? []) as string[])
            .filter(m => m.toLowerCase().includes(konumSearch.toLowerCase()));
          if (mahalleler.length > 0) {
            filteredBoxList.push({ type: 'header', label: `${il} - ${ilce}` });
            mahalleler.sort((a,b) => a.localeCompare(b,'tr')).forEach(mah => {
              filteredBoxList.push({ type: 'item', label: mah, key: mah });
            });
          }
        }
      });
    });
  }

  useEffect(() => {
    supabase.from('ozellikler').select('*').order('olusturma_tarihi').then(({ data }) => {
      if (data) setTumOzellikler(data);
    });
  }, []);

  async function handleKaydet() {
    if (!ad || !soyad) { Alert.alert('Hata', 'Ad ve soyad zorunludur.'); return; }
    setLoading(true);
    let kArr = [];
    if (filterIl.length) kArr.push(filterIl.join(', '));
    if (filterIlce.length) kArr.push(filterIlce.join(', '));
    if (filterMahalle.length) kArr.push(filterMahalle.join(', '));
    const tercih_konum_val = kArr.length > 0 ? kArr.join(' | ') : null;

    const { error } = await supabase.from('musteriler').insert({
      ad, soyad,
      telefon: telefon || null,
      butce_min: butceMin ? parseInt(butceMin.replace(/\./g, '')) : null,
      butce_max: butceMax ? parseInt(butceMax.replace(/\./g, '')) : null,
      tercih_konum: tercih_konum_val,
      tercih_tip: tercihTipler.length ? tercihTipler.join(',') : null,
      min_oda: minOda || null,
      ozel_istekler: ozelIstekler.length ? ozelIstekler.join(',') : null,
      takip_tarihi: takipTarihi ? isoFormat(takipTarihi) : null,
      notlar: notlar || null,
      bina_yasi: binaYaslari.length ? binaYaslari.join(',') : null,
      etiketler: etiket.trim() || null,
      durum,
    });
    if (error) Alert.alert('Hata', error.message);
    else router.back();
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.geri}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yeni Müşteri</Text>
        <TouchableOpacity style={styles.kaydetBtn} onPress={handleKaydet} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.kaydetText}>Kaydet</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

          <View style={styles.satir}>
            <View style={{ flex: 1 }}><Field label="Ad *" value={ad} onChangeText={setAd} placeholder="Ahmet" /></View>
            <View style={{ flex: 1 }}><Field label="Soyad *" value={soyad} onChangeText={setSoyad} placeholder="Yılmaz" /></View>
            <View style={[styles.inputContainer, { width: 80 }]}>
              <Text style={styles.label}>Etiket</Text>
              <View style={styles.etiketInputRow}>
                <Text style={styles.etiketHash}>#</Text>
                <TextInput
                  style={styles.etiketInput}
                  placeholder="12"
                  placeholderTextColor={Colors.outlineVariant}
                  value={etiket}
                  onChangeText={v => setEtiket(v.replace(/[#\s]/g, ''))}
                  autoCapitalize="none"
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>

          <Field label="Telefon" value={telefon} onChangeText={setTelefon} placeholder="05xx xxx xx xx" keyboardType="phone-pad" />

          <View style={styles.satir}>
            <View style={{ flex: 1 }}>
              <Field label="Bütçe Min (₺)" value={butceMin} onChangeText={v => setButceMin(formatButce(v))} placeholder="500.000" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Bütçe Max (₺)" value={butceMax} onChangeText={v => setButceMax(formatButce(v))} placeholder="2.000.000" keyboardType="numeric" />
            </View>
          </View>

          {/* Konum */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Tercih Edilen Konum</Text>
            <View style={{ flexDirection: 'column', gap: 12 }}>
              {/* İl Kutusu */}
              <TouchableOpacity
                style={[styles.konumBox, filterIl.length > 0 && styles.konumBoxAktif]}
                onPress={() => { setKonumSearch(''); setFilterPage('il'); }}
              >
                <Text style={[styles.konumBoxText, filterIl.length > 0 && styles.konumBoxTextAktif]} numberOfLines={1}>
                  {filterIl.length > 0 ? `${filterIl.length} İl Seçildi` : 'İl Seçin'}
                </Text>
                {filterIl.length > 0
                  ? <TouchableOpacity onPress={() => { setFilterIl([]); setFilterIlce([]); setFilterMahalle([]); }} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                      <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                    </TouchableOpacity>
                  : <Text style={styles.konumBoxChevron}>▾</Text>
                }
              </TouchableOpacity>

              {/* İlçe Kutusu */}
              <TouchableOpacity
                style={[styles.konumBox, filterIlce.length > 0 && styles.konumBoxAktif, filterIl.length === 0 && styles.konumBoxDisabled]}
                onPress={() => { if (filterIl.length === 0) return; setKonumSearch(''); setFilterPage('ilce'); }}
                activeOpacity={filterIl.length > 0 ? 0.7 : 1}
              >
                <Text style={[styles.konumBoxText, filterIlce.length > 0 && styles.konumBoxTextAktif, filterIl.length === 0 && { color: Colors.outlineVariant }]} numberOfLines={1}>
                  {filterIlce.length > 0 ? `${filterIlce.length} İlçe Seçildi` : 'İlçe Seçin'}
                </Text>
                {filterIlce.length > 0
                  ? <TouchableOpacity onPress={() => { setFilterIlce([]); setFilterMahalle([]); }} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                      <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                    </TouchableOpacity>
                  : <Text style={[styles.konumBoxChevron, filterIl.length === 0 && { color: Colors.outlineVariant }]}>▾</Text>
                }
              </TouchableOpacity>

              {/* Mahalle Kutusu */}
              <TouchableOpacity
                style={[styles.konumBox, filterMahalle.length > 0 && styles.konumBoxAktif, filterIlce.length === 0 && styles.konumBoxDisabled]}
                onPress={() => { if (filterIlce.length === 0) return; setKonumSearch(''); setFilterPage('mahalle'); }}
                activeOpacity={filterIlce.length > 0 ? 0.7 : 1}
              >
                <Text style={[styles.konumBoxText, filterMahalle.length > 0 && styles.konumBoxTextAktif, filterIlce.length === 0 && { color: Colors.outlineVariant }]} numberOfLines={1}>
                  {filterMahalle.length > 0 ? `${filterMahalle.length} Mahalle Seçildi` : 'Mahalle Seçin'}
                </Text>
                {filterMahalle.length > 0
                  ? <TouchableOpacity onPress={() => setFilterMahalle([])} style={{ paddingLeft: 10, paddingVertical: 4 }}>
                      <Text style={styles.konumBoxSil}>✕ Temizle</Text>
                    </TouchableOpacity>
                  : <Text style={[styles.konumBoxChevron, filterIlce.length === 0 && { color: Colors.outlineVariant }]}>▾</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Tercih Tip */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Tercih Edilen Tip</Text>
            <View style={styles.chipRow}>
              {EMLAK_TIPLERI.map(t => {
                const secili = tercihTipler.includes(t);
                return (
                  <TouchableOpacity key={t} style={[styles.chip, secili && styles.chipActive]}
                    onPress={() => setTercihTipler(prev => secili ? prev.filter(x => x !== t) : [...prev, t])}>
                    <Text style={[styles.chipText, secili && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Min Oda */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Minimum Oda Sayısı</Text>
            <View style={styles.chipRow}>
              {ODALAR.map(o => {
                const secili = minOda === o;
                return (
                  <TouchableOpacity key={o} style={[styles.chip, secili && styles.chipActive]}
                    onPress={() => setMinOda(secili ? '' : o)}>
                    <Text style={[styles.chipText, secili && styles.chipTextActive]}>{o}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Bina Yaşı */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Bina Yaşı Tercihi</Text>
            <View style={styles.chipRow}>
              {BINA_YASLARI.map(y => {
                const secili = binaYaslari.includes(y);
                return (
                  <TouchableOpacity key={y} style={[styles.chip, secili && styles.chipActive]}
                    onPress={() => setBinaYaslari(prev => secili ? prev.filter(x => x !== y) : [...prev, y])}>
                    <Text style={[styles.chipText, secili && styles.chipTextActive]}>{y}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Özel İstekler */}
          {tumOzellikler.length > 0 && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Özel İstekler</Text>
              <View style={styles.chipRow}>
                {tumOzellikler.map(oz => {
                  const secili = ozelIstekler.includes(oz.ad);
                  return (
                    <TouchableOpacity key={oz.id} style={[styles.chip, secili && styles.chipActive]}
                      onPress={() => setOzelIstekler(prev => secili ? prev.filter(x => x !== oz.ad) : [...prev, oz.ad])}>
                      <Text style={[styles.chipText, secili && styles.chipTextActive]}>{oz.ad}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Takip Tarihi */}
          <Field label="Takip Tarihi" value={takipTarihi} onChangeText={setTakipTarihi} placeholder="GG.AA.YYYY" keyboardType="numeric" />

          {/* Notlar */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Notlar</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Müşteri hakkında notlar..."
              placeholderTextColor={Colors.outlineVariant}
              value={notlar}
              onChangeText={setNotlar}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Durum */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Durum</Text>
            <View style={styles.durumRow}>
              {durumlar.map(d => (
                <TouchableOpacity key={d} style={[styles.durumBtn, durum === d && styles.durumBtnAktif]} onPress={() => setDurum(d)}>
                  <Text style={[styles.durumBtnText, durum === d && styles.durumBtnTextAktif]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Konum Modalı */}
      {filterPage !== 'main' && (
        <Modal visible={true} animationType="slide" transparent>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
            <TouchableOpacity style={styles.modalDimmer} onPress={() => setFilterPage('main')} />
            <View style={styles.modalPanel}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setFilterPage('main')}>
                  <Text style={styles.modalKapat}>←</Text>
                </TouchableOpacity>
                <Text style={styles.modalBaslik}>
                  {filterPage === 'il' ? 'İl Seçin' : filterPage === 'ilce' ? 'İlçe Seçin' : 'Mahalle Seçin'}
                </Text>
                <TouchableOpacity onPress={() => setFilterPage('main')}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary }}>Tamam</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.modalSearch}
                  placeholder="Ara..."
                  placeholderTextColor={Colors.outlineVariant}
                  value={konumSearch}
                  onChangeText={setKonumSearch}
                />
                <FlatList
                  data={filteredBoxList}
                  keyExtractor={(item, i) => `${filterPage}-${i}-${item.type === 'item' ? item.key : item.label}`}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    if (item.type === 'header') {
                      return <Text style={styles.listeGrupBaslik}>{item.label}</Text>;
                    }
                    const val = item.key;
                    const secili =
                      filterPage === 'il' ? filterIl.includes(val) :
                      filterPage === 'ilce' ? filterIlce.includes(val) :
                      filterMahalle.includes(val);
                    return (
                      <TouchableOpacity
                        style={[styles.modalItem, secili && { backgroundColor: Colors.primaryFixed }]}
                        onPress={() => {
                          if (filterPage === 'il') {
                            setFilterIl(f => secili ? f.filter(x => x !== val) : [...f, val]);
                            setFilterIlce([]); setFilterMahalle([]);
                          } else if (filterPage === 'ilce') {
                            setFilterIlce(f => secili ? f.filter(x => x !== val) : [...f, val]);
                            setFilterMahalle([]);
                          } else {
                            setFilterMahalle(f => secili ? f.filter(x => x !== val) : [...f, val]);
                          }
                        }}
                      >
                        <View style={[styles.checkbox, secili && styles.checkboxAktif, { marginRight: 10 }]}>
                          {secili && <Text style={styles.checkboxTick}>✓</Text>}
                        </View>
                        <Text style={[styles.modalItemText, secili && { color: Colors.primary, fontWeight: '600' }, { flex: 1 }]}>{val}</Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
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
        autoCapitalize="words"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
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
  satir: { flexDirection: 'row', gap: Spacing.sm },
  inputContainer: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  input: { backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12, fontSize: 15, color: Colors.onSurface },
  textarea: { minHeight: 80, paddingTop: 12 },
  durumRow: { flexDirection: 'row', gap: Spacing.sm },
  durumBtn: { flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full, paddingVertical: 10, alignItems: 'center' },
  durumBtnAktif: { backgroundColor: Colors.primary },
  durumBtnText: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  durumBtnTextAktif: { color: '#fff' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outline },
  chipActive: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },
  secimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  secimBtnText: { fontSize: 15, color: Colors.onSurface },
  secimBtnPlaceholder: { fontSize: 15, color: Colors.outlineVariant },
  secimChevron: { fontSize: 20, color: Colors.onSurfaceVariant },
  mahalleSatir: { flexDirection: 'row', gap: Spacing.sm, marginTop: 6, alignItems: 'center' },
  temizleBtn: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerLow },
  temizleBtnText: { fontSize: 13, color: Colors.onSurfaceVariant },
  konumChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primaryFixed, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, marginBottom: 6 },
  konumChipText: { fontSize: 14, color: Colors.primary, flex: 1 },
  konumChipSil: { fontSize: 14, color: Colors.primary, paddingLeft: 8 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalDimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalPanel: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '88%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalKapat: { fontSize: 20, color: Colors.onSurface, width: 32 },
  modalBaslik: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  modalSearch: { margin: Spacing.md, marginBottom: 0, backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10, fontSize: 14, color: Colors.onSurface },
  modalItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow },
  modalItemText: { fontSize: 15, color: Colors.onSurface },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center' },
  checkboxAktif: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick: { fontSize: 14, color: '#fff', fontWeight: '700' },
  listeGrupBaslik: { fontSize: 12, fontWeight: '700', color: Colors.primary, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: 4, backgroundColor: Colors.primaryFixed },
  konumBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 14, borderWidth: 1, borderColor: 'transparent' },
  konumBoxAktif: { backgroundColor: Colors.primaryFixed, borderColor: Colors.primary },
  konumBoxDisabled: { opacity: 0.6 },
  konumBoxText: { fontSize: 14, color: Colors.onSurfaceVariant, flex: 1 },
  konumBoxTextAktif: { color: Colors.primary, fontWeight: '600' },
  konumBoxSil: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  konumBoxChevron: { fontSize: 16, color: Colors.onSurfaceVariant },
  etiketInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, width: 80 },
  etiketHash: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginRight: 1 },
  etiketInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: Colors.onSurface },
});
