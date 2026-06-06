import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import PersistentTabBar from '../../components/PersistentTabBar';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { cacheGet, cacheSet } from '../../lib/cache';
import { Colors, Radius, Spacing } from '../../constants/theme';
import R2Image from '../../components/R2Image';
import IlanDetayPopup from '../../components/IlanDetayPopup';

type Ozellik = { id: string; ad: string; sayi: number };
type IlanRef = {
  ilan_id: string;
  baslik: string;
  portfoy_no: string | null;
  fiyat: number | null;
  konum: string | null;
  ilce: string | null;
  mahalle: string | null;
  oda_sayisi: string | null;
  metrekare: number | null;
  foto: string | null;
};

export default function OzelliklerScreen() {
  const [ozellikler, setOzellikler] = useState<Ozellik[]>([]);
  const [loading, setLoading] = useState(true);
  const [yeni, setYeni] = useState('');
  const [ekliyor, setEkliyor] = useState(false);
  const [duzenleId, setDuzenleId] = useState<string | null>(null);
  const [duzenleAd, setDuzenleAd] = useState('');
  const [acikId, setAcikId] = useState<string | null>(null);
  const [acikIlanlar, setAcikIlanlar] = useState<IlanRef[]>([]);
  const [acikLoading, setAcikLoading] = useState(false);
  const [secilen, setSecilen] = useState<string[]>([]);
  const [popupId, setPopupId] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const cacheKey = `panel_ozellikler_${session.user.id}`;
    const cached = await cacheGet<Ozellik[]>(cacheKey);
    if (cached) { setOzellikler(cached); setLoading(false); }
    const [{ data: ozData }, { data: jData }] = await Promise.all([
      supabase.from('ozellikler').select('id, ad').order('ad'),
      supabase.from('ilan_ozellikler').select('ozellik_id'),
    ]);
    if (ozData) {
      const sayim = new Map<string, number>();
      (jData ?? []).forEach((r: any) => sayim.set(r.ozellik_id, (sayim.get(r.ozellik_id) ?? 0) + 1));
      const liste = ozData.map(o => ({ id: o.id, ad: o.ad, sayi: sayim.get(o.id) ?? 0 }));
      setOzellikler(liste);
      cacheSet(cacheKey, liste);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, []);
  useFocusEffect(useCallback(() => { fetch(); }, [fetch]));

  async function acipIlanlariYukle(ozellikId: string) {
    if (acikId === ozellikId) { setAcikId(null); setAcikIlanlar([]); setSecilen([]); return; }
    setAcikId(ozellikId);
    setAcikIlanlar([]);
    setSecilen([]);
    setAcikLoading(true);
    const { data } = await supabase
      .from('ilan_ozellikler')
      .select('ilan_id, ilanlar!inner(id, baslik, portfoy_no, fiyat, konum, ilce, mahalle, oda_sayisi, metrekare, fotograflar)')
      .eq('ozellik_id', ozellikId);
    const liste: IlanRef[] = (data ?? []).map((r: any) => ({
      ilan_id: r.ilan_id,
      baslik: r.ilanlar?.baslik ?? '(Başlıksız)',
      portfoy_no: r.ilanlar?.portfoy_no ?? null,
      fiyat: r.ilanlar?.fiyat ?? null,
      konum: r.ilanlar?.konum ?? null,
      ilce: r.ilanlar?.ilce ?? null,
      mahalle: r.ilanlar?.mahalle ?? null,
      oda_sayisi: r.ilanlar?.oda_sayisi ?? null,
      metrekare: r.ilanlar?.metrekare ?? null,
      foto: r.ilanlar?.fotograflar?.[0] ?? null,
    }));
    liste.sort((a, b) => a.baslik.localeCompare(b.baslik, 'tr'));
    setAcikIlanlar(liste);
    setAcikLoading(false);
  }

  async function handleEkle() {
    const ad = yeni.trim();
    if (!ad) return;
    setEkliyor(true);
    const { error } = await supabase.from('ozellikler').insert({ ad });
    if (error) Alert.alert('Hata', error.message);
    else { setYeni(''); fetch(); }
    setEkliyor(false);
  }

  function handleDuzenleBaslat(id: string, ad: string) {
    setDuzenleId(id);
    setDuzenleAd(ad);
  }

  async function handleDuzenleKaydet() {
    if (!duzenleId) return;
    const ad = duzenleAd.trim();
    if (!ad) return;
    const { error } = await supabase.from('ozellikler').update({ ad }).eq('id', duzenleId);
    if (error) { Alert.alert('Hata', error.message); return; }
    setOzellikler(prev => {
      const yeniListe = prev.map(o => o.id === duzenleId ? { ...o, ad } : o);
      yeniListe.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
      return yeniListe;
    });
    setDuzenleId(null);
    setDuzenleAd('');
  }

  async function handleSil(id: string, ad: string) {
    const oz = ozellikler.find(o => o.id === id);
    const ekstra = oz && oz.sayi > 0 ? ` ${oz.sayi} ilandan da kaldırılacak.` : '';
    Alert.alert('Sil', `"${ad}" özelliğini silmek istiyor musunuz?${ekstra}`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await supabase.from('ozellikler').delete().eq('id', id);
        setOzellikler(prev => prev.filter(o => o.id !== id));
        if (acikId === id) { setAcikId(null); setAcikIlanlar([]); setSecilen([]); }
      }},
    ]);
  }

  async function ilanCikar(ilanId: string) {
    if (!acikId) return;
    const { error } = await supabase.from('ilan_ozellikler').delete().eq('ozellik_id', acikId).eq('ilan_id', ilanId);
    if (error) { Alert.alert('Hata', error.message); return; }
    setAcikIlanlar(prev => prev.filter(i => i.ilan_id !== ilanId));
    setSecilen(prev => prev.filter(x => x !== ilanId));
    setOzellikler(prev => prev.map(o => o.id === acikId ? { ...o, sayi: Math.max(0, o.sayi - 1) } : o));
  }

  async function topluCikar() {
    if (!acikId || secilen.length === 0) return;
    Alert.alert('Toplu Kaldır', `${secilen.length} ilandan bu özellik kaldırılacak. Devam?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Kaldır', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('ilan_ozellikler').delete().eq('ozellik_id', acikId).in('ilan_id', secilen);
        if (error) { Alert.alert('Hata', error.message); return; }
        const sayi = secilen.length;
        setAcikIlanlar(prev => prev.filter(i => !secilen.includes(i.ilan_id)));
        setSecilen([]);
        setOzellikler(prev => prev.map(o => o.id === acikId ? { ...o, sayi: Math.max(0, o.sayi - sayi) } : o));
      }},
    ]);
  }

  function toggleSecim(ilanId: string) {
    setSecilen(prev => prev.includes(ilanId) ? prev.filter(x => x !== ilanId) : [...prev, ilanId]);
  }

  function tumunuSec() {
    if (secilen.length === acikIlanlar.length) setSecilen([]);
    else setSecilen(acikIlanlar.map(i => i.ilan_id));
  }

  function renderIlan(ilan: IlanRef) {
    const secili = secilen.includes(ilan.ilan_id);
    return (
      <View key={ilan.ilan_id} style={[s.ilanKart, secili && s.ilanKartSecili]}>
        <TouchableOpacity onPress={() => toggleSecim(ilan.ilan_id)} style={s.cbWrap}>
          <Text style={s.cbText}>{secili ? '☑' : '☐'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setPopupId(ilan.ilan_id)}
          style={s.ilanContent}
          activeOpacity={0.7}
        >
          <View style={s.ilanFotoWrap}>
            {ilan.foto ? (
              <R2Image source={ilan.foto} style={s.ilanFoto} size="sm" />
            ) : (
              <Text style={{ fontSize: 20 }}>🏠</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.basRow}>
              {ilan.portfoy_no && (
                <View style={s.pnBadge}><Text style={s.pnText}>{ilan.portfoy_no}</Text></View>
              )}
              <Text style={s.ilanBaslik} numberOfLines={1}>{ilan.baslik}</Text>
            </View>
            <View style={s.metaRow}>
              {ilan.fiyat != null && (
                <Text style={s.fiyat}>{Number(ilan.fiyat).toLocaleString('tr-TR')} ₺</Text>
              )}
              <Text style={s.meta} numberOfLines={1}>
                {[ilan.oda_sayisi, ilan.metrekare ? `${ilan.metrekare}m²` : null, ilan.ilce || ilan.konum]
                  .filter(Boolean).join(' • ')}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => ilanCikar(ilan.ilan_id)} style={s.kaldirBtn}>
          <Text style={s.kaldirBtnText}>Kaldır</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderOzellik(item: Ozellik) {
    const acik = acikId === item.id;
    const duzenleniyor = duzenleId === item.id;
    return (
      <View key={item.id} style={s.ozellikWrap}>
        <View style={s.ozellikItem}>
          {duzenleniyor ? (
            <>
              <TextInput
                style={s.duzenleInput}
                value={duzenleAd}
                onChangeText={setDuzenleAd}
                onSubmitEditing={handleDuzenleKaydet}
                autoFocus
                returnKeyType="done"
              />
              <TouchableOpacity style={s.kaydetBtn} onPress={handleDuzenleKaydet}>
                <Text style={s.kaydetBtnText}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.iptalBtn} onPress={() => setDuzenleId(null)}>
                <Text style={s.iptalBtnText}>✕</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={s.adRow}
                onPress={() => item.sayi > 0 && acipIlanlariYukle(item.id)}
                disabled={item.sayi === 0}
                activeOpacity={item.sayi > 0 ? 0.6 : 1}
              >
                <Text style={s.expandIcon}>{item.sayi > 0 ? (acik ? '▾' : '▸') : ' '}</Text>
                <Text style={s.ozellikAd}>{item.ad}</Text>
                <View style={[s.sayiBadge, item.sayi === 0 && s.sayiBadgeBos]}>
                  <Text style={[s.sayiBadgeText, item.sayi === 0 && s.sayiBadgeBosText]}>{item.sayi}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={s.duzenleBtn} onPress={() => handleDuzenleBaslat(item.id, item.ad)}>
                <Text style={s.duzenleBtnText}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.silBtn} onPress={() => handleSil(item.id, item.ad)}>
                <Text style={s.silBtnText}>✕</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {acik && (
          <View style={s.expandBox}>
            {acikLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : acikIlanlar.length === 0 ? (
              <Text style={s.emptyMini}>Bağlı ilan yok.</Text>
            ) : (
              <>
                <View style={s.toplubar}>
                  <TouchableOpacity onPress={tumunuSec} style={s.tumSecBtn}>
                    <Text style={s.tumSecText}>
                      {secilen.length === acikIlanlar.length ? '☑' : '☐'} Tümü ({secilen.length}/{acikIlanlar.length})
                    </Text>
                  </TouchableOpacity>
                  {secilen.length > 0 && (
                    <TouchableOpacity onPress={topluCikar} style={s.topluBtn}>
                      <Text style={s.topluBtnText}>Kaldır ({secilen.length})</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {acikIlanlar.map(renderIlan)}
              </>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.geri}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Özellik Yönetimi</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.ekleRow}>
          <TextInput
            style={s.input}
            placeholder="Yeni özellik ekle..."
            placeholderTextColor={Colors.outlineVariant}
            value={yeni}
            onChangeText={setYeni}
            onSubmitEditing={handleEkle}
            returnKeyType="done"
          />
          <TouchableOpacity style={s.ekleBtn} onPress={handleEkle} disabled={ekliyor}>
            {ekliyor ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.ekleBtnText}>Ekle</Text>}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : ozellikler.length === 0 ? (
          <View style={s.center}>
            <Text style={s.emptyText}>Henüz özellik eklenmedi</Text>
            <Text style={s.emptySubText}>İlanlarınızda kullanabileceğiniz özellikler ekleyin</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.liste}>
            {ozellikler.map(renderOzellik)}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <IlanDetayPopup ilanId={popupId} onClose={() => setPopupId(null)} />
      <PersistentTabBar />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceContainerLow,
  },
  geri: { fontSize: 22, color: Colors.onSurface, width: 32 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  ekleRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.xl },
  input: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12,
    fontSize: 14, color: Colors.onSurface,
  },
  ekleBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: 18, justifyContent: 'center' },
  ekleBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  liste: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.sm },
  ozellikWrap: { gap: 0 },
  ozellikItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
  },
  adRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  expandIcon: { fontSize: 13, color: Colors.outlineVariant, width: 14 },
  ozellikAd: { flex: 1, fontSize: 15, color: Colors.onSurface, fontWeight: '500' },
  sayiBadge: { backgroundColor: 'rgba(234,179,8,0.18)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, minWidth: 28, alignItems: 'center' },
  sayiBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.onSurface },
  sayiBadgeBos: { backgroundColor: Colors.surfaceContainerLow },
  sayiBadgeBosText: { color: Colors.outlineVariant },
  duzenleInput: {
    flex: 1, fontSize: 15, color: Colors.onSurface, fontWeight: '500',
    paddingVertical: 0, paddingHorizontal: 8,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: 8, height: 36,
  },
  duzenleBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: Colors.outlineVariant, alignItems: 'center', justifyContent: 'center' },
  duzenleBtnText: { color: Colors.onSurface, fontSize: 14, fontWeight: '700' },
  kaydetBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: 'rgba(34,197,94,0.18)', alignItems: 'center', justifyContent: 'center' },
  kaydetBtnText: { color: '#16a34a', fontSize: 14, fontWeight: '700' },
  iptalBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  iptalBtnText: { color: Colors.onSurfaceVariant, fontSize: 14, fontWeight: '700' },
  silBtn: { width: 32, height: 32, borderRadius: Radius.full, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' },
  silBtnText: { color: '#fca5a5', fontSize: 14, fontWeight: '700' },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.onSurface },
  emptySubText: { fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.xl },

  expandBox: {
    backgroundColor: Colors.surfaceContainerLow, borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, marginTop: -8, paddingTop: 14, gap: 8,
  },
  toplubar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  tumSecBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  tumSecText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  topluBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 6 },
  topluBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  ilanKart: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceContainerLow,
    overflow: 'hidden',
  },
  ilanKartSecili: { borderColor: Colors.primary, borderWidth: 1.5 },
  cbWrap: { paddingHorizontal: 10, paddingVertical: 12 },
  cbText: { fontSize: 16, color: Colors.onSurface },
  ilanContent: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, paddingRight: 8, minWidth: 0 },
  ilanFotoWrap: { width: 88, height: 66, borderRadius: 8, backgroundColor: Colors.surfaceContainerLow, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ilanFoto: { width: 88, height: 66 },
  basRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  pnBadge: { backgroundColor: Colors.surfaceContainerLow, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  pnText: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant },
  ilanBaslik: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  metaRow: { flexDirection: 'column', gap: 2, alignItems: 'flex-start' },
  fiyat: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  meta: { fontSize: 12, color: Colors.onSurfaceVariant },
  kaldirBtn: {
    borderLeftWidth: 1, borderLeftColor: Colors.surfaceContainerLow,
    paddingHorizontal: 14, paddingVertical: 18,
  },
  kaldirBtnText: { fontSize: 12, fontWeight: '700', color: '#E53935' },
  emptyMini: { fontSize: 13, color: Colors.outlineVariant, textAlign: 'center', paddingVertical: 4 },
});
