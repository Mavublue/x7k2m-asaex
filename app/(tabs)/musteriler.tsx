import { useEffect, useState, useCallback, memo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator, Modal, FlatList, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { Musteri } from '../../types';

type MusteriListe = Musteri & { musteri_iletisim?: { ad: string; telefon: string | null; tip: string | null }[] };
import { TURKIYE, IL_LISTESI } from '../../constants/turkiye';

const ILLER = TURKIYE;
const ILLER_LISTESI = IL_LISTESI;

const durumlar = ['Tümü', 'Aktif', 'Beklemede', 'İptal'];
const musteriTipleri = ['Tümü', 'Bireysel', 'Müteahhit', 'Al-Satçı', 'Diğer'];

type Siralama = 'etiket_artan' | 'etiket_azalan' | 'eklenme_yeni' | 'eklenme_eski' | 'guncelleme_yeni' | 'guncelleme_eski';
const SIRALAMA_LABEL: Record<Siralama, string> = {
  etiket_artan: 'Etiket ↑',
  etiket_azalan: 'Etiket ↓',
  eklenme_yeni: 'Eklenme (yeni)',
  eklenme_eski: 'Eklenme (eski)',
  guncelleme_yeni: 'Değişiklik (yeni)',
  guncelleme_eski: 'Değişiklik (eski)',
};
function etiketSayi(e: string | null): number {
  if (!e) return Number.POSITIVE_INFINITY;
  const n = parseInt(e.trim(), 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export default function MusterilerScreen() {
  const [musteriler, setMusteriler] = useState<MusteriListe[]>([]);
  const [filtered, setFiltered] = useState<MusteriListe[]>([]);
  const [search, setSearch] = useState('');
  const [etiketSearch, setEtiketSearch] = useState('');
  const [activeDurum, setActiveDurum] = useState('Tümü');
  const [activeTip, setActiveTip] = useState('Tümü');
  const [siralama, setSiralama] = useState<Siralama>('eklenme_yeni');
  const [siralamaAcik, setSiralamaAcik] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchMusteriler(); }, []);
  useFocusEffect(useCallback(() => { fetchMusteriler(); }, []));

  useEffect(() => {
    let result = musteriler;
    if (activeDurum !== 'Tümü') result = result.filter(m => m.durum === activeDurum);
    if (activeTip !== 'Tümü') result = result.filter(m => (m.musteri_tipi ?? 'Bireysel') === activeTip);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        `${m.ad ?? ''} ${m.soyad ?? ''}`.toLowerCase().includes(q) ||
        m.telefon?.includes(q) ||
        m.tercih_konum?.toLowerCase().includes(q) ||
        (m.musteri_iletisim ?? []).some(k => k.ad?.toLowerCase().includes(q) || k.telefon?.includes(q))
      );
    }
    if (etiketSearch) {
      const eq = etiketSearch.replace('#', '').toLowerCase();
      result = result.filter(m => m.etiketler?.toLowerCase().includes(eq));
    }
    result = [...result].sort((a, b) => {
      if (siralama === 'etiket_artan') return etiketSayi(a.etiketler) - etiketSayi(b.etiketler);
      if (siralama === 'etiket_azalan') {
        const av = etiketSayi(a.etiketler), bv = etiketSayi(b.etiketler);
        const aFin = Number.isFinite(av), bFin = Number.isFinite(bv);
        if (aFin && !bFin) return -1;
        if (!aFin && bFin) return 1;
        return bv - av;
      }
      if (siralama === 'eklenme_yeni') return (b.olusturma_tarihi ?? '').localeCompare(a.olusturma_tarihi ?? '');
      if (siralama === 'eklenme_eski') return (a.olusturma_tarihi ?? '').localeCompare(b.olusturma_tarihi ?? '');
      if (siralama === 'guncelleme_yeni') return (b.guncelleme_tarihi ?? '').localeCompare(a.guncelleme_tarihi ?? '');
      if (siralama === 'guncelleme_eski') return (a.guncelleme_tarihi ?? '').localeCompare(b.guncelleme_tarihi ?? '');
      return 0;
    });
    setFiltered(result);
  }, [search, etiketSearch, activeDurum, activeTip, musteriler, siralama]);

  async function onRefresh() {
    setRefreshing(true);
    await fetchMusteriler();
    setRefreshing(false);
  }

  async function fetchMusteriler() {
    setLoading(true);
    const { data } = await supabase
      .from('musteriler')
      .select('*, musteri_iletisim(ad, telefon, tip)')
      .order('olusturma_tarihi', { ascending: false });
    if (data) { setMusteriler(data as MusteriListe[]); setFiltered(data as MusteriListe[]); }
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Müşteriler</Text>
          <Text style={styles.subtitle}>{filtered.length} kayıt</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/musteri/ekle' as any)}>
          <Text style={styles.addBtnText}>+ Yeni</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.search}
          placeholder="Müşteri ara..."
          placeholderTextColor={Colors.outlineVariant}
          value={search}
          onChangeText={setSearch}
        />
        <View style={styles.etiketSearchBox}>
          <Text style={styles.etiketSearchHash}>#</Text>
          <TextInput
            style={styles.etiketSearch}
            placeholder="etiket"
            placeholderTextColor={Colors.outlineVariant}
            value={etiketSearch}
            onChangeText={v => setEtiketSearch(v.replace('#', ''))}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
      </View>


      {/* Durum sekmeleri + Sıralama */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: 6, paddingBottom: 4, gap: 8, overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, alignItems: 'center' }} style={{ flex: 1 }}>
          {durumlar.map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.tab, activeDurum === d && styles.tabActive]}
              onPress={() => setActiveDurum(d)}
            >
              <Text style={[styles.tabText, activeDurum === d && styles.tabTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={() => setSiralamaAcik(true)} style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.surfaceContainerLow, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 13, color: Colors.onSurface, fontWeight: '600' }}>⇅ {SIRALAMA_LABEL[siralama]}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.md, paddingTop: 4, paddingBottom: 6 }}>
        {musteriTipleri.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTip === t && { backgroundColor: '#374151', borderColor: '#374151' }]}
            onPress={() => setActiveTip(t)}
          >
            <Text style={[styles.tabText, activeTip === t && { color: '#fff' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={siralamaAcik} transparent animationType="fade" onRequestClose={() => setSiralamaAcik(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setSiralamaAcik(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 30 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingVertical: 8 }}>
            {(Object.keys(SIRALAMA_LABEL) as Siralama[]).map(k => (
              <TouchableOpacity key={k} onPress={() => { setSiralama(k); setSiralamaAcik(false); }} style={{ paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, color: Colors.onSurface, fontWeight: siralama === k ? '700' : '500' }}>{SIRALAMA_LABEL[k]}</Text>
                {siralama === k && <Text style={{ fontSize: 16, color: Colors.primary }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : filtered.length === 0 ? (
        <ScrollView contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}>
          <View style={styles.emptyBox}><Text style={styles.emptyText}>Müşteri bulunamadı</Text></View>
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <MusteriKart musteri={item} search={search} />}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
        />
      )}


    </SafeAreaView>
  );
}

const MusteriKart = memo(function MusteriKart({ musteri, search }: { musteri: MusteriListe; search: string }) {
  const initials = `${musteri.ad?.[0] ?? ''}${musteri.soyad?.[0] ?? ''}`.toUpperCase();
  const q = search.trim().toLowerCase();
  const matchedEk = q ? (musteri.musteri_iletisim ?? []).filter(k =>
    k.ad?.toLowerCase().includes(q) || k.telefon?.includes(q)
  ) : [];
  const durumRenk = {
    Aktif: { bg: '#dcfce7', text: '#166534' },
    Beklemede: { bg: '#fef9c3', text: '#854d0e' },
    İptal: { bg: '#fee2e2', text: '#991b1b' },
  }[musteri.durum] ?? { bg: Colors.surfaceContainerLow, text: Colors.onSurfaceVariant };

  const avatarColors = [
    '#6750A4', '#4e5ba6', '#0077b6', '#2d6a4f', '#b5451b', '#7b2d8b',
  ];
  const avatarBg = avatarColors[(musteri.ad?.charCodeAt(0) ?? 0) % avatarColors.length];

  return (
    <TouchableOpacity style={styles.kart} onPress={() => router.push(`/musteri/${musteri.id}` as any)} activeOpacity={0.85}>
      <View style={styles.kartRow}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={styles.musteriAd} numberOfLines={1}>{`${musteri.ad ?? ''} ${musteri.soyad ?? ''}`.trim()}</Text>
          </View>
          {musteri.telefon ? (
            <Text style={styles.telefon} numberOfLines={1}>📞 {musteri.telefon}</Text>
          ) : null}
          {musteri.tercih_konum ? (
            <Text style={styles.konum} numberOfLines={1}>📍 {musteri.tercih_konum.replace(/\s*\|\s*/g, ', ')}</Text>
          ) : null}
          {(musteri.butce_min || musteri.butce_max) ? (
            <Text style={styles.butce}>
              💰 {musteri.butce_min ? `₺${musteri.butce_min.toLocaleString('tr-TR')}` : '?'} – {musteri.butce_max ? `₺${musteri.butce_max.toLocaleString('tr-TR')}` : '?'}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[styles.durumBadge, { backgroundColor: durumRenk.bg }]}>
            <Text style={[styles.durumText, { color: durumRenk.text }]}>{musteri.durum}</Text>
          </View>
          {musteri.etiketler ? (
            <View style={styles.etiketPill}>
              <Text style={styles.etiketPillText}>#{musteri.etiketler}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {matchedEk.length > 0 && (
        <View style={styles.ekKisiler}>
          {matchedEk.map((k, i) => (
            <View key={i} style={styles.ekKisiRow}>
              <View style={styles.ekKisiTip}>
                <Text style={styles.ekKisiTipText}>↳ {k.tip || 'Ek'}</Text>
              </View>
              <Text style={styles.ekKisiAd} numberOfLines={1}>{k.ad}</Text>
              {k.telefon ? <Text style={styles.ekKisiTel}>📞 {k.telefon}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: Spacing.sm, paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: 24, fontWeight: '700', color: Colors.onSurface },
  subtitle: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  addBtn: {
    backgroundColor: Colors.secondaryContainer,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  searchContainer: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm, flexDirection: 'row', gap: 8, alignItems: 'center' },
  search: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.onSurface,
  },
  etiketSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg, paddingHorizontal: 10, paddingVertical: 12, width: 88 },
  etiketSearchHash: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginRight: 2 },
  etiketSearch: { flex: 1, fontSize: 14, color: Colors.onSurface, padding: 0 },

  tabsScroll: { marginBottom: Spacing.lg, flexGrow: 0 },
  tabs: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  tab: {
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: Colors.surfaceContainerLow,
  },
  tabActive: { backgroundColor: Colors.primaryFixed },
  tabText: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },

  kart: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  kartRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  durumBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  durumText: { fontSize: 10, fontWeight: '600' },
  musteriAd: { fontSize: 15, fontWeight: '700', color: Colors.onSurface, flex: 1 },
  telefon: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 1 },
  etiketPill: { backgroundColor: Colors.surfaceContainerHigh, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  etiketPillText: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant },
  konum: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  butce: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  notlar: { fontSize: 11, color: Colors.onSurfaceVariant, lineHeight: 16 },
  ekKisiler: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow, gap: 4 },
  ekKisiRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  ekKisiTip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: Colors.primaryFixed },
  ekKisiTipText: { fontSize: 9, fontWeight: '700', color: Colors.primary },
  ekKisiAd: { fontSize: 11, fontWeight: '600', color: Colors.onSurface },
  ekKisiTel: { fontSize: 10, color: Colors.onSurfaceVariant },

  emptyBox: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  emptyText: { color: Colors.onSurfaceVariant, fontSize: 14 },

  // Konum filtresi
  konumFilterWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  konumFilterBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: 10,
  },
  konumFilterIcon: { fontSize: 14 },
  konumFilterText: { flex: 1, fontSize: 13, color: Colors.onSurfaceVariant },
  konumFilterChevron: { fontSize: 18, color: Colors.onSurfaceVariant },
  konumTemizleBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fee2e2', borderRadius: Radius.full },
  konumTemizleText: { fontSize: 12, color: '#991b1b', fontWeight: '600' as const },
  konumChipRow: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm, gap: 8 },
  konumChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primaryFixed, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  konumChipText: { fontSize: 12, color: Colors.primary, fontWeight: '600' as const },
  konumChipSil: { fontSize: 12, color: Colors.primary },

  // 3 Kutulu Konum Filtresi
  konumRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: 8, paddingBottom: Spacing.sm },
  konumBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.lg,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  konumBoxAktif: { backgroundColor: Colors.primaryFixed, borderWidth: 1, borderColor: Colors.primary },
  konumBoxDisabled: { opacity: 0.6 },
  konumBoxText: { fontSize: 13, color: Colors.onSurfaceVariant, flex: 1 },
  konumBoxTextAktif: { color: Colors.primary, fontWeight: '600' },
  konumBoxSil: { fontSize: 12, color: Colors.primary, paddingLeft: 4 },
  konumBoxChevron: { fontSize: 16, color: Colors.onSurfaceVariant },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' as const },
  modalDimmer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalPanel: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' as const },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  modalKapat: { fontSize: 20, color: Colors.onSurface, width: 32 },
  modalBaslik: { fontSize: 16, fontWeight: '700' as const, color: Colors.onSurface },
  modalSearch: {
    margin: Spacing.md, backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 10,
    fontSize: 14, color: Colors.onSurface,
  },
  modalItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  modalItemText: { fontSize: 15, color: Colors.onSurface },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center' },
  checkboxAktif: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick: { fontSize: 14, color: '#fff', fontWeight: '700' as const },
  listeNav: { fontSize: 22, color: Colors.onSurfaceVariant, paddingLeft: 12 },

  // Grup başlığı (çoklu il/ilçe seçiminde)
  listeGrupBaslik: {
    fontSize: 12, fontWeight: '700', color: Colors.primary,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: 4,
    backgroundColor: Colors.primaryFixed,
  },

  // Modal alt buton alanı
  modalFooter: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceContainerLow,
  },
  ileriBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
  },
  ileriBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  ekleIlBtn: {
    backgroundColor: Colors.surfaceContainerLow, borderRadius: Radius.full,
    paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
  },
  ekleIlBtnText: { color: Colors.onSurfaceVariant, fontWeight: '600', fontSize: 13 },
});
